//! Global shortcuts. M0 registers only the drawing / pass-through toggle; M3 and M5 add the
//! rest plus user configuration and conflict handling.

use tauri::plugin::TauriPlugin;
use tauri::Wry;
use tauri_plugin_global_shortcut::{Builder, ShortcutState};

use crate::windows;

pub const TOGGLE_DRAWING: &str = "ctrl+alt+KeyD";

pub fn plugin() -> TauriPlugin<Wry> {
    Builder::new()
        .with_shortcuts([TOGGLE_DRAWING])
        .expect("valid shortcut")
        .with_handler(|app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                if let Err(err) = windows::toggle_click_through(app) {
                    eprintln!("[shortcut] toggle drawing: {err}");
                }
            }
        })
        .build()
}
