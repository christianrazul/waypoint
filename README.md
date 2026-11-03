# Waypoint

Screen annotation and agenda sticky for presenters. Tauri 2 + React 18.

## Status

M1 implementation: floating hotbar, pressure-sensitive freehand pen, preset/custom colors,
pass-through, clear, close, and saved hotbar position. Remaining drawing tools and sticky
controls are disabled until M2–M4. See [M1 verification](docs/m1-verification.md) for checks
and the manual acceptance checklist.

The [v1 roadmap](https://github.com/christianrazul/waypoint/issues/1) and
[M1 specification](https://github.com/christianrazul/waypoint/issues/3) define the scope.

## Requirements

- macOS 13+ (Windows 10/11 validation lands in M5)
- Rust 1.80+ (M0 tested with 1.98.1), Node 20+ (tested with 24.13), pnpm 10

## Run and check

```bash
pnpm install
pnpm tauri dev
pnpm test
pnpm build
cargo clippy --locked --manifest-path src-tauri/Cargo.toml -- -D warnings
```

There is no Dock icon. Use the pen-nib icon in the menu bar:

- Left click: show or hide the hotbar. Hiding also turns drawing off.
- Right click: hotbar, click-through, window-level debugging, clear, and quit actions.
- Freehand pen: click to arm; click again to return to pass-through.
- Ctrl+Option+D: toggle drawing / pass-through, even with the hotbar hidden.
- Esc: return to pass-through. Registered globally only while drawing is armed.
- Colors: pink, blue, green, or the color wheel's saturation/brightness and hue controls.
- Clear all: remove annotations. Close toolbar: hide it and return to pass-through.
- Drag the grip to move the hotbar. Its position survives restarts.

The hotbar starts visible with drawing off. Changing colors does not arm drawing.
Annotations stay visible during pass-through and after hiding the hotbar; they are never
saved and disappear on quit. Inter fonts ship locally; no runtime network is needed.

## Architecture

- `src-tauri/src/platform/{macos,windows}.rs`: OS-specific behavior behind `platform/mod.rs`.
  macOS uses never-key NSPanels so the presenting app keeps keyboard focus.
- `src-tauri/src/{windows,tray,shortcuts}.rs`: window lifecycle, menu bar, and global shortcuts.
- `src-tauri/src/lib.rs`: commands and authoritative drawing state. Mutations broadcast
  revisioned snapshots so late initialization or reordered events cannot revert the UI.
- `src-tauri/capabilities/*.json`: least-privilege capability per window. Settings and
  window resizing remain native; webviews cannot directly access the persistence plugin.
- `src/{overlay,hotbar}`: separate React entries. Overlay keeps vector strokes in memory,
  caches completed paths, and schedules canvas frames only when drawing or resizing.
- `src/shared/{types,store,ipc}.ts`: typed state, a Zustand store per webview, and IPC.
- `src/shared/tokens.css`, `src/shared/fonts`: design values and bundled Inter weights.

Hotbar positions use tauri-plugin-store (`settings.json` in the app data directory), keyed
by display name, physical resolution, and display origin. Restored positions are clamped
inside the primary display. Multiple overlays, display selection, and hot-plug are M5.
