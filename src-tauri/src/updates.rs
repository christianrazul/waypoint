//! "Check for updates": compares the commit this build came from with `main` on GitHub and,
//! on request, runs `scripts/update-macos.sh` in Terminal to pull, rebuild and replace the app.
//! macOS only; shells out to `curl` and `osascript` so no extra dependencies are needed.

use std::path::PathBuf;
use std::process::Command;

use tauri::AppHandle;

const BUILT_SHA: &str = env!("WAYPOINT_GIT_SHA");
const REPO: &str = "christianrazul/waypoint";

enum Status {
    UpToDate,
    Behind(u64),
    Unknown(String),
}

pub fn check(_app: &AppHandle) {
    // Network + dialogs block, so keep them off the menu event thread.
    std::thread::spawn(|| match fetch_status() {
        Status::UpToDate => {
            dialog("Waypoint is up to date.", &["OK"]);
        }
        Status::Behind(n) => {
            let plural = if n == 1 { "" } else { "s" };
            let msg = format!(
                "{n} new commit{plural} on main. Pull, rebuild and replace the app now?\\n\\nWaypoint will quit and relaunch."
            );
            if dialog(&msg, &["Later", "Update Now"]).as_deref() == Some("Update Now") {
                if let Err(err) = run_update() {
                    dialog(&format!("Could not start the update: {err}"), &["OK"]);
                }
            }
        }
        Status::Unknown(reason) => {
            dialog(&format!("Could not check for updates: {reason}"), &["OK"]);
        }
    });
}

fn fetch_status() -> Status {
    if BUILT_SHA.is_empty() {
        return Status::Unknown("this build has no commit information.".into());
    }
    let url = format!("https://api.github.com/repos/{REPO}/compare/{BUILT_SHA}...main");
    let out = Command::new("curl")
        .args(["-sS", "--max-time", "10", "-H", "Accept: application/vnd.github+json", &url])
        .output();
    let body = match out {
        Ok(o) if o.status.success() => o.stdout,
        Ok(o) => return Status::Unknown(String::from_utf8_lossy(&o.stderr).trim().to_string()),
        Err(err) => return Status::Unknown(err.to_string()),
    };
    let json: serde_json::Value = match serde_json::from_slice(&body) {
        Ok(json) => json,
        Err(err) => return Status::Unknown(err.to_string()),
    };
    match json["status"].as_str() {
        Some("identical") | Some("behind") => Status::UpToDate,
        Some("ahead") | Some("diverged") => Status::Behind(json["ahead_by"].as_u64().unwrap_or(1)),
        _ => Status::Unknown(
            json["message"]
                .as_str()
                .unwrap_or("unexpected response from GitHub.")
                .to_string(),
        ),
    }
}

/// Shows a native dialog and returns the clicked button, or None if it was dismissed.
fn dialog(message: &str, buttons: &[&str]) -> Option<String> {
    let list = buttons
        .iter()
        .map(|b| format!("\"{b}\""))
        .collect::<Vec<_>>()
        .join(", ");
    let default = buttons.last()?;
    let message = message.replace('"', "'");
    let script = format!(
        "display dialog \"{message}\" with title \"Waypoint\" buttons {{{list}}} default button \"{default}\""
    );
    let out = Command::new("osascript").args(["-e", &script]).output().ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8_lossy(&out.stdout)
        .trim()
        .strip_prefix("button returned:")
        .map(|b| b.split(',').next().unwrap_or(b).to_string())
}

fn run_update() -> Result<(), String> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(PathBuf::from)
        .ok_or("repository path not found")?;
    let script = root.join("scripts/update-macos.sh");
    if !script.exists() {
        return Err(format!("{} not found", script.display()));
    }
    // Run in Terminal so build progress is visible; the script quits and relaunches the app.
    let command = format!("cd '{}' && ./scripts/update-macos.sh", root.display());
    let status = Command::new("osascript")
        .args([
            "-e",
            "tell application \"Terminal\" to activate",
            "-e",
            &format!("tell application \"Terminal\" to do script \"{command}\""),
        ])
        .status()
        .map_err(|e| e.to_string())?;
    status.success().then_some(()).ok_or_else(|| "osascript failed".into())
}
