//! Platform layer. Everything OS-specific lives behind these functions so the rest of the
//! app never touches AppKit or Win32 directly.

use serde::Serialize;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
use macos as imp;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
use windows as imp;

/// Window level for the overlay. Floating windows (hotbar, sticky) always sit one
/// level above it so they stay clickable while the overlay is armed.
///
/// macOS maps these to NSWindowLevel values. Windows only has "topmost", so all levels
/// behave the same there.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Level {
    /// NSStatusWindowLevel (25): above the menu bar and Dock.
    Status,
    /// NSPopUpMenuWindowLevel (101).
    PopUpMenu,
    /// NSScreenSaverWindowLevel (1000). Default: above full-screen Keynote and PowerPoint.
    ScreenSaver,
    /// CGShieldingWindowLevel(): above apps that capture the display.
    Shielding,
}

impl Level {
    pub const ALL: [Level; 4] = [
        Level::Status,
        Level::PopUpMenu,
        Level::ScreenSaver,
        Level::Shielding,
    ];

    pub fn id(self) -> &'static str {
        match self {
            Level::Status => "level_status",
            Level::PopUpMenu => "level_popup",
            Level::ScreenSaver => "level_screensaver",
            Level::Shielding => "level_shielding",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Level::Status => "Status (25)",
            Level::PopUpMenu => "Pop-up menu (101)",
            Level::ScreenSaver => "Screen saver (1000)",
            Level::Shielding => "Shielding (CGShieldingWindowLevel)",
        }
    }

    pub fn from_id(id: &str) -> Option<Level> {
        Level::ALL.into_iter().find(|level| level.id() == id)
    }
}

/// App-wide setup that must run once in `setup` (no Dock icon, and so on).
pub fn init_app(app: &mut tauri::App) {
    imp::init_app(app)
}

/// Turns a freshly built overlay window into a non-activating, all-Spaces, high-level surface.
pub fn configure_overlay(window: &tauri::WebviewWindow, level: Level) -> tauri::Result<()> {
    imp::configure_overlay(window, level)
}

/// Same as the overlay, but sits one level higher. Used for the hotbar and sticky.
pub fn configure_floating(window: &tauri::WebviewWindow, level: Level) -> tauri::Result<()> {
    imp::configure_floating(window, level)
}

/// Re-applies the level to existing windows (debug menu: lets you compare levels live).
pub fn apply_level(
    app: &tauri::AppHandle,
    overlay_labels: &[&str],
    floating_labels: &[&str],
    level: Level,
) {
    imp::apply_level(app, overlay_labels, floating_labels, level)
}

/// Shows a window without activating the app or stealing key focus.
pub fn show_without_focus(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    imp::show_without_focus(window)
}

pub fn begin_text_edit(window: &tauri::WebviewWindow) -> Result<(), String> {
    imp::begin_text_edit(window)
}
pub fn end_text_edit(window: &tauri::WebviewWindow) -> Result<(), String> {
    imp::end_text_edit(window)
}
pub fn sample_color(app: &tauri::AppHandle) -> Result<(), String> {
    imp::sample_color(app)
}

pub fn configure_setup(window: &tauri::WebviewWindow, level: Level) -> tauri::Result<()> {
    imp::configure_setup(window, level)
}
pub fn focus_setup(window: &tauri::WebviewWindow, remember: bool) -> Result<(), String> {
    imp::focus_setup(window, remember)
}
pub fn release_setup(window: &tauri::WebviewWindow) -> Result<(), String> {
    imp::release_setup(window)
}

pub fn watch_displays(app: &tauri::AppHandle) -> tauri::Result<()> {
    imp::watch_displays(app)
}
pub fn stop_display_watch() {
    imp::stop_display_watch();
}
pub fn forget_overlay(app: &tauri::AppHandle, label: &str) {
    imp::forget_overlay(app, label);
}
pub fn active_spaces(monitors: &[tauri::Monitor]) -> Result<Vec<String>, String> {
    imp::active_spaces(monitors)
}
