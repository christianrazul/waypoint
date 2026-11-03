fn main() {
    // Declaring the app's commands here makes Tauri generate `allow-<command>` permissions
    // and deny them by default, so each window gets only what its capability file grants.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
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
        ]),
    ))
    .expect("failed to run tauri-build");
}
