fn main() {
    // Bake the commit this build came from into the binary for "Check for updates".
    let sha = std::process::Command::new("git")
        .args(["rev-parse", "HEAD"])
        .output()
        .ok()
        .filter(|out| out.status.success())
        .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_string())
        .unwrap_or_default();
    println!("cargo:rustc-env=WAYPOINT_GIT_SHA={sha}");
    println!("cargo:rerun-if-changed=../.git/HEAD");
    println!("cargo:rerun-if-changed=../.git/refs/heads");
    // Declaring the app's commands here makes Tauri generate `allow-<command>` permissions
    // and deny them by default, so each window gets only what its capability file grants.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "record_shortcut",
            "get_shortcuts",
            "set_shortcut",
            "get_overlay_session",
            "save_overlay_session",
            "overlay_session_ready",
            "get_drawing_state",
            "select_tool",
            "begin_text_edit",
            "end_text_edit",
            "get_features",
            "begin_sampling",
            "end_sampling",
            "sample_color",
            "set_color",
            "clear_annotations",
            "close_hotbar",
            "set_picker_open",
            "get_agenda_state",
            "toggle_sticky",
            "navigate_agenda",
            "set_agenda_item_done",
            "resize_sticky",
            "edit_agenda",
            "open_setup",
            "close_setup",
            "request_setup_close",
            "start_sticky_drag",
            "begin_sticky_edit",
            "end_sticky_edit",
        ]),
    ))
    .expect("failed to run tauri-build");
}
