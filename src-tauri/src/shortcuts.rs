use crate::windows;
use tauri::{plugin::TauriPlugin, AppHandle, Emitter, Wry};
use tauri_plugin_global_shortcut::{Builder, Code, GlobalShortcutExt, Modifiers, ShortcutState};

pub const TOGGLE_DRAWING: &str = "ctrl+alt+KeyD";
#[cfg(target_os = "macos")]
const DRAWING_SHORTCUTS: [&str; 3] = ["Escape", "super+KeyZ", "super+shift+KeyZ"];
#[cfg(target_os = "windows")]
const DRAWING_SHORTCUTS: [&str; 3] = ["Escape", "ctrl+KeyZ", "ctrl+shift+KeyZ"];

pub fn set_annotation_shortcuts(app: &AppHandle, enabled: bool) -> Result<(), String> {
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
        .with_shortcuts([TOGGLE_DRAWING])
        .expect("valid shortcut")
        .with_handler(|app, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            let result = match shortcut.key {
                Code::Escape => windows::set_click_through(app, true),
                Code::KeyZ => app
                    .emit(
                        if shortcut.mods.contains(Modifiers::SHIFT) {
                            "annotations:redo"
                        } else {
                            "annotations:undo"
                        },
                        (),
                    )
                    .map_err(|e| e.to_string()),
                _ => windows::toggle_click_through(app),
            };
            if let Err(err) = result {
                eprintln!("[shortcut] {err}");
            }
        })
        .build()
}
