//! Menu bar icon. Left click toggles the floating window (the hotbar). Right click opens the menu.

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::platform::Level;
use crate::{agenda, windows, AppState};

const TOGGLE_PANEL: &str = "toggle_panel";
const CLICK_THROUGH: &str = "click_through";
const CLEAR: &str = "clear";
const QUIT: &str = "quit";

/// Menu items whose checked state mirrors app state.
pub struct TrayItems {
    click_through: CheckMenuItem<Wry>,
    sticky: CheckMenuItem<Wry>,
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
        !state.drawing.lock().unwrap().armed,
        None::<&str>,
    )?;
    let sticky = CheckMenuItem::with_id(
        app,
        "sticky_toggle",
        "Waypoint sticky (Ctrl+Option+S)",
        true,
        agenda::get(app)
            .map(|state| state.settings.enabled)
            .unwrap_or(false),
        None::<&str>,
    )?;
    let levels = Level::ALL
        .into_iter()
        .map(|level| {
            CheckMenuItem::with_id(
                app,
                level.id(),
                level.label(),
                true,
                level == current_level,
                None::<&str>,
            )
            .map(|item| (level, item))
        })
        .collect::<tauri::Result<Vec<_>>>()?;
    let level_refs: Vec<&dyn tauri::menu::IsMenuItem<Wry>> = levels
        .iter()
        .map(|(_, item)| item as &dyn tauri::menu::IsMenuItem<Wry>)
        .collect();
    let level_menu = Submenu::with_items(app, "Window level", true, &level_refs)?;

    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, TOGGLE_PANEL, "Show/Hide hotbar", true, None::<&str>)?,
            &MenuItem::with_id(
                app,
                "sticky_setup",
                "Waypoint sticky setup (coming soon)",
                false,
                None::<&str>,
            )?,
            &sticky,
            &click_through,
            &level_menu,
            &MenuItem::with_id(app, "undo", "Undo annotation", true, None::<&str>)?,
            &MenuItem::with_id(app, "redo", "Redo annotation", true, None::<&str>)?,
            &MenuItem::with_id(app, CLEAR, "Clear annotations", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                QUIT,
                format!("Quit {}", crate::APP_NAME),
                true,
                None::<&str>,
            )?,
        ],
    )?;

    app.manage(TrayItems {
        click_through,
        sticky,
        levels,
    });

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
                if let Err(err) = windows::toggle_hotbar(tray.app_handle()) {
                    eprintln!("[tray] toggle hotbar: {err}");
                }
            }
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            let result = match id {
                TOGGLE_PANEL => windows::toggle_hotbar(app),
                "sticky_toggle" => agenda::toggle(app).map(|_| ()),
                CLICK_THROUGH => windows::toggle_click_through(app),
                CLEAR | "undo" | "redo" => windows::end_text_edit(app).and_then(|()| {
                    app.emit(
                        match id {
                            "undo" => "annotations:undo",
                            "redo" => "annotations:redo",
                            _ => "annotations:clear",
                        },
                        (),
                    )
                    .map_err(|e| e.to_string())
                }),
                QUIT => {
                    app.exit(0);
                    Ok(())
                }
                other => match Level::from_id(other) {
                    Some(level) => windows::set_level(app, level).map_err(|e| e.to_string()),
                    None => Ok(()),
                },
            };
            if let Err(err) = result {
                eprintln!("[tray] {id}: {err}");
            }
        })
        .build(app)?;
    sync(app);
    Ok(())
}

/// Re-applies checkmarks after state changes from any source (menu, shortcut, panel button).
pub fn sync(app: &AppHandle) {
    let Some(items) = app.try_state::<TrayItems>() else {
        return;
    };
    let state = app.state::<AppState>();
    if let Ok(agenda) = agenda::get(app) {
        let _ = items.sticky.set_checked(agenda.settings.enabled);
    }
    let _ = items
        .click_through
        .set_checked(!state.drawing.lock().unwrap().armed);
    if let Some(tray) = app.tray_by_id("main") {
        let visible = app
            .get_webview_window(windows::HOTBAR)
            .and_then(|window| window.is_visible().ok())
            .unwrap_or(false);
        let icon = if visible {
            tauri::include_image!("icons/tray-active-template.png")
        } else {
            tauri::include_image!("icons/tray-template.png")
        };
        if let Err(err) = tray.set_icon_with_as_template(Some(icon), true) {
            eprintln!("[tray] active icon: {err}");
        }
    }
    let current = *state.level.lock().unwrap();
    for (level, item) in &items.levels {
        let _ = item.set_checked(*level == current);
    }
}
