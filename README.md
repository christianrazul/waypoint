# Waypoint

Screen annotation and agenda sticky for presenters. Tauri 2 + React 18.

## Status

M3 implementation: the agenda sticky shows the current section, checklist, progress,
and Prev/Next controls independently of the drawing hotbar. Section, checks, and visibility
persist across restarts. It starts hidden on first launch. Agenda editing and appearance
controls arrive in M4; the macOS eyedropper remains behind its M2 feature flag.

The [v1 roadmap](https://github.com/christianrazul/waypoint/issues/1) and
[M3 specification](https://github.com/christianrazul/waypoint/issues/5) define the current scope.
See [M3 verification](docs/m3-verification.md) for checks and the native acceptance checklist.
[M2 verification](docs/m2-verification.md) and [M1 verification](docs/m1-verification.md)
record the previous milestones.

## Requirements

- macOS 13+ (Windows 10/11 validation lands in M5)
- Rust 1.80+ (M0 tested with 1.98.1), Node 20+ (tested with 24.13), pnpm 10

## Run and check

```bash
pnpm install
pnpm tauri dev
pnpm test
pnpm build
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-features -- -D warnings
```

There is no Dock icon. Use the pen-nib icon in the menu bar:

- Left click: show or hide the hotbar. Hiding also turns drawing off.
- Right click: hotbar, click-through, window-level debugging, undo/redo, clear, and quit.
- Click a tool to arm it; re-click the active tool to return to pass-through.
- Ctrl+Option+D: toggle drawing / pass-through, even with the hotbar hidden.
- Sticky button, tray check item, or Ctrl+Option+S: show/hide the agenda sticky independently.
- Ctrl+Option+Right / Ctrl+Option+Left: next / previous agenda section, including with the hotbar hidden.
- Checklist: check items to update progress. Details hide when checked; checking everything never
  advances the agenda automatically. Prev/Next stop at the ends.
- Esc: return to pass-through. While typing, Esc commits text instead; press it again to disarm.
- Cmd+Z / Shift+Cmd+Z on macOS, Ctrl+Z / Shift+Ctrl+Z on Windows: undo / redo annotations.
  These shortcuts are global only while armed and are released during text editing or sampling.
- Shift-drag: constrain arrows to 45-degree steps, rectangles to squares, ellipses to circles.
- Text: click to place, type, and commit with Enter, Esc, or a click outside. Empty text is discarded.
  Inter 600 at 22px; keyboard focus is borrowed only while typing and returned on commit.
- Eraser: click or drag over an object's outline to delete the whole object. A drag is one undo step.
- Colors: pink, blue, green, or the color wheel's saturation/brightness and hue controls.
- Clear all: remove annotations; undo restores them. Close: hide the hotbar and return to pass-through.
- Drag the grip to move the hotbar. Its position survives restarts.

The hotbar starts visible with drawing off. The sticky first opens on section 3 of the seed
agenda, "Architecture overview", in the bottom-left corner. Its last visibility, current section,
and checked items are restored on subsequent launches. Frosted appearance uses a translucent
fill; there is no native blur. Closing the hotbar leaves the sticky visible.

Changing colors does not arm drawing or recolor existing annotations. Strokes and history stay in memory during pass-through and after hiding
the hotbar; they disappear on quit. Inter fonts ship locally; no runtime network is needed.

## Architecture

- `src-tauri/src/platform/{macos,windows}.rs`: OS-specific behavior behind `platform/mod.rs`.
  macOS uses separate overlay and floating-panel classes: only the overlay can temporarily
  become key while typing. Focus restoration avoids activating an old app after a user switches
  to a different one.
- `src-tauri/src/{windows,tray,shortcuts}.rs`: window lifecycle, text/sampling transitions,
  menu bar, and global shortcuts. Annotation shortcut changes roll back on registration failure.
- `src-tauri/src/agenda.rs`: persisted agenda/settings, serialized checklist/navigation mutations,
  and seed initialization. `agendaState` in the existing `settings.json` is authoritative;
  interested webviews re-read after `agenda:changed` / `sticky:toggle` events.
- `src-tauri/src/lib.rs`: commands and authoritative drawing state. Revisioned snapshots prevent
  late initialization or reordered events from reverting tool, color, editing, or sampling state.
- `src-tauri/capabilities/*.json`: least-privilege capability per window. Only the overlay can
  acquire text focus; only the hotbar can select tools or initiate sampling.
- `src/overlay/{controller,history,geometry,render}.ts`: pointer gestures, object-change commands,
  constraints/hit-testing, and rendering. Completed paths and eraser outlines are cached;
  canvas frames are scheduled only after changes, with no idle polling.
- `src/sticky`: frosted agenda rendering and ResizeObserver sizing. The native window preserves
  the visible bottom anchor as content changes and keeps its panel non-activating.
- `src/{overlay,hotbar,sticky}`: separate React entries; `src/shared/{types,store,ipc}.ts`: annotation types,
  a Zustand store per webview, and typed commands/events.
- `src/shared/tokens.css`, `src/shared/fonts`: design values and bundled Inter weights.

Hotbar positions use tauri-plugin-store (`settings.json` in the app data directory), keyed
by display name, physical resolution, and display origin. Restored positions are clamped
inside the primary display. Multiple overlays, display selection, and hot-plug are M5.

## Browser preview

Run `pnpm dev`, then open [the drawing preview](http://127.0.0.1:1420/dev/preview.html).
It uses the actual hotbar, overlay, and sticky components with mocked IPC. Preview agenda state
persists in browser localStorage; "Reset agenda" resets that preview only. The slide diagram and
Undo/Redo/Clear controls are development-only; the preview does not test native focus or
OS shortcut registration and is excluded from the production build entries.
