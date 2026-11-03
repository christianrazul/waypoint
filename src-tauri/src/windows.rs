use crate::{platform, shortcuts, AppState};
use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, Monitor, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_store::StoreExt;

pub const OVERLAY: &str = "overlay";
pub const HOTBAR: &str = "hotbar";
pub const FLOATING: &[&str] = &[HOTBAR];
const WIDTH: f64 = 844.0;
const HEIGHT: f64 = 112.0;
const PICKER_HEIGHT: f64 = 384.0;
const MARGIN: f64 = 24.0;
const SETTINGS: &str = "settings.json";

#[derive(Serialize, Deserialize)]
struct Position {
    x: f64,
    y: f64,
}

fn base_builder<'a>(
    app: &'a AppHandle,
    label: &str,
    page: &str,
) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
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

fn monitor_key(monitor: &Monitor) -> String {
    format!(
        "hotbar:{}:{}x{}:{}:{}",
        monitor.name().map(String::as_str).unwrap_or("display"),
        monitor.size().width,
        monitor.size().height,
        monitor.position().x,
        monitor.position().y
    )
}

fn frame(monitor: &Monitor) -> (f64, f64, f64, f64) {
    let scale = monitor.scale_factor();
    let pos = monitor.position().to_logical::<f64>(scale);
    let size = monitor.size().to_logical::<f64>(scale);
    (pos.x, pos.y, size.width, size.height)
}

pub fn create_overlay(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let monitor = app.primary_monitor()?.ok_or(tauri::Error::WindowNotFound)?;
    let (x, y, width, height) = frame(&monitor);
    let level = *app.state::<AppState>().level.lock().unwrap();
    let window = base_builder(app, OVERLAY, "overlay.html")
        .position(x, y)
        .inner_size(width, height)
        .build()?;
    platform::configure_overlay(&window, level)?;
    window.set_ignore_cursor_events(true)?;
    platform::show_without_focus(&window)?;
    Ok(window)
}

pub fn create_hotbar(app: &AppHandle) -> Result<WebviewWindow, Box<dyn std::error::Error>> {
    let monitor = app.primary_monitor()?.ok_or(tauri::Error::WindowNotFound)?;
    let (x, y, width, height) = frame(&monitor);
    let store = app
        .store_builder(SETTINGS)
        .auto_save(std::time::Duration::from_millis(300))
        .build()?;
    let saved = store
        .get(monitor_key(&monitor))
        .and_then(|v| serde_json::from_value::<Position>(v).ok());
    let default = Position {
        x: x + width - 190.0 - (WIDTH - MARGIN),
        y: y + 44.0 - MARGIN,
    };
    let position = saved.unwrap_or(default);
    let px = if position.x.is_finite() {
        position.x.clamp(x, x + (width - WIDTH).max(0.0))
    } else {
        x
    };
    let py = if position.y.is_finite() {
        position.y.clamp(y, y + (height - HEIGHT).max(0.0))
    } else {
        y
    };
    let level = *app.state::<AppState>().level.lock().unwrap();
    let window = base_builder(app, HOTBAR, "hotbar.html")
        .position(px, py)
        .inner_size(WIDTH, HEIGHT)
        .build()?;
    platform::configure_floating(&window, level)?;
    let moved_window = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::Moved(position) = event {
            if let Ok(Some(monitor)) = moved_window.current_monitor() {
                let logical = position.to_logical::<f64>(monitor.scale_factor());
                store.set(
                    monitor_key(&monitor),
                    serde_json::json!({"x": logical.x, "y": logical.y}),
                );
            }
        }
    });
    platform::show_without_focus(&window)?;
    Ok(window)
}

pub fn set_picker_open(app: &AppHandle, open: bool) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(HOTBAR) {
        let height = if open { PICKER_HEIGHT } else { HEIGHT };
        window.set_size(LogicalSize::new(WIDTH, height))?;
        if open {
            if let Some(monitor) = window.current_monitor()? {
                let (_, y, _, h) = frame(&monitor);
                let pos = window
                    .outer_position()?
                    .to_logical::<f64>(monitor.scale_factor());
                if pos.y + height > y + h {
                    window.set_position(tauri::LogicalPosition::new(
                        pos.x,
                        (y + h - height).max(y),
                    ))?;
                }
            }
        }
    }
    Ok(())
}

pub fn hide_hotbar(app: &AppHandle) -> Result<(), String> {
    set_click_through(app, true)?;
    if let Some(window) = app.get_webview_window(HOTBAR) {
        window.hide().map_err(|e| e.to_string())?;
    }
    tray_sync(app);
    Ok(())
}

pub fn toggle_hotbar(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(HOTBAR) {
        if window.is_visible().map_err(|e| e.to_string())? {
            return hide_hotbar(app);
        }
        platform::show_without_focus(&window).map_err(|e| e.to_string())?;
        tray_sync(app);
    }
    Ok(())
}

fn tray_sync(app: &AppHandle) {
    crate::tray::sync(app);
}

pub fn set_click_through(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut drawing = state.drawing.lock().unwrap();
    if drawing.armed == !enabled {
        return Ok(());
    }
    shortcuts::set_escape(app, !enabled)?;
    let overlay = app
        .get_webview_window(OVERLAY)
        .ok_or("Annotation overlay is unavailable")?;
    if let Err(error) = overlay.set_ignore_cursor_events(enabled) {
        if let Err(rollback) = shortcuts::set_escape(app, drawing.armed) {
            eprintln!("[shortcut] {rollback}");
        }
        return Err(error.to_string());
    }
    if let Err(error) = overlay.set_cursor_icon(if enabled {
        tauri::CursorIcon::Default
    } else {
        tauri::CursorIcon::Crosshair
    }) {
        eprintln!("[cursor] {error}");
    }
    drawing.armed = !enabled;
    drawing.revision += 1;
    let snapshot = drawing.clone();
    drop(drawing);
    tray_sync(app);
    app.emit("tool:changed", snapshot)
        .map_err(|e| e.to_string())
}

pub fn toggle_click_through(app: &AppHandle) -> Result<(), String> {
    let armed = app.state::<AppState>().drawing.lock().unwrap().armed;
    set_click_through(app, armed)
}

pub fn set_level(app: &AppHandle, level: platform::Level) -> tauri::Result<()> {
    *app.state::<AppState>().level.lock().unwrap() = level;
    platform::apply_level(app, &[OVERLAY], FLOATING, level);
    tray_sync(app);
    Ok(())
}
