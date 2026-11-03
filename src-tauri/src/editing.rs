use crate::agenda::{self, AgendaItem, AgendaState, Corner, Section, StickyStyle};
use serde::Deserialize;
use tauri::{AppHandle, Manager};

#[derive(Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum AgendaEdit {
    AddSection {
        id: String,
    },
    RenameSection {
        section_id: String,
        title: String,
    },
    DeleteSection {
        section_id: String,
    },
    MoveSection {
        section_id: String,
        before_id: Option<String>,
    },
    SelectSection {
        section_id: String,
    },
    AddItem {
        section_id: String,
        id: String,
    },
    EditItem {
        section_id: String,
        item_id: String,
        text: Option<String>,
        optional: Option<bool>,
        details: Option<Vec<String>>,
    },
    DeleteItem {
        section_id: String,
        item_id: String,
    },
    ResetChecklist,
    Style {
        style: StickyStyle,
    },
    Opacity {
        opacity: u8,
    },
    Corner {
        corner: Corner,
    },
    Compact {
        compact: bool,
    },
}

fn required(text: String, label: &str) -> Result<String, String> {
    let value = text.trim();
    if value.is_empty() {
        return Err(format!("{label} cannot be empty"));
    }
    Ok(value.to_owned())
}

impl AgendaState {
    fn section_mut(&mut self, id: &str) -> Result<&mut Section, String> {
        self.agenda
            .sections
            .iter_mut()
            .find(|s| s.id == id)
            .ok_or("The agenda section no longer exists".into())
    }
    pub fn edit(&mut self, edit: AgendaEdit) -> Result<bool, String> {
        let previous = self.clone();
        let current_id = self
            .agenda
            .sections
            .get(self.agenda.current_index)
            .map(|s| s.id.clone());
        match edit {
            AgendaEdit::AddSection { id } => {
                self.agenda.sections.push(Section {
                    id: required(id, "Section ID")?,
                    title: "New section".into(),
                    items: vec![],
                });
            }
            AgendaEdit::RenameSection { section_id, title } => {
                self.section_mut(&section_id)?.title = required(title, "Section title")?
            }
            AgendaEdit::DeleteSection { section_id } => {
                let index = self
                    .agenda
                    .sections
                    .iter()
                    .position(|s| s.id == section_id)
                    .ok_or("The agenda section no longer exists")?;
                self.agenda.sections.remove(index);
            }
            AgendaEdit::MoveSection {
                section_id,
                before_id,
            } => {
                if before_id.as_ref() == Some(&section_id) {
                    return Ok(false);
                }
                if let Some(id) = &before_id {
                    if !self.agenda.sections.iter().any(|s| &s.id == id) {
                        return Err("The destination section no longer exists".into());
                    }
                }
                let index = self
                    .agenda
                    .sections
                    .iter()
                    .position(|s| s.id == section_id)
                    .ok_or("The agenda section no longer exists")?;
                let section = self.agenda.sections.remove(index);
                let destination = before_id
                    .and_then(|id| self.agenda.sections.iter().position(|s| s.id == id))
                    .unwrap_or(self.agenda.sections.len());
                self.agenda.sections.insert(destination, section);
            }
            AgendaEdit::SelectSection { section_id } => {
                self.agenda.current_index = self
                    .agenda
                    .sections
                    .iter()
                    .position(|s| s.id == section_id)
                    .ok_or("The agenda section no longer exists")?;
                return Ok(*self != previous);
            }
            AgendaEdit::AddItem { section_id, id } => {
                self.section_mut(&section_id)?.items.push(AgendaItem {
                    id: required(id, "Item ID")?,
                    text: "New item".into(),
                    optional: false,
                    details: vec![],
                    done: false,
                })
            }
            AgendaEdit::EditItem {
                section_id,
                item_id,
                text,
                optional,
                details,
            } => {
                let item = self
                    .section_mut(&section_id)?
                    .items
                    .iter_mut()
                    .find(|i| i.id == item_id)
                    .ok_or("The checklist item no longer exists")?;
                if let Some(text) = text {
                    item.text = required(text, "Item text")?;
                }
                if let Some(optional) = optional {
                    item.optional = optional;
                }
                if let Some(details) = details {
                    item.details = details
                        .into_iter()
                        .map(|s| s.trim().to_owned())
                        .filter(|s| !s.is_empty())
                        .collect();
                }
            }
            AgendaEdit::DeleteItem {
                section_id,
                item_id,
            } => {
                let items = &mut self.section_mut(&section_id)?.items;
                let index = items
                    .iter()
                    .position(|i| i.id == item_id)
                    .ok_or("The checklist item no longer exists")?;
                items.remove(index);
            }
            AgendaEdit::ResetChecklist => {
                for section in &mut self.agenda.sections {
                    for item in &mut section.items {
                        item.done = false;
                    }
                }
            }
            AgendaEdit::Style { style } => {
                if self.settings.style != style {
                    self.settings.style = style;
                    match style {
                        StickyStyle::Frosted => self.settings.opacity = 72,
                        StickyStyle::Clear => self.settings.opacity = 35,
                        StickyStyle::Paper => (),
                    }
                }
            }
            AgendaEdit::Opacity { opacity } => {
                if opacity > 100 {
                    return Err("Sticky opacity must be between 0 and 100".into());
                }
                if self.settings.style == StickyStyle::Paper {
                    return Ok(false);
                }
                self.settings.opacity = opacity;
            }
            AgendaEdit::Corner { corner } => self.settings.corner = corner,
            AgendaEdit::Compact { compact } => self.settings.compact = compact,
        }
        self.agenda.current_index = current_id
            .and_then(|id| self.agenda.sections.iter().position(|s| s.id == id))
            .unwrap_or(
                self.agenda
                    .current_index
                    .min(self.agenda.sections.len().saturating_sub(1)),
            );
        Ok(*self != previous)
    }
}

pub fn apply(app: &AppHandle, edit: AgendaEdit) -> Result<AgendaState, String> {
    let preset = matches!(edit, AgendaEdit::Corner { .. });
    let manager = app.state::<agenda::AgendaManager>();
    let (state, modified) = manager.update(|state| state.edit(edit))?;
    if preset {
        crate::windows::reset_sticky_position(app)?;
    }
    if modified {
        agenda::changed(app, &state)?;
    }
    crate::windows::refresh_sticky(app)?;
    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn editor_ipc_accepts_camel_case_partial_fields_and_keeps_saved_checks() {
        let mut state = AgendaState::default();
        state.agenda.sections[2].items[0].done = true;
        let edit: AgendaEdit = serde_json::from_value(serde_json::json!({
            "type": "editItem", "sectionId": "architecture", "itemId": "request-path", "optional": true
        })).unwrap();
        state.edit(edit).unwrap();
        assert!(state.agenda.sections[2].items[0].done);
        assert!(state.agenda.sections[2].items[0].optional);
        assert_eq!(
            state.agenda.sections[2].items[0].text,
            "Walk the request path from client to services"
        );
        state.validate().unwrap();
        let restored: AgendaState =
            serde_json::from_value(serde_json::to_value(&state).unwrap()).unwrap();
        assert_eq!(restored, state);
    }
    #[test]
    fn reordering_and_removing_other_sections_preserves_current_identity() {
        let mut s = AgendaState::default();
        s.edit(AgendaEdit::MoveSection {
            section_id: "architecture".into(),
            before_id: Some("intro".into()),
        })
        .unwrap();
        assert_eq!(s.agenda.current_index, 0);
        s.edit(AgendaEdit::DeleteSection {
            section_id: "problem".into(),
        })
        .unwrap();
        assert_eq!(s.agenda.sections[s.agenda.current_index].id, "architecture");
    }
    #[test]
    fn deletion_selects_next_then_previous_then_empty() {
        let mut s = AgendaState::default();
        s.edit(AgendaEdit::DeleteSection {
            section_id: "architecture".into(),
        })
        .unwrap();
        assert_eq!(s.agenda.sections[s.agenda.current_index].id, "demo");
        while let Some(section) = s.agenda.sections.last() {
            s.edit(AgendaEdit::DeleteSection {
                section_id: section.id.clone(),
            })
            .unwrap();
            s.validate().unwrap();
        }
        assert_eq!(s.agenda.current_index, 0);
        s.edit(AgendaEdit::AddSection { id: "new".into() }).unwrap();
        assert_eq!(s.agenda.sections[0].title, "New section");
    }
    #[test]
    fn field_edits_preserve_checks_and_other_fields_and_reset_clears_all() {
        let mut s = AgendaState::default();
        s.agenda.sections[2].items[0].done = true;
        s.edit(AgendaEdit::EditItem {
            section_id: "architecture".into(),
            item_id: "request-path".into(),
            text: Some(" Renamed ".into()),
            optional: None,
            details: Some(vec![" One ".into(), " ".into(), "Two".into()]),
        })
        .unwrap();
        let item = &s.agenda.sections[2].items[0];
        assert!(item.done);
        assert_eq!(item.text, "Renamed");
        assert_eq!(item.details, ["One", "Two"]);
        s.edit(AgendaEdit::ResetChecklist).unwrap();
        assert!(s
            .agenda
            .sections
            .iter()
            .all(|s| s.items.iter().all(|i| !i.done)));
    }
    #[test]
    fn style_defaults_and_paper_opacity_and_invalid_edits() {
        let mut s = AgendaState::default();
        s.edit(AgendaEdit::Style {
            style: StickyStyle::Clear,
        })
        .unwrap();
        assert_eq!(s.settings.opacity, 35);
        s.edit(AgendaEdit::Style {
            style: StickyStyle::Paper,
        })
        .unwrap();
        assert!(!s.edit(AgendaEdit::Opacity { opacity: 10 }).unwrap());
        s.edit(AgendaEdit::Style {
            style: StickyStyle::Frosted,
        })
        .unwrap();
        assert_eq!(s.settings.opacity, 72);
        assert!(s
            .edit(AgendaEdit::RenameSection {
                section_id: "intro".into(),
                title: " ".into()
            })
            .is_err());
        let previous = s.clone();
        assert!(s
            .edit(AgendaEdit::MoveSection {
                section_id: "intro".into(),
                before_id: Some("missing".into())
            })
            .is_err());
        assert_eq!(s, previous);
    }
}
