fn main() {
    // Declaring the app's commands here makes Tauri generate `allow-<command>` permissions
    // and deny them by default, so each window gets only what its capability file grants.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "get_spike_state",
            "set_click_through",
            "spike_ping",
        ])),
    )
    .expect("failed to run tauri-build");
}
