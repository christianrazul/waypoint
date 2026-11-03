# Waypoint

Screen annotation and agenda sticky for presenters. Tauri 2 + React 18.

## Status

M0 spike: tray icon, a transparent always-on-top overlay with a click-through toggle, and a
non-activating test panel. See the milestone notes in the PR / chat for findings.

## Requirements

- macOS 13+ (Windows 10/11 support lands in M5)
- Rust 1.80+ (tested with 1.98.1), Node 20+ (tested with 24.13), pnpm 10

## Run

```bash
pnpm install
pnpm tauri dev
```

There is no Dock icon. Use the pen-nib icon in the menu bar:

- Left click: show or hide the test panel
- Right click: menu (click-through, window level, clear annotations, quit)
- Ctrl+Option+D: toggle drawing / pass-through

## Layout

- `src-tauri/src/platform/{macos,windows}.rs`: all OS-specific code, behind `platform/mod.rs`
- `src-tauri/src/{windows,tray,shortcuts}.rs`: window lifecycle, menu bar, global shortcuts
- `src-tauri/capabilities/*.json`: one least-privilege capability per window
- `src/{overlay,spike,shared}`: one React entry per webview plus shared IPC and tokens
