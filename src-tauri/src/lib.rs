mod platform;
mod shortcuts;
mod tray;
mod windows;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, RunEvent, State};

/// Working product name. Change it here (and `productName` in tauri.conf.json for bundles).
pub const APP_NAME: &str = "Waypoint";

pub struct AppState {
    pub click_through: AtomicBool,
    pub level: Mutex<platform::Level>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            click_through: AtomicBool::new(true),
            level: Mutex::new(platform::Level::ScreenSaver),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SpikeState {
    app_name: &'static str,
    click_through: bool,
    level: platform::Level,
    frontmost_app: Option<String>,
}

#[tauri::command]
fn get_spike_state(state: State<'_, AppState>) -> SpikeState {
    SpikeState {
        app_name: APP_NAME,
        click_through: state.click_through.load(Ordering::SeqCst),
        level: *state.level.lock().unwrap(),
        frontmost_app: platform::frontmost_app(),
    }
}

#[tauri::command]
fn set_click_through(app: AppHandle, enabled: bool) -> Result<(), String> {
    windows::set_click_through(&app, enabled).map_err(|err| err.to_string())
}

/// Logs each test-panel click with the frontmost app, so focus can be checked from the terminal.
#[tauri::command]
fn spike_ping(count: u32) {
    println!(
        "[spike] click #{count}, frontmost app: {}",
        platform::frontmost_app().unwrap_or_else(|| "unknown".into())
    );
}

pub fn run() {
    let builder = tauri::Builder::default().plugin(shortcuts::plugin());
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init());

    builder
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![get_spike_state, set_click_through, spike_ping])
        .setup(|app| {
            platform::init_app(app);
            let handle = app.handle();
            windows::create_overlay(handle)?;
            windows::create_spike(handle)?;
            tray::create(handle)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Waypoint")
        .run(|_app, event| {
            // Menu bar app: closing windows must never quit. Only the tray Quit item exits.
            if let RunEvent::ExitRequested { code: None, api, .. } = event {
                api.prevent_exit();
            }
        });
}
