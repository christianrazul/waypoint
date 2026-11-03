//! Windows: topmost + skip-taskbar come from the window builder, and `focusable(false)` makes
//! tao add WS_EX_NOACTIVATE, so clicks never take focus from the slideshow.
//! Not yet compiled or tested; Windows verification is scheduled for M5.

use super::Level;

pub fn init_app(_app: &mut tauri::App) {}

pub fn configure_overlay(window: &tauri::WebviewWindow, _level: Level) -> tauri::Result<()> {
    window.set_always_on_top(true)
}

pub fn configure_floating(window: &tauri::WebviewWindow, _level: Level) -> tauri::Result<()> {
    window.set_always_on_top(true)
}

pub fn apply_level(_app: &tauri::AppHandle, _overlay: &[&str], _floating: &[&str], _level: Level) {}

pub fn show_without_focus(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    // WS_EX_NOACTIVATE windows do not activate on show.
    window.show()
}

use std::sync::atomic::{AtomicIsize, Ordering};
use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, SetForegroundWindow};
static PREVIOUS_WINDOW: AtomicIsize = AtomicIsize::new(0);

pub fn begin_text_edit(window: &tauri::WebviewWindow) -> Result<(), String> {
    PREVIOUS_WINDOW.store(unsafe { GetForegroundWindow() } as isize, Ordering::SeqCst);
    window.set_focusable(true).map_err(|e| e.to_string())?;
    if let Err(error) = window.set_focus() {
        let _ = window.set_focusable(false);
        PREVIOUS_WINDOW.store(0, Ordering::SeqCst);
        return Err(error.to_string());
    }
    Ok(())
}
pub fn end_text_edit(window: &tauri::WebviewWindow) -> Result<(), String> {
    window.set_focusable(false).map_err(|e| e.to_string())?;
    let previous = PREVIOUS_WINDOW.swap(0, Ordering::SeqCst);
    let current = unsafe { GetForegroundWindow() };
    let own = window.hwnd().map_err(|e| e.to_string())?.0;
    if previous != 0
        && (current == own || current as isize == previous)
        && unsafe { SetForegroundWindow(previous as _) } == 0
    {
        return Err("Could not return keyboard focus to the presenting app".into());
    }
    Ok(())
}
pub fn sample_color(_app: &tauri::AppHandle) -> Result<(), String> {
    Err("Use the web eyedropper on Windows".into())
}

pub fn configure_setup(window: &tauri::WebviewWindow, _level: Level) -> tauri::Result<()> {
    window.set_always_on_top(true)
}
pub fn focus_setup(window: &tauri::WebviewWindow, remember: bool) -> Result<(), String> {
    if remember {
        PREVIOUS_WINDOW.store(unsafe { GetForegroundWindow() } as isize, Ordering::SeqCst);
    }
    window.set_focusable(true).map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}
pub fn release_setup(window: &tauri::WebviewWindow) -> Result<(), String> {
    end_text_edit(window)
}

pub fn watch_displays(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::Manager;
    use windows_sys::Win32::UI::Shell::SetWindowSubclass;
    let window = app
        .get_webview_window(crate::windows::HOTBAR)
        .ok_or(tauri::Error::WindowNotFound)?;
    let handle = Box::into_raw(Box::new(app.clone()));
    if unsafe { SetWindowSubclass(window.hwnd()?.0, Some(display_message), 1, handle as usize) }
        == 0
    {
        unsafe {
            drop(Box::from_raw(handle));
        }
        return Err(std::io::Error::last_os_error().into());
    }
    Ok(())
}
unsafe extern "system" fn display_message(
    hwnd: windows_sys::Win32::Foundation::HWND,
    message: u32,
    wparam: usize,
    lparam: isize,
    id: usize,
    data: usize,
) -> isize {
    use windows_sys::Win32::UI::{
        Shell::{DefSubclassProc, RemoveWindowSubclass},
        WindowsAndMessaging::{WM_DISPLAYCHANGE, WM_DPICHANGED, WM_NCDESTROY, WM_SETTINGCHANGE},
    };
    if message == WM_DISPLAYCHANGE || message == WM_DPICHANGED || message == WM_SETTINGCHANGE {
        crate::displays::request_refresh(&*(data as *const tauri::AppHandle));
    }
    if message == WM_NCDESTROY {
        RemoveWindowSubclass(hwnd, Some(display_message), id);
        drop(Box::from_raw(data as *mut tauri::AppHandle));
    }
    DefSubclassProc(hwnd, message, wparam, lparam)
}
pub fn stop_display_watch() {}
pub fn forget_overlay(_app: &tauri::AppHandle, _label: &str) {}
