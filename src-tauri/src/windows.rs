use crate::{agenda, platform, shortcuts, AppState, Tool};
use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, Monitor, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_store::StoreExt;

pub const HOTBAR: &str = "hotbar";
pub const STICKY: &str = "sticky";
pub const FLOATING: &[&str] = &[HOTBAR, STICKY];
const WIDTH: f64 = if cfg!(all(target_os = "macos", not(feature = "native-eyedropper"))) {
    794.0
} else {
    844.0
};
const HEIGHT: f64 = 112.0;
const PICKER_HEIGHT: f64 = 384.0;
const MARGIN: f64 = 24.0;
const STICKY_WIDTH: f64 = 460.0;
const STICKY_MARGIN: f64 = 48.0;

#[derive(Default)]
pub struct StickyLayout {
    height: Mutex<Option<f64>>,
    dragging: AtomicBool,
}

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
    let size = monitor.size().to_logical::<f64>(scale);
    (0.0, 0.0, size.width, size.height)
}

pub fn create_overlay(
    app: &AppHandle,
    label: &str,
    monitor: &Monitor,
) -> tauri::Result<WebviewWindow> {
    let (_, _, width, height) = frame(monitor);
    let level = *app.state::<AppState>().level.lock().unwrap();
    let window = base_builder(app, label, "overlay.html")
        .inner_size(width, height)
        .build()?;
    crate::displays::fit_overlay(&window, monitor)?;
    platform::configure_overlay(&window, level)?;
    let handle = app.clone();
    let owner = label.to_owned();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Focused(false)) {
            if let Err(error) = handle.emit_to(&owner, "text:commit", ()) {
                eprintln!("[text] {error}");
            }
        }
    });
    window.set_ignore_cursor_events(!crate::displays::current_capture(app))?;
    platform::show_without_focus(&window)?;
    Ok(window)
}

pub fn create_hotbar(app: &AppHandle) -> Result<WebviewWindow, Box<dyn std::error::Error>> {
    let monitor = app.primary_monitor()?.ok_or(tauri::Error::WindowNotFound)?;
    let (x, y, width, height) = frame(&monitor);
    let store = app
        .store_builder(agenda::SETTINGS_FILE)
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
            if moved_window.outer_position().ok().as_ref() != Some(position)
                || app_is_placing(moved_window.app_handle())
            {
                return;
            }
            if let Ok(Some(monitor)) = moved_window.current_monitor() {
                let logical = tauri::LogicalPosition::new(
                    (position.x - monitor.position().x) as f64 / monitor.scale_factor(),
                    (position.y - monitor.position().y) as f64 / monitor.scale_factor(),
                );
                store.set(
                    monitor_key(&monitor),
                    serde_json::json!({"x": logical.x, "y": logical.y}),
                );
            }
        }
    });
    place_hotbar(app).map_err(std::io::Error::other)?;
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
                let physical = window.outer_position()?;
                let pos = tauri::LogicalPosition::new(
                    (physical.x - monitor.position().x) as f64 / monitor.scale_factor(),
                    (physical.y - monitor.position().y) as f64 / monitor.scale_factor(),
                );
                if pos.y + height > y + h {
                    crate::displays::place(
                        &window,
                        &monitor,
                        (pos.x, (y + h - height).max(y)),
                        (WIDTH, height),
                    )?;
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
        crate::displays::invoke_display(app)?;
        platform::show_without_focus(&window).map_err(|e| e.to_string())?;
        tray_sync(app);
    }
    Ok(())
}

fn tray_sync(app: &AppHandle) {
    crate::tray::sync(app);
}

pub fn set_click_through(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let tool = app.state::<AppState>().drawing.lock().unwrap().tool;
    set_mode(app, tool, !enabled)
}

pub fn select_tool(app: &AppHandle, tool: Tool) -> Result<(), String> {
    let current = app.state::<AppState>().drawing.lock().unwrap().clone();
    set_mode(app, tool, !current.armed || current.tool != tool)
}

fn set_mode(app: &AppHandle, tool: Tool, armed: bool) -> Result<(), String> {
    if app.state::<AppState>().drawing.lock().unwrap().sampling {
        return Err("Finish color sampling before changing tools".into());
    }
    end_text_edit(app)?;
    let state = app.state::<AppState>();
    let current = state.drawing.lock().unwrap().clone();
    shortcuts::set_annotation_shortcuts(app, armed)?;
    if let Err(error) = crate::displays::pointer_mode(app, armed && !crate::setup::is_open(app)) {
        let _ = crate::displays::pointer_mode(app, current.armed && !crate::setup::is_open(app));
        let _ = shortcuts::set_annotation_shortcuts(app, current.armed);
        return Err(error);
    }
    let cursor = if !armed {
        tauri::CursorIcon::Default
    } else if tool == Tool::Text {
        tauri::CursorIcon::Text
    } else {
        tauri::CursorIcon::Crosshair
    };
    for overlay in crate::displays::overlays(app) {
        if let Err(error) = overlay.set_cursor_icon(cursor) {
            eprintln!("[cursor] {error}");
        }
    }
    let snapshot = {
        let mut drawing = state.drawing.lock().unwrap();
        drawing.tool = tool;
        drawing.armed = armed;
        drawing.revision += 1;
        drawing.clone()
    };
    tray_sync(app);
    app.emit("tool:changed", snapshot)
        .map_err(|e| e.to_string())
}

pub fn toggle_click_through(app: &AppHandle) -> Result<(), String> {
    let armed = app.state::<AppState>().drawing.lock().unwrap().armed;
    set_click_through(app, armed)
}

pub fn begin_text_edit(app: &AppHandle, label: &str) -> Result<(), String> {
    let state = app.state::<AppState>();
    let current = state.drawing.lock().unwrap().clone();
    if current.editing {
        return Ok(());
    }
    if !current.armed || current.tool != Tool::Text || current.sampling {
        return Err("Select the text tool before typing".into());
    }
    let overlay = app
        .get_webview_window(label)
        .ok_or("Annotation overlay is unavailable")?;
    shortcuts::set_annotation_shortcuts(app, false)?;
    if let Err(error) = platform::begin_text_edit(&overlay) {
        let _ = shortcuts::set_annotation_shortcuts(app, true);
        return Err(error);
    }
    *app.state::<crate::displays::Displays>()
        .text_owner
        .lock()
        .unwrap() = Some(label.to_owned());
    let snapshot = {
        let mut drawing = state.drawing.lock().unwrap();
        drawing.editing = true;
        drawing.revision += 1;
        drawing.clone()
    };
    app.emit("tool:changed", snapshot)
        .map_err(|e| e.to_string())
}

pub fn end_text_edit(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let snapshot = {
        let mut drawing = state.drawing.lock().unwrap();
        if !drawing.editing {
            return Ok(());
        }
        drawing.editing = false;
        drawing.revision += 1;
        drawing.clone()
    };
    let owner = app
        .state::<crate::displays::Displays>()
        .text_owner
        .lock()
        .unwrap()
        .take();
    let focus_result = if let Some(overlay) = owner.and_then(|label| app.get_webview_window(&label))
    {
        platform::end_text_edit(&overlay)
    } else {
        Err("Annotation overlay is unavailable".into())
    };
    let shortcut_result =
        shortcuts::set_annotation_shortcuts(app, snapshot.armed && !snapshot.sampling);
    let snapshot = if shortcut_result.is_err() {
        for overlay in crate::displays::overlays(app) {
            if let Err(error) = overlay.set_ignore_cursor_events(true) {
                eprintln!("[text] pass-through recovery: {error}");
            }
        }
        let mut drawing = state.drawing.lock().unwrap();
        drawing.armed = false;
        drawing.revision += 1;
        drawing.clone()
    } else {
        snapshot
    };
    tray_sync(app);
    let event_result = app
        .emit("tool:changed", snapshot)
        .map_err(|e| e.to_string());
    focus_result.and(shortcut_result).and(event_result)
}

pub fn begin_sampling(app: &AppHandle) -> Result<(), String> {
    end_text_edit(app)?;
    let state = app.state::<AppState>();
    let current = state.drawing.lock().unwrap().clone();
    if current.sampling {
        return Err("A color sampling session is already open".into());
    }
    shortcuts::set_annotation_shortcuts(app, false)?;
    if let Err(error) = crate::displays::pointer_mode(app, false) {
        let _ = shortcuts::set_annotation_shortcuts(app, current.armed);
        return Err(error);
    }
    let snapshot = {
        let mut drawing = state.drawing.lock().unwrap();
        drawing.sampling = true;
        drawing.revision += 1;
        drawing.clone()
    };
    app.emit("tool:changed", snapshot)
        .map_err(|e| e.to_string())
}

pub fn finish_sampling(app: &AppHandle, color: Option<String>) -> Result<(), String> {
    let state = app.state::<AppState>();
    let current = state.drawing.lock().unwrap().clone();
    if !current.sampling {
        return Ok(());
    }
    let shortcuts_result = shortcuts::set_annotation_shortcuts(app, current.armed);
    let mut armed = current.armed && shortcuts_result.is_ok();
    let overlay_result = crate::displays::pointer_mode(app, armed && !crate::setup::is_open(app));
    if overlay_result.is_err() {
        armed = false;
        let _ = shortcuts::set_annotation_shortcuts(app, false);
    }
    let snapshot = {
        let mut drawing = state.drawing.lock().unwrap();
        drawing.sampling = false;
        drawing.armed = armed;
        if let Some(color) = color {
            drawing.color = color;
        }
        drawing.revision += 1;
        drawing.clone()
    };
    tray_sync(app);
    app.emit("color:changed", snapshot)
        .map_err(|e| e.to_string())?;
    shortcuts_result.and(overlay_result)
}

pub fn set_level(app: &AppHandle, level: platform::Level) -> tauri::Result<()> {
    *app.state::<AppState>().level.lock().unwrap() = level;
    let labels: Vec<String> = crate::displays::overlays(app)
        .iter()
        .map(|w| w.label().to_owned())
        .collect();
    platform::apply_level(
        app,
        &labels.iter().map(String::as_str).collect::<Vec<_>>(),
        FLOATING,
        level,
    );
    tray_sync(app);
    Ok(())
}

#[derive(Debug)]
struct StickyFrame {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    content_height: f64,
    max_content_height: f64,
}

fn sticky_frame(
    monitor: (f64, f64, f64, f64),
    corner: agenda::Corner,
    content_height: f64,
) -> StickyFrame {
    let (x, y, width, height) = monitor;
    let max_content_height = (height - 64.0 - STICKY_MARGIN * 2.0).max(1.0);
    let content_height = content_height.clamp(1.0, max_content_height);
    let right = matches!(corner, agenda::Corner::Tr | agenda::Corner::Br);
    let bottom = matches!(corner, agenda::Corner::Bl | agenda::Corner::Br);
    StickyFrame {
        x: if right {
            x + width - 40.0 - STICKY_WIDTH - STICKY_MARGIN
        } else {
            x + 40.0 - STICKY_MARGIN
        },
        y: if bottom {
            y + height - 32.0 - content_height - STICKY_MARGIN
        } else {
            y + 32.0 - STICKY_MARGIN
        },
        width: STICKY_WIDTH + STICKY_MARGIN * 2.0,
        height: content_height + STICKY_MARGIN * 2.0,
        content_height,
        max_content_height,
    }
}

pub fn create_sticky(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let monitor = crate::displays::selected(app).map_err(std::io::Error::other)?;
    let initial = sticky_frame(frame(&monitor), agenda::Corner::Bl, 320.0);
    let level = *app.state::<AppState>().level.lock().unwrap();
    let window = base_builder(app, STICKY, "sticky.html")
        .position(initial.x, initial.y)
        .inner_size(initial.width, initial.height)
        .build()?;
    platform::configure_floating(&window, level)?;
    let handle = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::Moved(position) = event {
            if handle
                .state::<StickyLayout>()
                .dragging
                .load(Ordering::SeqCst)
            {
                if let Err(error) = remember_sticky_position(&handle, position) {
                    eprintln!("[sticky] {error}");
                }
            }
        }
    });
    Ok(window)
}

pub fn resize_sticky(app: &AppHandle, height: f64) -> Result<f64, String> {
    if !height.is_finite() || height < 1.0 {
        return Err("Sticky content height must be positive and finite".into());
    }
    let state = agenda::get(app)?;
    let window = app
        .get_webview_window(STICKY)
        .ok_or("The sticky window is unavailable")?;
    let monitor = crate::displays::selected(app)?;
    app.state::<StickyLayout>()
        .dragging
        .store(false, Ordering::SeqCst);
    let mut bounds = sticky_frame(frame(&monitor), state.settings.corner, height.ceil());
    let store = app
        .store(agenda::SETTINGS_FILE)
        .map_err(|e| e.to_string())?;
    if let Some(offset) = store
        .get(sticky_position_key(&monitor))
        .and_then(|v| serde_json::from_value::<Position>(v).ok())
    {
        apply_custom_offset(&mut bounds, frame(&monitor), state.settings.corner, offset);
    }
    crate::displays::place(
        &window,
        &monitor,
        (bounds.x, bounds.y),
        (bounds.width, bounds.height),
    )
    .map_err(|e| e.to_string())?;
    *app.state::<StickyLayout>()
        .height
        .lock()
        .map_err(|_| "Sticky layout is unavailable")? = Some(height);
    sync_sticky(app, &state)?;
    Ok(bounds.max_content_height)
}

fn sticky_position_key(monitor: &Monitor) -> String {
    monitor_key(monitor).replacen("hotbar:", "sticky-position:", 1)
}

fn apply_custom_offset(
    bounds: &mut StickyFrame,
    monitor: (f64, f64, f64, f64),
    corner: agenda::Corner,
    offset: Position,
) {
    if !offset.x.is_finite() || !offset.y.is_finite() {
        return;
    }
    let (x, y, width, height) = monitor;
    let left = if matches!(corner, agenda::Corner::Tr | agenda::Corner::Br) {
        width - STICKY_WIDTH - offset.x
    } else {
        offset.x
    };
    let top = if matches!(corner, agenda::Corner::Bl | agenda::Corner::Br) {
        height - bounds.content_height - offset.y
    } else {
        offset.y
    };
    bounds.x = x + left.clamp(0.0, (width - STICKY_WIDTH).max(0.0)) - STICKY_MARGIN;
    bounds.y = y + top.clamp(0.0, (height - bounds.content_height).max(0.0)) - STICKY_MARGIN;
}

fn remember_sticky_position(
    app: &AppHandle,
    position: &tauri::PhysicalPosition<i32>,
) -> Result<(), String> {
    let monitor = crate::displays::selected(app)?;
    let position = tauri::LogicalPosition::new(
        (position.x - monitor.position().x) as f64 / monitor.scale_factor(),
        (position.y - monitor.position().y) as f64 / monitor.scale_factor(),
    );
    let state = agenda::get(app)?;
    let height = app
        .state::<StickyLayout>()
        .height
        .lock()
        .map_err(|_| "Sticky layout is unavailable")?
        .unwrap_or(320.0);
    let (x, y, width, screen_height) = frame(&monitor);
    let left = (position.x + STICKY_MARGIN - x).clamp(0.0, (width - STICKY_WIDTH).max(0.0));
    let top = (position.y + STICKY_MARGIN - y).clamp(0.0, (screen_height - height).max(0.0));
    let offset = Position {
        x: if matches!(
            state.settings.corner,
            agenda::Corner::Tr | agenda::Corner::Br
        ) {
            width - left - STICKY_WIDTH
        } else {
            left
        },
        y: if matches!(
            state.settings.corner,
            agenda::Corner::Bl | agenda::Corner::Br
        ) {
            screen_height - top - height
        } else {
            top
        },
    };
    app.store(agenda::SETTINGS_FILE)
        .map_err(|e| e.to_string())?
        .set(
            sticky_position_key(&monitor),
            serde_json::to_value(offset).map_err(|e| e.to_string())?,
        );
    Ok(())
}

pub fn start_sticky_drag(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(STICKY)
        .ok_or("Sticky is unavailable")?;
    app.state::<StickyLayout>()
        .dragging
        .store(true, Ordering::SeqCst);
    if let Err(error) = window.start_dragging() {
        app.state::<StickyLayout>()
            .dragging
            .store(false, Ordering::SeqCst);
        return Err(error.to_string());
    }
    Ok(())
}

pub fn reset_sticky_position(app: &AppHandle) -> Result<(), String> {
    app.state::<StickyLayout>()
        .dragging
        .store(false, Ordering::SeqCst);
    let monitor = crate::displays::selected(app)?;
    let store = app
        .store(agenda::SETTINGS_FILE)
        .map_err(|e| e.to_string())?;
    store.delete(sticky_position_key(&monitor));
    store.save().map_err(|e| e.to_string())
}

pub fn refresh_sticky(app: &AppHandle) -> Result<(), String> {
    let height = *app
        .state::<StickyLayout>()
        .height
        .lock()
        .map_err(|_| "Sticky layout is unavailable")?;
    if let Some(height) = height {
        resize_sticky(app, height)?;
    }
    Ok(())
}

pub fn sync_sticky(app: &AppHandle, state: &agenda::AgendaState) -> Result<(), String> {
    let window = app
        .get_webview_window(STICKY)
        .ok_or("The sticky window is unavailable")?;
    let ready = app
        .state::<StickyLayout>()
        .height
        .lock()
        .map_err(|_| "Sticky layout is unavailable")?
        .is_some();
    if !state.settings.enabled {
        window.hide().map_err(|error| error.to_string())
    } else if ready {
        platform::show_without_focus(&window).map_err(|error| error.to_string())
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn custom_offsets_follow_the_selected_anchor_and_clamp_to_display() {
        let mut bounds = sticky_frame((100.0, 200.0, 1440.0, 900.0), agenda::Corner::Br, 300.0);
        apply_custom_offset(
            &mut bounds,
            (100.0, 200.0, 1440.0, 900.0),
            agenda::Corner::Br,
            Position { x: 80.0, y: 60.0 },
        );
        assert_eq!(bounds.x + STICKY_MARGIN + STICKY_WIDTH, 1460.0);
        assert_eq!(bounds.y + STICKY_MARGIN + bounds.content_height, 1040.0);
        apply_custom_offset(
            &mut bounds,
            (100.0, 200.0, 1440.0, 900.0),
            agenda::Corner::Bl,
            Position {
                x: -500.0,
                y: 5000.0,
            },
        );
        assert_eq!(bounds.x + STICKY_MARGIN, 100.0);
        assert_eq!(bounds.y + STICKY_MARGIN, 200.0);
    }
    #[test]
    fn resizing_keeps_the_visible_bottom_left_anchor_fixed() {
        let short = sticky_frame((0.0, 0.0, 1440.0, 900.0), agenda::Corner::Bl, 150.0);
        let tall = sticky_frame((0.0, 0.0, 1440.0, 900.0), agenda::Corner::Bl, 350.0);
        assert_eq!(short.x + STICKY_MARGIN, 40.0);
        assert_eq!(short.y + STICKY_MARGIN + short.content_height, 868.0);
        assert_eq!(tall.y + STICKY_MARGIN + tall.content_height, 868.0);
    }
    #[test]
    fn every_corner_accounts_for_display_origin_and_shadow_margin() {
        let monitor = (-1440.0, 100.0, 1440.0, 900.0);
        for corner in [
            agenda::Corner::Tl,
            agenda::Corner::Tr,
            agenda::Corner::Bl,
            agenda::Corner::Br,
        ] {
            let bounds = sticky_frame(monitor, corner, 200.0);
            let right = matches!(corner, agenda::Corner::Tr | agenda::Corner::Br);
            let bottom = matches!(corner, agenda::Corner::Bl | agenda::Corner::Br);
            assert_eq!(
                bounds.x + STICKY_MARGIN,
                if right { -40.0 - STICKY_WIDTH } else { -1400.0 }
            );
            assert_eq!(
                bounds.y + STICKY_MARGIN,
                if bottom { 1000.0 - 32.0 - 200.0 } else { 132.0 }
            );
        }
    }
    #[test]
    fn oversized_content_is_clamped_without_moving_the_bottom_anchor() {
        let bounds = sticky_frame((0.0, 0.0, 1440.0, 900.0), agenda::Corner::Bl, 10000.0);
        assert_eq!(bounds.content_height, bounds.max_content_height);
        assert!(bounds.y >= 0.0);
        assert_eq!(bounds.y + STICKY_MARGIN + bounds.content_height, 868.0);
    }
}

fn app_is_placing(app: &AppHandle) -> bool {
    app.state::<crate::displays::Displays>()
        .placing
        .load(Ordering::SeqCst)
}
pub fn place_hotbar(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window(HOTBAR) else {
        return Ok(());
    };
    let monitor = crate::displays::selected(app)?;
    let (_, _, width, height) = frame(&monitor);
    let store = app
        .store(agenda::SETTINGS_FILE)
        .map_err(|e| e.to_string())?;
    let mut saved = store
        .get(monitor_key(&monitor))
        .and_then(|v| serde_json::from_value::<Position>(v).ok())
        .unwrap_or(Position {
            x: width - 190.0 - (WIDTH - MARGIN),
            y: 44.0 - MARGIN,
        });
    if !saved.x.is_finite() {
        saved.x = 0.0;
    }
    if !saved.y.is_finite() {
        saved.y = 0.0;
    }
    let size = window
        .inner_size()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(window.scale_factor().map_err(|e| e.to_string())?);
    let local = (
        saved.x.clamp(0.0, (width - WIDTH).max(0.0)),
        saved.y.clamp(0.0, (height - size.height).max(0.0)),
    );
    app.state::<crate::displays::Displays>()
        .placing
        .store(true, Ordering::SeqCst);
    let result = crate::displays::place(&window, &monitor, local, (WIDTH, size.height))
        .map_err(|e| e.to_string());
    app.state::<crate::displays::Displays>()
        .placing
        .store(false, Ordering::SeqCst);
    result
}
