//! Window lifecycle. M0 has two windows: the overlay and a stand-in for the hotbar.

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::{platform, AppState};

pub const OVERLAY: &str = "overlay";
pub const SPIKE: &str = "spike";

/// Windows that must sit above the overlay (M1+: hotbar, sticky, setup).
pub const FLOATING: &[&str] = &[SPIKE];

const SPIKE_WIDTH: f64 = 340.0;
const SPIKE_HEIGHT: f64 = 300.0;
// Mockup hotbar anchor on a 1440px-wide screen: 44px from the top, 190px from the right.
const ANCHOR_TOP: f64 = 44.0;
const ANCHOR_RIGHT: f64 = 190.0;

/// Common flags for every Waypoint surface: transparent, borderless, on top, off the taskbar,
/// and never focusable (WS_EX_NOACTIVATE on Windows; on macOS the NSPanel config does this).
fn base_builder<'a>(app: &'a AppHandle, label: &str, page: &str) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App(page.into()))
        .title(format!("{} {label}", crate::APP_NAME))
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .focusable(false)
        .focused(false)
        .accept_first_mouse(true)
        .visible(false)
}

/// Logical frame (x, y, width, height) of the primary display.
fn primary_frame(app: &AppHandle) -> tauri::Result<(f64, f64, f64, f64)> {
    let monitor = app
        .primary_monitor()?
        .ok_or(tauri::Error::WindowNotFound)?;
    let scale = monitor.scale_factor();
    let pos = monitor.position().to_logical::<f64>(scale);
    let size = monitor.size().to_logical::<f64>(scale);
    Ok((pos.x, pos.y, size.width, size.height))
}

pub fn create_overlay(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let (x, y, width, height) = primary_frame(app)?;
    let level = *app.state::<AppState>().level.lock().unwrap();

    let window = base_builder(app, OVERLAY, "overlay.html")
        .position(x, y)
        .inner_size(width, height)
        .build()?;

    platform::configure_overlay(&window, level)?;
    // Start in pass-through: annotations visible, every click reaches the app below.
    window.set_ignore_cursor_events(true)?;
    platform::show_without_focus(&window)?;
    Ok(window)
}

pub fn create_spike(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let (x, y, width, _) = primary_frame(app)?;
    let level = *app.state::<AppState>().level.lock().unwrap();

    let window = base_builder(app, SPIKE, "spike.html")
        .position(x + width - ANCHOR_RIGHT - SPIKE_WIDTH, y + ANCHOR_TOP)
        .inner_size(SPIKE_WIDTH, SPIKE_HEIGHT)
        .build()?;

    platform::configure_floating(&window, level)?;
    platform::show_without_focus(&window)?;
    Ok(window)
}

pub fn toggle_spike(app: &AppHandle) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window(SPIKE) else {
        return Ok(());
    };
    if window.is_visible()? {
        window.hide()
    } else {
        platform::show_without_focus(&window)
    }
}

/// Pass-through on: the overlay ignores the mouse entirely. Off: it captures the mouse for drawing.
pub fn set_click_through(app: &AppHandle, enabled: bool) -> tauri::Result<()> {
    let state = app.state::<AppState>();
    if let Some(overlay) = app.get_webview_window(OVERLAY) {
        overlay.set_ignore_cursor_events(enabled)?;
    }
    state.click_through.store(enabled, std::sync::atomic::Ordering::SeqCst);
    crate::tray::sync(app);
    app.emit("overlay:armed", !enabled)
}

pub fn toggle_click_through(app: &AppHandle) -> tauri::Result<()> {
    let current = app
        .state::<AppState>()
        .click_through
        .load(std::sync::atomic::Ordering::SeqCst);
    set_click_through(app, !current)
}

pub fn set_level(app: &AppHandle, level: platform::Level) -> tauri::Result<()> {
    *app.state::<AppState>().level.lock().unwrap() = level;
    platform::apply_level(app, &[OVERLAY], FLOATING, level);
    crate::tray::sync(app);
    app.emit("spike:level", level)
}
