mod agenda;
mod displays;
mod editing;
mod platform;
mod sessions;
mod setup;
mod shortcuts;
mod tray;
mod windows;

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, RunEvent, State};

pub const APP_NAME: &str = "Waypoint";

#[derive(Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Tool {
    Pen,
    Arrow,
    Rectangle,
    Ellipse,
    Text,
    Eraser,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrawingState {
    pub tool: Tool,
    pub armed: bool,
    pub editing: bool,
    pub sampling: bool,
    pub color: String,
    pub revision: u64,
}

impl Default for DrawingState {
    fn default() -> Self {
        Self {
            tool: Tool::Pen,
            armed: false,
            editing: false,
            sampling: false,
            color: "#F0509A".into(),
            revision: 0,
        }
    }
}

pub struct AppState {
    pub drawing: Mutex<DrawingState>,
    pub level: Mutex<platform::Level>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            drawing: Mutex::new(DrawingState::default()),
            level: Mutex::new(platform::Level::ScreenSaver),
        }
    }
}

#[tauri::command]
fn get_drawing_state(state: State<'_, AppState>) -> DrawingState {
    state.drawing.lock().unwrap().clone()
}

#[tauri::command]
fn select_tool(app: AppHandle, tool: Tool) -> Result<(), String> {
    windows::select_tool(&app, tool)
}

#[tauri::command]
fn begin_text_edit(app: AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    windows::begin_text_edit(&app, window.label())
}

#[tauri::command]
fn end_text_edit(app: AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    if app
        .state::<displays::Displays>()
        .text_owner
        .lock()
        .unwrap()
        .as_deref()
        != Some(window.label())
    {
        return Ok(());
    }
    windows::end_text_edit(&app)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Features {
    native_eyedropper: bool,
    web_eyedropper: bool,
    annotation_error: Option<String>,
}

#[tauri::command]
fn get_features(app: AppHandle) -> Features {
    Features {
        native_eyedropper: cfg!(all(target_os = "macos", feature = "native-eyedropper")),
        web_eyedropper: cfg!(target_os = "windows"),
        annotation_error: app
            .state::<displays::Displays>()
            .sessions
            .lock()
            .unwrap()
            .error
            .clone(),
    }
}

#[tauri::command]
fn begin_sampling(app: AppHandle) -> Result<(), String> {
    windows::begin_sampling(&app)
}
#[tauri::command]
fn end_sampling(app: AppHandle) -> Result<(), String> {
    windows::finish_sampling(&app, None)
}
#[tauri::command]
fn sample_color(app: AppHandle) -> Result<(), String> {
    if !cfg!(all(target_os = "macos", feature = "native-eyedropper")) {
        return Err("Native color sampling is disabled".into());
    }
    windows::begin_sampling(&app)?;
    if let Err(error) = platform::sample_color(&app) {
        let _ = windows::finish_sampling(&app, None);
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
fn set_color(app: AppHandle, state: State<'_, AppState>, color: String) -> Result<(), String> {
    if color.len() != 7
        || !color.starts_with('#')
        || !color[1..].bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err("Choose a valid six-digit hex color".into());
    }
    let snapshot = {
        let mut drawing = state.drawing.lock().unwrap();
        drawing.color = color.to_uppercase();
        drawing.revision += 1;
        drawing.clone()
    };
    app.emit("color:changed", snapshot)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_annotations(app: AppHandle) -> Result<(), String> {
    displays::history_action(&app, "annotations:clear")
}

#[tauri::command]
fn close_hotbar(app: AppHandle) -> Result<(), String> {
    windows::hide_hotbar(&app)
}

#[tauri::command]
fn set_picker_open(app: AppHandle, open: bool) -> Result<(), String> {
    windows::set_picker_open(&app, open).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_agenda_state(app: AppHandle) -> Result<agenda::AgendaState, String> {
    agenda::get(&app)
}

#[tauri::command]
fn toggle_sticky(app: AppHandle) -> Result<agenda::AgendaState, String> {
    agenda::toggle(&app)
}

#[tauri::command]
fn navigate_agenda(
    app: AppHandle,
    direction: agenda::Direction,
) -> Result<agenda::AgendaState, String> {
    agenda::navigate(&app, direction)
}

#[tauri::command]
fn set_agenda_item_done(
    app: AppHandle,
    section_id: String,
    item_id: String,
    done: bool,
) -> Result<agenda::AgendaState, String> {
    agenda::set_done(&app, &section_id, &item_id, done)
}

#[tauri::command]
fn resize_sticky(app: AppHandle, height: f64) -> Result<f64, String> {
    windows::resize_sticky(&app, height)
}

#[tauri::command]
fn edit_agenda(app: AppHandle, edit: editing::AgendaEdit) -> Result<agenda::AgendaState, String> {
    editing::apply(&app, edit)
}
#[tauri::command]
fn open_setup(app: AppHandle) -> Result<(), String> {
    setup::open(&app)
}
#[tauri::command]
fn request_setup_close(app: AppHandle) {
    setup::request_close(&app);
}
#[tauri::command]
fn close_setup(app: AppHandle) -> Result<(), String> {
    setup::close(&app)
}
#[tauri::command]
fn start_sticky_drag(app: AppHandle) -> Result<(), String> {
    windows::start_sticky_drag(&app)
}

#[tauri::command]
fn get_overlay_session(
    app: AppHandle,
    window: tauri::WebviewWindow,
) -> Result<sessions::Snapshot, String> {
    app.state::<displays::Displays>()
        .sessions
        .lock()
        .unwrap()
        .get(window.label())
}
#[tauri::command]
fn save_overlay_session(
    app: AppHandle,
    window: tauri::WebviewWindow,
    snapshot: serde_json::Value,
    generation: u64,
) -> Result<(), String> {
    app.state::<displays::Displays>()
        .sessions
        .lock()
        .unwrap()
        .save(window.label(), generation, snapshot)
}
#[tauri::command]
fn overlay_session_ready(
    app: AppHandle,
    window: tauri::WebviewWindow,
    generation: u64,
) -> Result<bool, String> {
    displays::ready_session(&app, window.label(), generation)
}

#[tauri::command]
fn get_shortcuts(app: AppHandle) -> shortcuts::Snapshot {
    shortcuts::get(&app)
}
#[tauri::command]
fn set_shortcut(
    app: AppHandle,
    action: shortcuts::Action,
    binding: String,
) -> Result<shortcuts::Snapshot, String> {
    shortcuts::update(&app, action, binding)
}

#[tauri::command]
fn record_shortcut(app: AppHandle, active: bool) -> Result<(), String> {
    shortcuts::record(&app, active)
}

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(shortcuts::plugin());
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init());

    builder
        .manage(AppState::default())
        .manage(displays::Displays::default())
        .manage(windows::StickyLayout::default())
        .manage(setup::SetupState::default())
        .invoke_handler(tauri::generate_handler![
            record_shortcut,
            get_shortcuts,
            set_shortcut,
            get_overlay_session,
            save_overlay_session,
            overlay_session_ready,
            get_drawing_state,
            select_tool,
            begin_text_edit,
            end_text_edit,
            get_features,
            begin_sampling,
            end_sampling,
            sample_color,
            set_color,
            clear_annotations,
            close_hotbar,
            set_picker_open,
            get_agenda_state,
            toggle_sticky,
            navigate_agenda,
            set_agenda_item_done,
            resize_sticky,
            edit_agenda,
            open_setup,
            close_setup,
            request_setup_close,
            start_sticky_drag
        ])
        .setup(|app| {
            platform::init_app(app);
            let handle = app.handle();
            agenda::init(handle)?;
            displays::reconcile(handle).map_err(std::io::Error::other)?;
            windows::create_hotbar(handle)?;
            windows::create_sticky(handle)?;
            shortcuts::init(handle).map_err(std::io::Error::other)?;
            platform::watch_displays(handle)?;
            tray::create(handle)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Waypoint")
        .run(|_app, event| {
            if matches!(event, RunEvent::Exit) {
                platform::stop_display_watch();
            }
            if let RunEvent::ExitRequested {
                code: None, api, ..
            } = event
            {
                api.prevent_exit();
            }
        });
}
