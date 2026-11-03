use crate::{agenda, displays, windows};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashSet},
    str::FromStr,
    sync::Mutex,
};
use tauri::{plugin::TauriPlugin, AppHandle, Emitter, Manager, Wry};
use tauri_plugin_global_shortcut::{
    Builder, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};
use tauri_plugin_store::StoreExt;

#[cfg(target_os = "macos")]
const DRAWING_SHORTCUTS: [&str; 3] = ["Escape", "super+KeyZ", "super+shift+KeyZ"];
#[cfg(target_os = "windows")]
const DRAWING_SHORTCUTS: [&str; 3] = ["Escape", "ctrl+KeyZ", "ctrl+shift+KeyZ"];
const KEY: &str = "shortcuts";
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Action {
    Next,
    Previous,
    ToggleDrawing,
    Clear,
    ToggleSticky,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub bindings: BTreeMap<Action, String>,
    pub error: Option<String>,
    pub revision: u64,
}
pub struct ShortcutSettings(Mutex<Snapshot>, Mutex<Option<Vec<String>>>);
fn defaults() -> BTreeMap<Action, String> {
    [
        (Action::Next, "ctrl+alt+ArrowRight"),
        (Action::Previous, "ctrl+alt+ArrowLeft"),
        (Action::ToggleDrawing, "ctrl+alt+KeyD"),
        (Action::Clear, "ctrl+alt+KeyC"),
        (Action::ToggleSticky, "ctrl+alt+KeyS"),
    ]
    .into_iter()
    .map(|(a, s)| (a, s.to_owned()))
    .collect()
}
fn validate(bindings: &BTreeMap<Action, String>) -> Result<BTreeMap<Action, String>, String> {
    if bindings.len() != defaults().len() {
        return Err("Configure all five shortcuts".into());
    }
    let reserved: HashSet<u32> = DRAWING_SHORTCUTS
        .iter()
        .map(|s| Shortcut::from_str(s).unwrap().id())
        .collect();
    let mut seen = HashSet::new();
    let mut normalized = BTreeMap::new();
    for (&action, binding) in bindings {
        let shortcut = Shortcut::from_str(binding).map_err(|e| format!("Invalid shortcut: {e}"))?;
        if !shortcut
            .mods
            .intersects(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER)
        {
            return Err("Include Ctrl, Option/Alt or Command/Meta in a shortcut".into());
        }
        if reserved.contains(&shortcut.id()) {
            return Err("Esc and annotation undo/redo shortcuts are reserved".into());
        }
        if !seen.insert(shortcut.id()) {
            return Err("That shortcut is already assigned to another Waypoint action".into());
        }
        normalized.insert(action, shortcut.to_string());
    }
    Ok(normalized)
}
pub fn init(app: &AppHandle) -> Result<(), String> {
    let store = app
        .store(agenda::SETTINGS_FILE)
        .map_err(|e| e.to_string())?;
    let loaded = store
        .get(KEY)
        .map(serde_json::from_value::<BTreeMap<Action, String>>)
        .transpose()
        .map_err(|e| e.to_string())
        .and_then(|value| validate(&value.unwrap_or_else(defaults)));
    let (bindings, mut errors) = match loaded {
        Ok(bindings) => (bindings, Vec::new()),
        Err(error) => (
            validate(&defaults())?,
            vec![format!(
                "Saved shortcuts could not load: {error}. Defaults are active where available."
            )],
        ),
    };
    for binding in bindings.values() {
        if let Err(error) = app.global_shortcut().register(binding.as_str()) {
            errors.push(format!(
                "Cannot register {binding}: {error}. Edit this binding in setup."
            ));
        }
    }
    app.manage(ShortcutSettings(
        Mutex::new(Snapshot {
            bindings,
            error: if errors.is_empty() {
                None
            } else {
                Some(errors.join("\n"))
            },
            revision: 0,
        }),
        Mutex::new(None),
    ));
    Ok(())
}
pub fn get(app: &AppHandle) -> Snapshot {
    app.state::<ShortcutSettings>().0.lock().unwrap().clone()
}
pub fn update(app: &AppHandle, action: Action, binding: String) -> Result<Snapshot, String> {
    let state = app.state::<ShortcutSettings>();
    let mut current = state.0.lock().unwrap();
    if state.1.lock().unwrap().is_some() {
        return Err("Finish recording before applying a shortcut".into());
    }
    let mut next = current.bindings.clone();
    next.insert(action, binding);
    next = validate(&next)?;
    let old = current
        .bindings
        .get(&action)
        .ok_or("Unknown shortcut action")?
        .clone();
    let new = next.get(&action).ok_or("Unknown shortcut action")?.clone();
    let keys = app.global_shortcut();
    let old_active = keys.is_registered(old.as_str());
    if new == old && old_active {
        return Ok(current.clone());
    }
    keys.register(new.as_str()).map_err(|e| {
        format!("Cannot register {new}; it may be reserved or in use. Previous binding kept. {e}")
    })?;
    let rollback = || -> Result<(), String> {
        keys.unregister(new.as_str()).map_err(|e| e.to_string())?;
        if old_active && !keys.is_registered(old.as_str()) {
            keys.register(old.as_str())
                .map_err(|e| format!("Previous binding could not be restored: {e}"))?;
        }
        Ok(())
    };
    if old_active {
        if let Err(error) = keys.unregister(old.as_str()) {
            let recovery = rollback();
            return Err(format!(
                "Cannot replace previous shortcut: {error}. Recovery: {recovery:?}"
            ));
        }
    }
    let store = app
        .store(agenda::SETTINGS_FILE)
        .map_err(|e| e.to_string())?;
    let previous = store.get(KEY);
    store.set(KEY, serde_json::to_value(&next).map_err(|e| e.to_string())?);
    if let Err(error) = store.save() {
        match previous {
            Some(value) => store.set(KEY, value),
            None => {
                store.delete(KEY);
            }
        }
        let recovery = rollback();
        return Err(format!(
            "Could not save shortcuts: {error}. Recovery: {recovery:?}"
        ));
    }
    current.bindings = next;
    let unavailable: Vec<_> = current
        .bindings
        .values()
        .filter(|s| !keys.is_registered(s.as_str()))
        .cloned()
        .collect();
    current.error = if unavailable.is_empty() {
        None
    } else {
        Some(format!("Unavailable shortcuts: {}", unavailable.join(", ")))
    };
    current.revision += 1;
    let snapshot = current.clone();
    drop(current);
    app.emit("shortcuts:changed", &snapshot)
        .map_err(|e| e.to_string())?;
    crate::tray::sync(app);
    Ok(snapshot)
}
pub fn set_annotation_shortcuts(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let enabled = enabled && !crate::setup::is_open(app);
    let shortcuts = app.global_shortcut();
    let mut changed = Vec::new();
    for binding in DRAWING_SHORTCUTS {
        if shortcuts.is_registered(binding) == enabled {
            continue;
        }
        let result = if enabled {
            shortcuts.register(binding)
        } else {
            shortcuts.unregister(binding)
        };
        if let Err(error) = result {
            for previous in changed.into_iter().rev() {
                let rollback = if enabled {
                    shortcuts.unregister(previous)
                } else {
                    shortcuts.register(previous)
                };
                if let Err(rollback_error) = rollback {
                    eprintln!("[shortcut] rollback: {rollback_error}");
                }
            }
            return Err(format!(
                "Cannot {} {binding}: {error}",
                if enabled { "register" } else { "release" }
            ));
        }
        changed.push(binding);
    }
    Ok(())
}

pub fn plugin() -> TauriPlugin<Wry> {
    Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            let snapshot = get(app);
            let action = snapshot
                .bindings
                .iter()
                .find(|(_, s)| {
                    Shortcut::from_str(s)
                        .map(|key| key.id() == shortcut.id())
                        .unwrap_or(false)
                })
                .map(|(action, _)| *action);
            let result = match action {
                Some(Action::Next) => agenda::navigate(app, agenda::Direction::Next).map(|_| ()),
                Some(Action::Previous) => {
                    agenda::navigate(app, agenda::Direction::Previous).map(|_| ())
                }
                Some(Action::ToggleSticky) => agenda::toggle(app).map(|_| ()),
                Some(Action::ToggleDrawing) => {
                    displays::invoke_display(app).and_then(|()| windows::toggle_click_through(app))
                }
                Some(Action::Clear) => displays::history_action(app, "annotations:clear"),
                None if shortcut.key == tauri_plugin_global_shortcut::Code::Escape => {
                    windows::set_click_through(app, true)
                }
                None => displays::history_action(
                    app,
                    if shortcut.mods.contains(Modifiers::SHIFT) {
                        "annotations:redo"
                    } else {
                        "annotations:undo"
                    },
                ),
            };
            if let Err(error) = result {
                eprintln!("[shortcut] {error}");
                let _ = app.emit("app:error", error);
            }
        })
        .build()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn aliases_cannot_assign_the_same_key_twice() {
        let mut bindings = defaults();
        bindings.insert(Action::Clear, "control+alt+KeyD".into());
        assert!(validate(&bindings)
            .unwrap_err()
            .contains("already assigned"));
    }
    #[test]
    fn reserved_and_unmodified_keys_are_rejected() {
        for binding in [DRAWING_SHORTCUTS[1], "KeyA", "shift+KeyB", "Escape"] {
            let mut bindings = defaults();
            bindings.insert(Action::Clear, binding.into());
            assert!(validate(&bindings).is_err());
        }
        assert!(validate(&defaults()).is_ok());
    }
}

pub fn record(app: &AppHandle, active: bool) -> Result<(), String> {
    let state = app.state::<ShortcutSettings>();
    let snapshot = get(app);
    let keys = app.global_shortcut();
    let mut recording = state.1.lock().unwrap();
    if active {
        if recording.is_some() {
            return Ok(());
        }
        let mut released: Vec<String> = Vec::new();
        for binding in snapshot
            .bindings
            .values()
            .filter(|binding| keys.is_registered(binding.as_str()))
        {
            if let Err(error) = keys.unregister(binding.as_str()) {
                for previous in &released {
                    let _ = keys.register(previous.as_str());
                }
                return Err(format!("Cannot pause shortcuts for recording: {error}"));
            }
            released.push(binding.clone());
        }
        *recording = Some(released);
    } else if let Some(released) = recording.take() {
        let errors: Vec<_> = released
            .into_iter()
            .filter_map(|binding| {
                keys.register(binding.as_str())
                    .err()
                    .map(|e| format!("{binding}: {e}"))
            })
            .collect();
        if !errors.is_empty() {
            drop(recording);
            let error = format!("Could not restore shortcuts: {}", errors.join(", "));
            app.emit("app:error", &error).map_err(|e| e.to_string())?;
            return Err(error);
        }
    }
    Ok(())
}
