//! Windows: topmost + skip-taskbar come from the window builder, and `focusable(false)` makes
//! tao add WS_EX_NOACTIVATE, so clicks never take focus from the slideshow.
//! Not yet compiled or tested; Windows verification is scheduled for M5.

use super::Level;

pub fn init_app(_app: &mut tauri::App) {}

pub fn configure_overlay(window: &tauri::WebviewWindow, _level: Level) -> tauri::Result<()> {
    window.set_always_on_top(true)
}

pub fn configure_floating(window: &tauri::WebviewWindow, _level: Level) -> tauri::Result<()> {
    window.set_always_on_top(true)
}

pub fn apply_level(_app: &tauri::AppHandle, _overlay: &[&str], _floating: &[&str], _level: Level) {}

pub fn show_without_focus(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    // WS_EX_NOACTIVATE windows do not activate on show.
    window.show()
}
