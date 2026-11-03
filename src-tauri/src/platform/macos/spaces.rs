use objc2::{rc::Retained, runtime::AnyObject};
use objc2_foundation::{NSJSONSerialization, NSJSONWritingOptions, NSString};
use serde::Deserialize;
use std::{
    ffi::{c_char, c_void},
    sync::OnceLock,
};
use tauri::Monitor;

type Connection = unsafe extern "C" fn() -> i32;
type CopySpaces = unsafe extern "C" fn(i32) -> *mut AnyObject;
struct Api {
    connection: Connection,
    copy: CopySpaces,
}
static API: OnceLock<Result<Api, String>> = OnceLock::new();

#[link(name = "System")]
extern "C" {
    fn dlopen(path: *const c_char, mode: i32) -> *mut c_void;
    fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
}
#[repr(C)]
struct Point {
    x: f64,
    y: f64,
}
#[repr(C)]
struct Size {
    width: f64,
    height: f64,
}
#[repr(C)]
struct Rect {
    origin: Point,
    size: Size,
}
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGGetActiveDisplayList(max: u32, displays: *mut u32, count: *mut u32) -> i32;
    fn CGDisplayBounds(display: u32) -> Rect;
    fn CGDisplayCreateUUIDFromDisplayID(display: u32) -> *const c_void;
}
#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFUUIDCreateString(allocator: *const c_void, uuid: *const c_void) -> *mut NSString;
    fn CFRelease(value: *const c_void);
}

fn api() -> Result<&'static Api, String> {
    API.get_or_init(|| unsafe {
        // Keep the framework loaded for the lifetime of the cached function pointers.
        let handle = dlopen(
            c"/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight".as_ptr(),
            1,
        );
        if handle.is_null() {
            return Err("macOS Space services are unavailable".into());
        }
        let symbol = |names: &[&std::ffi::CStr]| {
            names
                .iter()
                .map(|name| dlsym(handle, name.as_ptr()))
                .find(|pointer| !pointer.is_null())
        };
        let connection = symbol(&[c"SLSMainConnectionID", c"CGSMainConnectionID"])
            .ok_or("macOS Space connection API is unavailable")?;
        let copy = symbol(&[
            c"SLSCopyManagedDisplaySpaces",
            c"CGSCopyManagedDisplaySpaces",
        ])
        .ok_or("macOS Space lookup API is unavailable")?;
        Ok(Api {
            connection: std::mem::transmute::<*mut c_void, Connection>(connection),
            copy: std::mem::transmute::<*mut c_void, CopySpaces>(copy),
        })
    })
    .as_ref()
    .map_err(Clone::clone)
}

#[derive(Deserialize)]
struct Space {
    uuid: Option<String>,
    id64: Option<u64>,
}
#[derive(Deserialize)]
struct Display {
    #[serde(rename = "Display Identifier")]
    identifier: String,
    #[serde(rename = "Current Space")]
    current: Space,
}
fn scope(displays: &[Display], uuid: &str) -> Result<String, String> {
    let display = displays
        .iter()
        .find(|d| d.identifier.eq_ignore_ascii_case(uuid))
        .or_else(|| (displays.len() == 1 && displays[0].identifier == "Main").then(|| &displays[0]))
        .ok_or("No active Space was reported for a connected display")?;
    if let Some(uuid) = display
        .current
        .uuid
        .as_ref()
        .filter(|id| !id.trim().is_empty())
    {
        return Ok(format!("space:{uuid}"));
    }
    display
        .current
        .id64
        .filter(|id| *id != 0)
        .map(|id| format!("space-id:{id}"))
        .ok_or("macOS returned an invalid active Space identity".into())
}
fn topology() -> Result<Vec<Display>, String> {
    let api = api()?;
    let objects = unsafe { Retained::from_raw((api.copy)((api.connection)())) }
        .ok_or("macOS did not return Space information")?;
    let data = unsafe {
        NSJSONSerialization::dataWithJSONObject_options_error(
            &objects,
            NSJSONWritingOptions::empty(),
        )
    }
    .map_err(|error| format!("Cannot decode macOS Spaces: {error}"))?;
    let displays: Vec<Display> = serde_json::from_slice(&data.to_vec())
        .map_err(|error| format!("Unexpected macOS Space format: {error}"))?;
    if displays.is_empty() {
        return Err("macOS returned no active Spaces".into());
    }
    Ok(displays)
}
fn display_uuid(id: u32) -> Result<String, String> {
    unsafe {
        let uuid = CGDisplayCreateUUIDFromDisplayID(id);
        if uuid.is_null() {
            return Err("Cannot identify the connected display".into());
        }
        let text = Retained::from_raw(CFUUIDCreateString(std::ptr::null(), uuid));
        CFRelease(uuid);
        text.map(|s| s.to_string())
            .ok_or("Cannot read the display identity".into())
    }
}
pub fn active(monitors: &[Monitor]) -> Result<Vec<String>, String> {
    let topology = topology()?;
    let mut count = 0;
    if unsafe { CGGetActiveDisplayList(0, std::ptr::null_mut(), &mut count) } != 0 || count == 0 {
        return Err("Cannot enumerate displays for Space lookup".into());
    }
    let mut ids = vec![0; count as usize];
    if unsafe { CGGetActiveDisplayList(count, ids.as_mut_ptr(), &mut count) } != 0 {
        return Err("Displays changed during Space lookup".into());
    }
    ids.truncate(count as usize);
    monitors
        .iter()
        .map(|monitor| {
            let scale = monitor.scale_factor();
            let origin = monitor.position().to_logical::<f64>(scale);
            let size = monitor.size().to_logical::<f64>(scale);
            let matches: Vec<_> = ids
                .iter()
                .filter(|id| {
                    let bounds = unsafe { CGDisplayBounds(**id) };
                    [
                        (bounds.origin.x, origin.x),
                        (bounds.origin.y, origin.y),
                        (bounds.size.width, size.width),
                        (bounds.size.height, size.height),
                    ]
                    .iter()
                    .all(|(a, b)| (a - b).abs() < 1.0)
                })
                .collect();
            if matches.len() != 1 {
                return Err("Cannot uniquely map a monitor to its macOS Space".into());
            }
            scope(&topology, &display_uuid(*matches[0])?)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn matches_each_display_and_prefers_space_uuid_over_desktop_order() {
        let displays: Vec<Display> = serde_json::from_value(json!([
            {"Display Identifier":"left", "Current Space":{"uuid":"a", "id64":1}},
            {"Display Identifier":"right", "Current Space":{"uuid":"b", "id64":2}}
        ]))
        .unwrap();
        assert_eq!(scope(&displays, "LEFT").unwrap(), "space:a");
        assert_eq!(scope(&displays, "right").unwrap(), "space:b");
        assert!(scope(&displays, "missing").is_err());
    }
    #[test]
    fn supports_shared_spaces_but_rejects_missing_or_invalid_identity() {
        let displays: Vec<Display> = serde_json::from_value(json!([
            {"Display Identifier":"Main", "Current Space":{"id64":42}}
        ]))
        .unwrap();
        assert_eq!(scope(&displays, "left").unwrap(), "space-id:42");
        assert_eq!(scope(&displays, "right").unwrap(), "space-id:42");
        let invalid: Vec<Display> = serde_json::from_value(json!([
            {"Display Identifier":"Main", "Current Space":{"id64":0}}
        ]))
        .unwrap();
        assert!(scope(&invalid, "left").is_err());
        assert!(scope(&[], "left").is_err());
    }
    #[test]
    #[ignore = "Requires a logged-in macOS WindowServer session"]
    fn native_topology_is_available() {
        let displays = topology().unwrap();
        for display in &displays {
            assert!(scope(&displays, &display.identifier).is_ok());
        }
        let mut ids = [0u32; 32];
        let mut count = 0;
        assert_eq!(
            unsafe { CGGetActiveDisplayList(32, ids.as_mut_ptr(), &mut count) },
            0
        );
        assert!(count > 0);
        for id in &ids[..count as usize] {
            assert!(scope(&displays, &display_uuid(*id).unwrap()).is_ok());
        }
        println!(
            "Read active Space identities for {} display groups",
            displays.len()
        );
    }
}
