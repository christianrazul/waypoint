fn main() {
    // Declaring the app's commands here makes Tauri generate `allow-<command>` permissions
    // and deny them by default, so each window gets only what its capability file grants.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_drawing_state",
            "toggle_pen",
            "set_color",
            "clear_annotations",
            "close_hotbar",
            "set_picker_open",
        ]),
    ))
    .expect("failed to run tauri-build");
}
