//! macOS: windows become NSPanels with the non-activating style mask, so clicking them never
//! activates Waypoint and the presenting app keeps keyboard focus.

use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication, NSWorkspace};
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use tauri::{ActivationPolicy, Manager};
use tauri_nspanel::{tauri_panel, CollectionBehavior, ManagerExt, StyleMask, WebviewWindowExt};

use super::Level;
mod spaces;

pub fn active_spaces(monitors: &[tauri::Monitor]) -> Result<Vec<String>, String> {
    spaces::active(monitors)
}

static TEXT_EDITING: AtomicBool = AtomicBool::new(false);
static STICKY_EDITING: AtomicBool = AtomicBool::new(false);
static STICKY_PREVIOUS_APP: AtomicI32 = AtomicI32::new(0);
static SETUP_PREVIOUS_APP: AtomicI32 = AtomicI32::new(0);
static PREVIOUS_APP: AtomicI32 = AtomicI32::new(0);

tauri_panel! {
    panel!(OverlayPanel {
        config: {
            can_become_key_window: TEXT_EDITING.load(Ordering::SeqCst),
            can_become_main_window: false,
            is_floating_panel: true
        }
    })
    panel!(SetupPanel {
        config: {
            can_become_key_window: true,
            can_become_main_window: false,
            is_floating_panel: true
        }
    })
    panel!(StickyPanel {
        config: {
            can_become_key_window: STICKY_EDITING.load(Ordering::SeqCst),
            can_become_main_window: false,
            is_floating_panel: true
        }
    })
    panel!(FloatingPanel {
        config: {
            can_become_key_window: false,
            can_become_main_window: false,
            is_floating_panel: true
        }
    })
}

mod setup_events {
    #![allow(clippy::unused_unit)]
    use tauri_nspanel::tauri_panel;
    tauri_panel! {
        panel_event!(SetupEvents {
            window_did_resign_key(notification: &NSNotification) -> ()
        })
    }
    pub fn install(window: &tauri::WebviewWindow) -> tauri::Result<()> {
        use tauri::Manager;
        use tauri_nspanel::ManagerExt;
        let panel = window
            .app_handle()
            .get_webview_panel(window.label())
            .map_err(|_| tauri::Error::WindowNotFound)?;
        let handler = SetupEvents::new();
        let app = window.app_handle().clone();
        handler.window_did_resign_key(move |_| {
            crate::setup::request_close(&app);
        });
        panel.set_event_handler(Some(handler.as_ref()));
        Ok(())
    }
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

enum Kind {
    Overlay,
    Sticky,
    Floating,
}

fn to_panel(window: &tauri::WebviewWindow, level: i64, kind: Kind) -> tauri::Result<()> {
    let panel = match kind {
        Kind::Overlay => window.to_panel::<OverlayPanel>()?,
        Kind::Sticky => window.to_panel::<StickyPanel>()?,
        Kind::Floating => window.to_panel::<FloatingPanel>()?,
    };
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
    to_panel(window, raw_level(level), Kind::Overlay)
}

pub fn configure_floating(window: &tauri::WebviewWindow, level: Level) -> tauri::Result<()> {
    let kind = if window.label() == crate::windows::STICKY {
        Kind::Sticky
    } else {
        Kind::Floating
    };
    to_panel(window, raw_level(level) + 1, kind)
}

pub fn configure_setup(window: &tauri::WebviewWindow, level: Level) -> tauri::Result<()> {
    let panel = window.to_panel::<SetupPanel>()?;
    panel
        .add_style_mask(StyleMask::empty().nonactivating_panel().into())
        .map_err(|err| tauri::Error::Anyhow(err.into()))?;
    panel.set_collection_behavior(behavior().into());
    panel.set_level(raw_level(level) + 2);
    panel.set_hides_on_deactivate(false);
    panel.set_has_shadow(false);
    setup_events::install(window)?;
    Ok(())
}

pub fn focus_setup(window: &tauri::WebviewWindow, remember: bool) -> Result<(), String> {
    if remember {
        let previous = NSWorkspace::sharedWorkspace().frontmostApplication();
        SETUP_PREVIOUS_APP.store(
            previous.map(|app| app.processIdentifier()).unwrap_or(0),
            Ordering::SeqCst,
        );
    }
    let panel = window
        .app_handle()
        .get_webview_panel(window.label())
        .map_err(|_| "Setup panel is unavailable")?;
    panel.show();
    panel.make_key_window();
    if !panel.as_panel().isKeyWindow() {
        return Err("Setup could not receive keyboard focus".into());
    }
    Ok(())
}

pub fn release_setup(window: &tauri::WebviewWindow) -> Result<(), String> {
    if let Ok(panel) = window.app_handle().get_webview_panel(window.label()) {
        panel.resign_key_window();
    }
    restore_app(SETUP_PREVIOUS_APP.swap(0, Ordering::SeqCst))
}

pub fn apply_level(
    app: &tauri::AppHandle,
    overlay_labels: &[&str],
    floating_labels: &[&str],
    level: Level,
) {
    let base = raw_level(level);
    for (labels, value) in [(overlay_labels, base), (floating_labels, base + 1)] {
        for label in labels {
            if let Ok(panel) = app.get_webview_panel(label) {
                panel.set_level(value);
            }
        }
    }
    if let Ok(panel) = app.get_webview_panel(crate::setup::SETUP) {
        panel.set_level(base + 2);
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

/// Lets a normally keyless panel take keyboard focus until `release_key`, remembering which
/// app was frontmost so focus can go back to the presentation afterwards.
fn take_key(
    window: &tauri::WebviewWindow,
    editing: &AtomicBool,
    previous_app: &AtomicI32,
) -> Result<(), String> {
    let panel = window
        .app_handle()
        .get_webview_panel(window.label())
        .map_err(|_| "Editor panel is unavailable".to_owned())?;
    let previous = NSWorkspace::sharedWorkspace().frontmostApplication();
    previous_app.store(
        previous.map(|app| app.processIdentifier()).unwrap_or(0),
        Ordering::SeqCst,
    );
    editing.store(true, Ordering::SeqCst);
    panel.make_key_window();
    if !panel.as_panel().isKeyWindow() {
        editing.store(false, Ordering::SeqCst);
        previous_app.store(0, Ordering::SeqCst);
        return Err("The text editor could not receive keyboard focus".into());
    }
    Ok(())
}

fn release_key(
    window: &tauri::WebviewWindow,
    editing: &AtomicBool,
    previous_app: &AtomicI32,
) -> Result<(), String> {
    editing.store(false, Ordering::SeqCst);
    if let Ok(panel) = window.app_handle().get_webview_panel(window.label()) {
        panel.resign_key_window();
    }
    restore_app(previous_app.swap(0, Ordering::SeqCst))
}

pub fn begin_text_edit(window: &tauri::WebviewWindow) -> Result<(), String> {
    take_key(window, &TEXT_EDITING, &PREVIOUS_APP)
}

pub fn end_text_edit(window: &tauri::WebviewWindow) -> Result<(), String> {
    release_key(window, &TEXT_EDITING, &PREVIOUS_APP)
}

pub fn begin_sticky_edit(window: &tauri::WebviewWindow) -> Result<(), String> {
    take_key(window, &STICKY_EDITING, &STICKY_PREVIOUS_APP)
}

pub fn end_sticky_edit(window: &tauri::WebviewWindow) -> Result<(), String> {
    release_key(window, &STICKY_EDITING, &STICKY_PREVIOUS_APP)
}

fn restore_app(pid: i32) -> Result<(), String> {
    let current = NSWorkspace::sharedWorkspace().frontmostApplication();
    let own_pid = NSRunningApplication::currentApplication().processIdentifier();
    let current_pid = current.map(|app| app.processIdentifier()).unwrap_or(0);
    if pid != 0 && pid != own_pid && (current_pid == own_pid || current_pid == pid) {
        if let Some(previous) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid) {
            if !previous.isTerminated()
                && !previous.activateWithOptions(NSApplicationActivationOptions::empty())
            {
                return Err("Could not return keyboard focus to the presenting app".into());
            }
        }
    }
    Ok(())
}

#[cfg(feature = "native-eyedropper")]
pub fn sample_color(app: &tauri::AppHandle) -> Result<(), String> {
    use block2::RcBlock;
    use objc2_app_kit::{NSColor, NSColorSampler, NSColorSpace};
    let handle = app.clone();
    let callback = RcBlock::new(move |color: *mut NSColor| {
        let selected = unsafe { color.as_ref() }
            .and_then(|color| color.colorUsingColorSpace(&NSColorSpace::sRGBColorSpace()));
        let hex = selected.map(|color| {
            let channel = |value: f64| (value.clamp(0.0, 1.0) * 255.0).round() as u8;
            format!(
                "#{:02X}{:02X}{:02X}",
                channel(color.redComponent()),
                channel(color.greenComponent()),
                channel(color.blueComponent())
            )
        });
        if let Err(error) = crate::windows::finish_sampling(&handle, hex) {
            eprintln!("[eyedropper] {error}");
        }
    });
    unsafe {
        NSColorSampler::new().showSamplerWithSelectionHandler(&callback);
    }
    Ok(())
}

#[cfg(not(feature = "native-eyedropper"))]
pub fn sample_color(_app: &tauri::AppHandle) -> Result<(), String> {
    Err("Native color sampling is disabled until focus behavior is verified".into())
}

thread_local! {
    static SCREEN_OBSERVER: std::cell::RefCell<Option<objc2::rc::Retained<objc2::runtime::ProtocolObject<dyn objc2_foundation::NSObjectProtocol>>>> = const { std::cell::RefCell::new(None) };
    static SPACE_OBSERVER: std::cell::RefCell<Option<objc2::rc::Retained<objc2::runtime::ProtocolObject<dyn objc2_foundation::NSObjectProtocol>>>> = const { std::cell::RefCell::new(None) };
}
pub fn watch_displays(app: &tauri::AppHandle) -> tauri::Result<()> {
    use objc2_foundation::NSNotificationCenter;
    let handle = app.clone();
    let callback = block2::RcBlock::new(
        move |_notification: std::ptr::NonNull<objc2_foundation::NSNotification>| {
            crate::displays::request_refresh(&handle);
        },
    );
    let observer = unsafe {
        NSNotificationCenter::defaultCenter().addObserverForName_object_queue_usingBlock(
            Some(objc2_app_kit::NSApplicationDidChangeScreenParametersNotification),
            None,
            None,
            &callback,
        )
    };
    SCREEN_OBSERVER.with(|slot| *slot.borrow_mut() = Some(observer));
    let handle = app.clone();
    let callback = block2::RcBlock::new(
        move |_notification: std::ptr::NonNull<objc2_foundation::NSNotification>| {
            crate::displays::request_session_refresh(&handle);
        },
    );
    let observer = unsafe {
        NSWorkspace::sharedWorkspace()
            .notificationCenter()
            .addObserverForName_object_queue_usingBlock(
                Some(objc2_app_kit::NSWorkspaceActiveSpaceDidChangeNotification),
                None,
                None,
                &callback,
            )
    };
    SPACE_OBSERVER.with(|slot| *slot.borrow_mut() = Some(observer));
    Ok(())
}
pub fn stop_display_watch() {
    SPACE_OBSERVER.with(|slot| {
        if let Some(observer) = slot.borrow_mut().take() {
            unsafe {
                NSWorkspace::sharedWorkspace()
                    .notificationCenter()
                    .removeObserver(AsRef::<objc2::runtime::AnyObject>::as_ref(&*observer));
            }
        }
    });
    SCREEN_OBSERVER.with(|slot| {
        if let Some(observer) = slot.borrow_mut().take() {
            unsafe {
                objc2_foundation::NSNotificationCenter::defaultCenter().removeObserver(AsRef::<
                    objc2::runtime::AnyObject,
                >::as_ref(
                    &*observer,
                ));
            }
        }
    });
}
pub fn forget_overlay(app: &tauri::AppHandle, label: &str) {
    app.remove_webview_panel(label);
}
