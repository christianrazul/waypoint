//! macOS: windows become NSPanels with the non-activating style mask, so clicking them never
//! activates Waypoint and the presenting app keeps keyboard focus.

use objc2_app_kit::NSWorkspace;
use tauri::{ActivationPolicy, Manager};
use tauri_nspanel::{tauri_panel, CollectionBehavior, ManagerExt, StyleMask, WebviewWindowExt};

use super::Level;

tauri_panel! {
    panel!(WaypointPanel {
        config: {
            // Never key, never main: key events keep going to Keynote / PowerPoint.
            // The M2 text tool will flip this through a static flag while typing.
            can_become_key_window: false,
            can_become_main_window: false,
            is_floating_panel: true
        }
    })
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGShieldingWindowLevel() -> i32;
}

fn raw_level(level: Level) -> i64 {
    match level {
        Level::Status => 25,
        Level::PopUpMenu => 101,
        Level::ScreenSaver => 1000,
        Level::Shielding => i64::from(unsafe { CGShieldingWindowLevel() }),
    }
}

pub fn init_app(app: &mut tauri::App) {
    // Accessory: no Dock icon, no app menu, never in Cmd-Tab.
    app.set_activation_policy(ActivationPolicy::Accessory);
}

fn behavior() -> CollectionBehavior {
    // can_join_all_spaces: on every Space. full_screen_auxiliary: allowed inside another app's
    // full-screen Space. stationary: unaffected by Exposé. ignores_cycle: not in Cmd-`.
    CollectionBehavior::new()
        .can_join_all_spaces()
        .full_screen_auxiliary()
        .stationary()
        .ignores_cycle()
}

fn to_panel(window: &tauri::WebviewWindow, level: i64) -> tauri::Result<()> {
    let panel = window.to_panel::<WaypointPanel>()?;
    panel
        .add_style_mask(StyleMask::empty().nonactivating_panel().into())
        .map_err(|err| tauri::Error::Anyhow(err.into()))?;
    panel.set_collection_behavior(behavior().into());
    panel.set_level(level);
    panel.set_hides_on_deactivate(false);
    panel.set_has_shadow(false);
    panel.set_works_when_modal(true);
    Ok(())
}

pub fn configure_overlay(window: &tauri::WebviewWindow, level: Level) -> tauri::Result<()> {
    to_panel(window, raw_level(level))
}

pub fn configure_floating(window: &tauri::WebviewWindow, level: Level) -> tauri::Result<()> {
    to_panel(window, raw_level(level) + 1)
}

pub fn apply_level(app: &tauri::AppHandle, overlay_labels: &[&str], floating_labels: &[&str], level: Level) {
    let base = raw_level(level);
    for (labels, value) in [(overlay_labels, base), (floating_labels, base + 1)] {
        for label in labels {
            if let Ok(panel) = app.get_webview_panel(label) {
                panel.set_level(value);
            }
        }
    }
}

pub fn show_without_focus(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    // orderFrontRegardless: shows the panel even though our app is never active.
    // WebviewWindow::show() would call makeKeyAndOrderFront and try to take focus.
    let panel = window
        .app_handle()
        .get_webview_panel(window.label())
        .map_err(|_| tauri::Error::WindowNotFound)?;
    panel.show();
    Ok(())
}

pub fn frontmost_app() -> Option<String> {
    let workspace = NSWorkspace::sharedWorkspace();
    let app = workspace.frontmostApplication()?;
    app.localizedName().map(|name| name.to_string())
}
