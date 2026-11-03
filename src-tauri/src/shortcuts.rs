use crate::windows;
use tauri::{plugin::TauriPlugin, AppHandle, Wry};
use tauri_plugin_global_shortcut::{Builder, Code, GlobalShortcutExt, ShortcutState};

pub const TOGGLE_DRAWING: &str = "ctrl+alt+KeyD";

pub fn set_escape(app: &AppHandle, armed: bool) -> Result<(), String> {
    let shortcuts = app.global_shortcut();
    if armed && !shortcuts.is_registered("Escape") {
        shortcuts
            .register("Escape")
            .map_err(|e| format!("Cannot register Escape: {e}"))?;
    } else if !armed && shortcuts.is_registered("Escape") {
        shortcuts
            .unregister("Escape")
            .map_err(|e| format!("Cannot release Escape: {e}"))?;
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
            let result = if shortcut.key == Code::Escape {
                windows::set_click_through(app, true)
            } else {
                windows::toggle_click_through(app)
            };
            if let Err(err) = result {
                eprintln!("[shortcut] {err}");
            }
        })
        .build()
}
