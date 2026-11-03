//! Menu bar icon. Left click toggles the floating window (the test panel in M0, the hotbar
//! from M1). Right click opens the menu.

use std::sync::atomic::Ordering;

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::platform::Level;
use crate::{windows, AppState};

const TOGGLE_PANEL: &str = "toggle_panel";
const CLICK_THROUGH: &str = "click_through";
const CLEAR: &str = "clear";
const QUIT: &str = "quit";

/// Menu items whose checked state mirrors app state.
pub struct TrayItems {
    click_through: CheckMenuItem<Wry>,
    levels: Vec<(Level, CheckMenuItem<Wry>)>,
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let state = app.state::<AppState>();
    let current_level = *state.level.lock().unwrap();

    let click_through = CheckMenuItem::with_id(
        app,
        CLICK_THROUGH,
        "Click-through (⌃⌥D)",
        true,
        state.click_through.load(Ordering::SeqCst),
        None::<&str>,
    )?;
    let levels = Level::ALL
        .into_iter()
        .map(|level| {
            CheckMenuItem::with_id(app, level.id(), level.label(), true, level == current_level, None::<&str>)
                .map(|item| (level, item))
        })
        .collect::<tauri::Result<Vec<_>>>()?;
    let level_refs: Vec<&dyn tauri::menu::IsMenuItem<Wry>> =
        levels.iter().map(|(_, item)| item as &dyn tauri::menu::IsMenuItem<Wry>).collect();
    let level_menu = Submenu::with_items(app, "Window level", true, &level_refs)?;

    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, TOGGLE_PANEL, "Show/Hide test panel", true, None::<&str>)?,
            &click_through,
            &level_menu,
            &MenuItem::with_id(app, CLEAR, "Clear annotations", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, QUIT, format!("Quit {}", crate::APP_NAME), true, None::<&str>)?,
        ],
    )?;

    app.manage(TrayItems { click_through, levels });

    TrayIconBuilder::with_id("main")
        .icon(tauri::include_image!("icons/tray-template.png"))
        .icon_as_template(true)
        .tooltip(crate::APP_NAME)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = windows::toggle_spike(tray.app_handle());
            }
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            let result = match id {
                TOGGLE_PANEL => windows::toggle_spike(app),
                CLICK_THROUGH => windows::toggle_click_through(app),
                CLEAR => app.emit("annotations:clear", ()),
                QUIT => {
                    app.exit(0);
                    Ok(())
                }
                other => match Level::from_id(other) {
                    Some(level) => windows::set_level(app, level),
                    None => Ok(()),
                },
            };
            if let Err(err) = result {
                eprintln!("[tray] {id}: {err}");
            }
        })
        .build(app)?;
    Ok(())
}

/// Re-applies checkmarks after state changes from any source (menu, shortcut, panel button).
pub fn sync(app: &AppHandle) {
    let Some(items) = app.try_state::<TrayItems>() else {
        return;
    };
    let state = app.state::<AppState>();
    let _ = items.click_through.set_checked(state.click_through.load(Ordering::SeqCst));
    let current = *state.level.lock().unwrap();
    for (level, item) in &items.levels {
        let _ = item.set_checked(*level == current);
    }
}
