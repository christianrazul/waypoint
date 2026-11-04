use crate::{agenda, platform, windows, AppState};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::{AppHandle, Emitter, Manager, Monitor};

#[derive(Default)]
pub struct Displays {
    entries: Mutex<Vec<Entry>>,
    selected: Mutex<Option<String>>,
    next: Mutex<u64>,
    pending: AtomicBool,
    #[cfg(target_os = "macos")]
    sessions_pending: AtomicBool,
    pub sessions: Mutex<crate::sessions::Sessions>,
    pub text_owner: Mutex<Option<String>>,
    pub placing: AtomicBool,
}
#[derive(Clone)]
struct Entry {
    id: String,
    label: String,
    monitor: Monitor,
}

fn identity(monitor: &Monitor) -> String {
    monitor
        .name()
        .cloned()
        .unwrap_or_else(|| format!("display:{},{}", monitor.position().x, monitor.position().y))
}
fn ids(monitors: &[Monitor]) -> Vec<String> {
    monitors
        .iter()
        .map(|m| {
            let name = identity(m);
            if monitors
                .iter()
                .filter(|other| identity(other) == name)
                .count()
                > 1
            {
                format!("{name}:{},{}", m.position().x, m.position().y)
            } else {
                name
            }
        })
        .collect()
}
pub fn overlays(app: &AppHandle) -> Vec<tauri::WebviewWindow> {
    app.webview_windows()
        .into_iter()
        .filter(|(label, _)| label.starts_with("overlay-"))
        .map(|(_, w)| w)
        .collect()
}
pub fn monitor_id(app: &AppHandle, monitor: &Monitor) -> String {
    app.state::<Displays>()
        .entries
        .lock()
        .unwrap()
        .iter()
        .find(|entry| {
            entry.monitor.name() == monitor.name() && entry.monitor.position() == monitor.position()
        })
        .map(|entry| entry.id.clone())
        .unwrap_or_else(|| identity(monitor))
}
pub fn selected(app: &AppHandle) -> Result<Monitor, String> {
    let state = app.state::<Displays>();
    let selected = state.selected.lock().unwrap().clone();
    if let Some(entry) = state
        .entries
        .lock()
        .unwrap()
        .iter()
        .find(|e| Some(&e.id) == selected.as_ref())
    {
        return Ok(entry.monitor.clone());
    }
    app.primary_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("No display is available".into())
}
pub fn invoke_display(app: &AppHandle) -> Result<(), String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let chosen = if agenda::get(app)?.settings.display == agenda::Display::Cursor {
        app.cursor_position()
            .ok()
            .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
    } else {
        None
    }
    .or(app.primary_monitor().map_err(|e| e.to_string())?)
    .ok_or("No display is available")?;
    let keys = ids(&monitors);
    let id = monitors
        .iter()
        .position(|m| m.name() == chosen.name() && m.position() == chosen.position())
        .map(|i| keys[i].clone())
        .ok_or("Selected display is disconnected")?;
    let state = app.state::<Displays>();
    let changed = state.selected.lock().unwrap().as_ref() != Some(&id);
    *state.selected.lock().unwrap() = Some(id);
    if changed {
        windows::place_hotbar(app)?;
        windows::refresh_sticky(app)?;
        crate::setup::place(app)?;
    }
    Ok(())
}
pub fn request_refresh(app: &AppHandle) {
    if app.state::<Displays>().pending.swap(true, Ordering::SeqCst) {
        return;
    }
    let handle = app.clone();
    if let Err(error) = app.run_on_main_thread(move || {
        handle
            .state::<Displays>()
            .pending
            .store(false, Ordering::SeqCst);
        if let Err(error) = reconcile(&handle) {
            eprintln!("[displays] {error}");
            let _ = handle.emit("app:error", error);
        }
    }) {
        app.state::<Displays>()
            .pending
            .store(false, Ordering::SeqCst);
        eprintln!("[displays] {error}");
    }
}
#[cfg(target_os = "macos")]
pub fn request_session_refresh(app: &AppHandle) {
    if app
        .state::<Displays>()
        .sessions_pending
        .swap(true, Ordering::SeqCst)
    {
        return;
    }
    let handle = app.clone();
    if let Err(error) = app.run_on_main_thread(move || {
        handle
            .state::<Displays>()
            .sessions_pending
            .store(false, Ordering::SeqCst);
        if let Err(error) = refresh_sessions(&handle) {
            eprintln!("[spaces] {error}");
            let _ = handle.emit("app:error", error);
        }
    }) {
        app.state::<Displays>()
            .sessions_pending
            .store(false, Ordering::SeqCst);
        eprintln!("[spaces] {error}");
    }
}
pub fn reconcile(app: &AppHandle) -> Result<(), String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    if monitors.is_empty() {
        return Ok(());
    }
    let keys = ids(&monitors);
    let state = app.state::<Displays>();
    let previous = state.entries.lock().unwrap().clone();
    let mut next = Vec::new();
    for (monitor, id) in monitors.into_iter().zip(keys) {
        let entry = if let Some(old) = previous.iter().find(|e| e.id == id) {
            let window = app
                .get_webview_window(&old.label)
                .ok_or("Display overlay is unavailable")?;
            if old.monitor.position() != monitor.position()
                || old.monitor.size() != monitor.size()
                || old.monitor.scale_factor() != monitor.scale_factor()
            {
                windows::end_text_edit(app)?;
                fit_overlay(&window, &monitor).map_err(|e| e.to_string())?;
            }
            Entry {
                id,
                label: old.label.clone(),
                monitor,
            }
        } else {
            let label = {
                let mut n = state.next.lock().unwrap();
                let label = format!("overlay-{n}");
                *n += 1;
                label
            };
            // Publish before creating the webview so its hydration can identify its display.
            let entry = Entry { id, label, monitor };
            state.entries.lock().unwrap().push(entry.clone());
            windows::create_overlay(app, &entry.label, &entry.monitor)
                .map_err(|e| e.to_string())?;
            entry
        };
        next.push(entry);
    }
    for old in previous
        .iter()
        .filter(|old| !next.iter().any(|e| e.id == old.id))
    {
        windows::end_text_edit(app)?;
        if let Some(window) = app.get_webview_window(&old.label) {
            state.sessions.lock().unwrap().suspend(&old.label);
            window.destroy().map_err(|e| e.to_string())?;
            platform::forget_overlay(app, &old.label);
        }
    }
    *state.entries.lock().unwrap() = next;
    refresh_sessions(app)?;
    invoke_display(app)?;
    windows::place_hotbar(app)?;
    windows::refresh_sticky(app)?;
    crate::setup::place(app)?;
    app.emit("displays:changed", ()).map_err(|e| e.to_string())
}
pub fn fit_overlay(window: &tauri::WebviewWindow, monitor: &Monitor) -> tauri::Result<()> {
    let size = monitor.size().to_logical::<f64>(monitor.scale_factor());
    place(window, monitor, (0.0, 0.0), (size.width, size.height))
}
#[cfg(any(target_os = "windows", test))]
fn physical_point(origin: (i32, i32), scale: f64, local: (f64, f64)) -> (i32, i32) {
    (
        origin.0 + (local.0 * scale).round() as i32,
        origin.1 + (local.1 * scale).round() as i32,
    )
}
pub fn place(
    window: &tauri::WebviewWindow,
    monitor: &Monitor,
    local: (f64, f64),
    size: (f64, f64),
) -> tauri::Result<()> {
    let scale = monitor.scale_factor();
    #[cfg(target_os = "macos")]
    {
        let origin = monitor.position().to_logical::<f64>(scale);
        window.set_position(tauri::LogicalPosition::new(
            origin.x + local.0,
            origin.y + local.1,
        ))?;
        window.set_size(tauri::LogicalSize::new(size.0, size.1))
    }
    #[cfg(target_os = "windows")]
    {
        let point = physical_point((monitor.position().x, monitor.position().y), scale, local);
        window.set_position(tauri::PhysicalPosition::new(point.0, point.1))?;
        window.set_size(tauri::PhysicalSize::new(
            (size.0 * scale).round() as u32,
            (size.1 * scale).round() as u32,
        ))
    }
}
pub fn history_action(app: &AppHandle, event: &str) -> Result<(), String> {
    refresh_sessions(app)?;
    windows::end_text_edit(app)?;
    invoke_display(app)?;
    let point = app.cursor_position().map_err(|e| e.to_string())?;
    let monitor = app
        .monitor_from_point(point.x, point.y)
        .map_err(|e| e.to_string())?
        .unwrap_or(selected(app)?);
    let state = app.state::<Displays>();
    let entries = state.entries.lock().unwrap();
    let entry = entries
        .iter()
        .find(|e| e.monitor.position() == monitor.position() && e.monitor.name() == monitor.name())
        .ok_or("Display overlay is unavailable")?;
    if !session_ready(app, &entry.label) {
        return Err("Wait for the active Space's annotations to load".into());
    }
    app.emit_to(&entry.label, event, ())
        .map_err(|e| e.to_string())
}
pub fn session_ready(app: &AppHandle, label: &str) -> bool {
    app.state::<Displays>()
        .sessions
        .lock()
        .unwrap()
        .is_ready(label)
}
pub fn refresh_sessions(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<Displays>();
    let entries = state.entries.lock().unwrap().clone();
    let monitors: Vec<_> = entries.iter().map(|e| e.monitor.clone()).collect();
    let scopes = match platform::active_spaces(&monitors) {
        Ok(scopes) => scopes,
        Err(error) => {
            let error = format!("Annotations paused: {error}");
            let changed = state.sessions.lock().unwrap().error.as_ref() != Some(&error);
            state.sessions.lock().unwrap().error = Some(error.clone());
            if let Err(error) = windows::end_text_edit(app) {
                eprintln!("[spaces] finish text: {error}");
            }
            for entry in &entries {
                state.sessions.lock().unwrap().suspend(&entry.label);
                if let Some(window) = app.get_webview_window(&entry.label) {
                    window
                        .set_ignore_cursor_events(true)
                        .map_err(|e| e.to_string())?;
                    window.hide().map_err(|e| e.to_string())?;
                    if changed {
                        app.emit_to(&entry.label, "overlay:session-changed", ())
                            .map_err(|e| e.to_string())?;
                    }
                }
            }
            if changed {
                eprintln!("[spaces] {error}");
                let _ = app.emit("app:error", error);
            }
            return Ok(());
        }
    };
    state.sessions.lock().unwrap().error = None;
    for (entry, scope) in entries.iter().zip(scopes) {
        let changed = state
            .sessions
            .lock()
            .unwrap()
            .activate(&entry.label, &entry.id, &scope);
        if changed {
            if let Err(error) = windows::end_text_edit(app) {
                eprintln!("[spaces] finish text: {error}");
            }
            if let Some(window) = app.get_webview_window(&entry.label) {
                window
                    .set_ignore_cursor_events(true)
                    .map_err(|e| e.to_string())?;
                window.hide().map_err(|e| e.to_string())?;
                app.emit_to(&entry.label, "overlay:session-changed", ())
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}
pub fn ready_session(app: &AppHandle, label: &str, generation: u64) -> Result<bool, String> {
    refresh_sessions(app)?;
    if !app
        .state::<Displays>()
        .sessions
        .lock()
        .unwrap()
        .mark_ready(label, generation)
    {
        return Ok(false);
    }
    let window = app
        .get_webview_window(label)
        .ok_or("Display overlay is unavailable")?;
    let shown = window
        .set_ignore_cursor_events(!current_capture(app))
        .and_then(|_| platform::show_without_focus(&window));
    if let Err(error) = shown {
        app.state::<Displays>()
            .sessions
            .lock()
            .unwrap()
            .suspend(label);
        let _ = window.set_ignore_cursor_events(true);
        let _ = window.hide();
        return Err(error.to_string());
    }
    Ok(true)
}
pub fn pointer_mode(app: &AppHandle, capture: bool) -> Result<(), String> {
    for window in overlays(app) {
        window
            .set_ignore_cursor_events(!capture || !session_ready(app, window.label()))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
pub fn current_capture(app: &AppHandle) -> bool {
    let drawing = app.state::<AppState>().drawing.lock().unwrap().clone();
    drawing.armed && !drawing.sampling && !crate::setup::is_open(app)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn negative_origin_and_fractional_dpi_keep_local_offsets_on_the_target_display() {
        assert_eq!(
            physical_point((-2560, -400), 1.5, (40.0, 32.0)),
            (-2500, -352)
        );
        assert_eq!(physical_point((3840, 0), 2.0, (40.0, 32.0)), (3920, 64));
        assert_eq!(physical_point((-1920, 0), 1.0, (-48.0, 20.0)), (-1968, 20));
    }
}
