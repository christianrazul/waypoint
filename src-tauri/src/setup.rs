use crate::{platform, shortcuts, windows, AppState};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

pub const SETUP: &str = "setup";
const SHADOW_MARGIN: f64 = 96.0;
#[derive(Default)]
pub struct SetupState {
    pub open: AtomicBool,
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let window = WebviewWindowBuilder::new(app, SETUP, WebviewUrl::App("setup.html".into()))
        .title("Waypoint sticky setup")
        .disable_drag_drop_handler()
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .focusable(true)
        .focused(false)
        .accept_first_mouse(true)
        .visible(false)
        .inner_size(400.0 + SHADOW_MARGIN * 2.0, 650.0 + SHADOW_MARGIN * 2.0)
        .build()?;
    platform::configure_setup(&window, *app.state::<AppState>().level.lock().unwrap())?;
    let handle = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            request_close(&handle);
        }
        #[cfg(target_os = "windows")]
        if matches!(event, WindowEvent::Focused(false)) {
            request_close(&handle);
        }
    });
    Ok(())
}

pub fn is_open(app: &AppHandle) -> bool {
    app.state::<SetupState>().open.load(Ordering::SeqCst)
}

pub fn request_close(app: &AppHandle) {
    if is_open(app) {
        if let Err(error) = app.emit_to(SETUP, "setup:closing", ()) {
            eprintln!("[setup] {error}");
        }
    }
}

pub fn open(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(SETUP).is_none() {
        create(app).map_err(|e| e.to_string())?;
    }
    if app.state::<AppState>().drawing.lock().unwrap().sampling {
        return Err("Finish color sampling before opening setup".into());
    }
    if is_open(app) {
        return platform::focus_setup(
            &app.get_webview_window(SETUP)
                .ok_or("Setup is unavailable")?,
            false,
        );
    }
    crate::displays::invoke_display(app)?;
    place(app)?;
    windows::end_text_edit(app)?;
    // The hold key is released while setup is open, so its key-up would never arrive.
    windows::set_highlighting(app, false)?;
    let window = app
        .get_webview_window(SETUP)
        .ok_or("Setup is unavailable")?;
    shortcuts::set_annotation_shortcuts(app, false)?;
    let armed = app.state::<AppState>().drawing.lock().unwrap().armed;
    if let Err(error) = crate::displays::pointer_mode(app, false) {
        let _ = shortcuts::set_annotation_shortcuts(app, armed);
        return Err(error);
    }
    app.state::<SetupState>().open.store(true, Ordering::SeqCst);
    if let Err(error) = platform::focus_setup(&window, true) {
        app.state::<SetupState>()
            .open
            .store(false, Ordering::SeqCst);
        let _ = platform::release_setup(&window);
        let _ = window.hide();
        if shortcuts::set_annotation_shortcuts(app, armed).is_err() {
            let _ = windows::set_click_through(app, true);
        } else {
            let _ = crate::displays::pointer_mode(app, armed);
        }
        return Err(error);
    }
    app.emit_to(SETUP, "setup:opened", ())
        .map_err(|e| e.to_string())
}

pub fn close(app: &AppHandle) -> Result<(), String> {
    if !app.state::<SetupState>().open.swap(false, Ordering::SeqCst) {
        return Ok(());
    }
    let window = app
        .get_webview_window(SETUP)
        .ok_or("Setup is unavailable")?;
    let restore = shortcuts::record(app, false);
    let focus = platform::release_setup(&window);
    let hidden = window.hide().map_err(|e| e.to_string());
    let current = app.state::<AppState>().drawing.lock().unwrap().clone();
    let keys = shortcuts::set_annotation_shortcuts(
        app,
        current.armed && !current.editing && !current.sampling,
    );
    if keys.is_err() {
        let _ = windows::set_click_through(app, true);
    }
    let pointer = crate::displays::pointer_mode(app, current.armed && keys.is_ok());
    if pointer.is_err() {
        let _ = windows::set_click_through(app, true);
    }
    restore.and(focus).and(hidden).and(keys).and(pointer)
}

pub fn place(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window(SETUP) else {
        return Ok(());
    };
    let monitor = crate::displays::selected(app)?;
    let size = monitor.size().to_logical::<f64>(monitor.scale_factor());
    let height = (size.height - 64.0).clamp(200.0, 650.0);
    crate::displays::place(
        &window,
        &monitor,
        (
            (size.width - 440.0).max(0.0) - SHADOW_MARGIN,
            32.0 - SHADOW_MARGIN,
        ),
        (400.0 + SHADOW_MARGIN * 2.0, height + SHADOW_MARGIN * 2.0),
    )
    .map_err(|e| e.to_string())
}
