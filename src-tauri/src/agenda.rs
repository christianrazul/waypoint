use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, Wry};
use tauri_plugin_store::{Store, StoreExt};

pub const SETTINGS_FILE: &str = "settings.json";
const STATE_KEY: &str = "agendaState";

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgendaItem {
    pub id: String,
    pub text: String,
    pub optional: bool,
    pub details: Vec<String>,
    pub done: bool,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Section {
    pub id: String,
    pub title: String,
    pub items: Vec<AgendaItem>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Agenda {
    pub id: String,
    pub name: String,
    pub sections: Vec<Section>,
    pub current_index: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StickyStyle {
    Frosted,
    Clear,
    Paper,
}
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Corner {
    Tl,
    Tr,
    Bl,
    Br,
}
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Display {
    Primary,
    Cursor,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StickySettings {
    pub enabled: bool,
    pub style: StickyStyle,
    pub opacity: u8,
    pub corner: Corner,
    pub accent: String,
    pub compact: bool,
    pub display: Display,
    /// Text and layout size in percent, so the note stays readable on a projector.
    #[serde(default = "default_scale")]
    pub scale: u16,
    /// Header text above the current section, "YOU ARE HERE" by default.
    #[serde(default = "default_label")]
    pub label: String,
}
pub const SCALE_RANGE: std::ops::RangeInclusive<u16> = 75..=200;
pub const LABEL_MAX_CHARS: usize = 40;
fn default_scale() -> u16 {
    100
}
pub fn default_label() -> String {
    "YOU ARE HERE".into()
}
impl Default for StickySettings {
    fn default() -> Self {
        Self {
            enabled: false,
            style: StickyStyle::Frosted,
            opacity: 72,
            corner: Corner::Bl,
            accent: "#FFD25A".into(),
            compact: false,
            display: Display::Primary,
            scale: default_scale(),
            label: default_label(),
        }
    }
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgendaState {
    pub agenda: Agenda,
    pub settings: StickySettings,
    pub revision: u64,
}

impl Default for AgendaState {
    fn default() -> Self {
        serde_json::from_str(include_str!("../../src/shared/seed-agenda.json"))
            .expect("Bundled seed agenda must be valid")
    }
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Direction {
    Previous,
    Next,
}

impl AgendaState {
    pub fn validate(&self) -> Result<(), String> {
        let agenda = &self.agenda;
        if (agenda.sections.is_empty() && agenda.current_index != 0)
            || (!agenda.sections.is_empty() && agenda.current_index >= agenda.sections.len())
        {
            return Err("Saved agenda has an invalid current section".into());
        }
        let mut section_ids = std::collections::HashSet::new();
        for section in &agenda.sections {
            if section.id.is_empty() || !section_ids.insert(&section.id) {
                return Err("Saved agenda has duplicate or empty section IDs".into());
            }
            let mut item_ids = std::collections::HashSet::new();
            for item in &section.items {
                if item.id.is_empty() || !item_ids.insert(&item.id) {
                    return Err("Saved agenda has duplicate or empty item IDs".into());
                }
            }
        }
        if self.settings.opacity > 100 {
            return Err("Sticky opacity must be between 0 and 100".into());
        }
        if !SCALE_RANGE.contains(&self.settings.scale) {
            return Err("Sticky text size must be between 75% and 200%".into());
        }
        if self.settings.label.trim().is_empty()
            || self.settings.label.chars().count() > LABEL_MAX_CHARS
        {
            return Err(format!(
                "Sticky label must be 1 to {LABEL_MAX_CHARS} characters"
            ));
        }
        let color = &self.settings.accent;
        if color.len() != 7
            || !color.starts_with('#')
            || !color[1..].bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err("Sticky accent must be a six-digit hex color".into());
        }
        Ok(())
    }
    fn navigate(&mut self, direction: Direction) -> bool {
        let current = self.agenda.current_index;
        let next = match direction {
            Direction::Previous => current.saturating_sub(1),
            Direction::Next => current
                .saturating_add(1)
                .min(self.agenda.sections.len().saturating_sub(1)),
        };
        self.agenda.current_index = next;
        next != current
    }
    fn set_done(&mut self, section_id: &str, item_id: &str, done: bool) -> Result<bool, String> {
        let section = self
            .agenda
            .sections
            .iter_mut()
            .find(|section| section.id == section_id)
            .ok_or("The agenda section no longer exists")?;
        let item = section
            .items
            .iter_mut()
            .find(|item| item.id == item_id)
            .ok_or("The checklist item no longer exists")?;
        let changed = item.done != done;
        item.done = done;
        Ok(changed)
    }
}

pub struct AgendaManager {
    store: Arc<Store<Wry>>,
    transaction: Mutex<()>,
}
impl AgendaManager {
    fn read(&self) -> Result<AgendaState, String> {
        let value = self.store.get(STATE_KEY).ok_or("Saved agenda is missing")?;
        let state: AgendaState = serde_json::from_value(value)
            .map_err(|error| format!("Could not read saved agenda: {error}"))?;
        state.validate()?;
        Ok(state)
    }
    pub(crate) fn update(
        &self,
        change: impl FnOnce(&mut AgendaState) -> Result<bool, String>,
    ) -> Result<(AgendaState, bool), String> {
        let _transaction = self
            .transaction
            .lock()
            .map_err(|_| "Agenda storage is unavailable")?;
        let previous = self.read()?;
        let mut next = previous.clone();
        if !change(&mut next)? {
            return Ok((previous, false));
        }
        next.validate()?;
        next.revision = next
            .revision
            .checked_add(1)
            .ok_or("Agenda revision limit reached")?;
        let value = serde_json::to_value(&next).map_err(|error| error.to_string())?;
        self.store.set(STATE_KEY, value);
        if let Err(error) = self.store.save() {
            self.store.set(
                STATE_KEY,
                serde_json::to_value(&previous).map_err(|error| error.to_string())?,
            );
            return Err(format!("Could not save agenda: {error}"));
        }
        Ok((next, true))
    }
}

pub fn init(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let store = app
        .store_builder(SETTINGS_FILE)
        .auto_save(std::time::Duration::from_millis(300))
        .build()?;
    match store.reload() {
        Ok(()) => (),
        Err(tauri_plugin_store::Error::Io(error))
            if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    if !store.has(STATE_KEY) {
        store.set(STATE_KEY, serde_json::to_value(AgendaState::default())?);
        store.save()?;
    }
    let manager = AgendaManager {
        store,
        transaction: Mutex::new(()),
    };
    manager.read().map_err(std::io::Error::other)?;
    app.manage(manager);
    Ok(())
}

pub fn get(app: &AppHandle) -> Result<AgendaState, String> {
    let manager = app
        .try_state::<AgendaManager>()
        .ok_or("Agenda is still starting")?;
    let _transaction = manager
        .transaction
        .lock()
        .map_err(|_| "Agenda storage is unavailable")?;
    manager.read()
}
pub(crate) fn changed(app: &AppHandle, state: &AgendaState) -> Result<(), String> {
    app.emit("agenda:changed", state.revision)
        .map_err(|error| error.to_string())
}

pub fn toggle(app: &AppHandle) -> Result<AgendaState, String> {
    crate::displays::invoke_display(app)?;
    crate::windows::end_text_edit(app)?;
    let manager = app
        .try_state::<AgendaManager>()
        .ok_or("Agenda is still starting")?;
    let (state, _) = manager.update(|state| {
        state.settings.enabled = !state.settings.enabled;
        Ok(true)
    })?;
    if let Err(error) = crate::windows::sync_sticky(app, &state) {
        let (restored, _) = manager.update(|state| {
            state.settings.enabled = !state.settings.enabled;
            Ok(true)
        })?;
        let _ = crate::windows::sync_sticky(app, &restored);
        let _ = changed(app, &restored);
        return Err(error);
    }
    crate::tray::sync(app);
    changed(app, &state)?;
    app.emit("sticky:toggle", state.settings.enabled)
        .map_err(|error| error.to_string())?;
    if state.settings.enabled && state.agenda.sections.is_empty() {
        crate::setup::open(app)?;
    }
    Ok(state)
}
pub fn navigate(app: &AppHandle, direction: Direction) -> Result<AgendaState, String> {
    crate::displays::invoke_display(app)?;
    crate::windows::end_text_edit(app)?;
    let manager = app
        .try_state::<AgendaManager>()
        .ok_or("Agenda is still starting")?;
    let (state, modified) = manager.update(|state| Ok(state.navigate(direction)))?;
    if modified {
        changed(app, &state)?;
    }
    Ok(state)
}
pub fn set_done(
    app: &AppHandle,
    section_id: &str,
    item_id: &str,
    done: bool,
) -> Result<AgendaState, String> {
    crate::displays::invoke_display(app)?;
    crate::windows::end_text_edit(app)?;
    let manager = app
        .try_state::<AgendaManager>()
        .ok_or("Agenda is still starting")?;
    let (state, modified) = manager.update(|state| state.set_done(section_id, item_id, done))?;
    if modified {
        changed(app, &state)?;
    }
    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn first_run_is_hidden_at_architecture_with_the_required_checklist() {
        let state = AgendaState::default();
        assert!(!state.settings.enabled);
        assert_eq!(state.agenda.current_index, 2);
        assert_eq!(state.agenda.sections[2].items.len(), 3);
        assert!(state.agenda.sections[2].items[2].optional);
        assert_eq!(
            state.agenda.sections[2].items[0].details,
            ["Point at the gateway box"]
        );
        assert_eq!(state.settings.opacity, 72);
        assert_eq!(state.settings.scale, 100);
        state.validate().unwrap();
    }
    #[test]
    fn navigation_stops_at_both_ends_and_empty_agendas() {
        let mut state = AgendaState::default();
        for _ in 0..20 {
            state.navigate(Direction::Next);
        }
        assert_eq!(state.agenda.current_index, 4);
        assert!(!state.navigate(Direction::Next));
        for _ in 0..20 {
            state.navigate(Direction::Previous);
        }
        assert_eq!(state.agenda.current_index, 0);
        assert!(!state.navigate(Direction::Previous));
        state.agenda.sections.clear();
        assert!(!state.navigate(Direction::Next));
        assert!(!state.navigate(Direction::Previous));
        state.validate().unwrap();
    }
    #[test]
    fn checklist_updates_target_the_original_section_without_auto_advancing() {
        let mut state = AgendaState::default();
        for id in ["request-path", "auth", "rate-limiting"] {
            state.set_done("architecture", id, true).unwrap();
        }
        assert_eq!(state.agenda.current_index, 2);
        state.navigate(Direction::Next);
        assert!(state.set_done("architecture", "auth", false).unwrap());
        assert_eq!(state.agenda.current_index, 3);
        assert!(!state.agenda.sections[2].items[1].done);
        assert!(!state.set_done("architecture", "auth", false).unwrap());
    }
    #[test]
    fn restart_round_trip_preserves_visibility_navigation_and_checks() {
        let mut state = AgendaState::default();
        state.settings.enabled = true;
        state.set_done("architecture", "auth", true).unwrap();
        state.navigate(Direction::Next);
        state.revision = 5;
        let saved = serde_json::to_string(&state).unwrap();
        let restored: AgendaState = serde_json::from_str(&saved).unwrap();
        assert_eq!(restored, state);
        restored.validate().unwrap();
    }
    #[test]
    fn unknown_items_and_invalid_saved_state_fail_without_mutating_checks() {
        let mut state = AgendaState::default();
        let previous = state.clone();
        assert!(state.set_done("missing", "auth", true).is_err());
        assert!(state.set_done("architecture", "missing", true).is_err());
        assert_eq!(state, previous);
        state.agenda.current_index = 100;
        assert!(state.validate().is_err());
        state.agenda.current_index = 0;
        state.settings.opacity = 101;
        assert!(state.validate().is_err());
        state.settings.opacity = 50;
        state.settings.scale = 300;
        assert!(state.validate().is_err());
    }
}
