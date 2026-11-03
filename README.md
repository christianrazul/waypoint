# Waypoint

Screen annotation and agenda sticky for presenters. Tauri 2 + React 18.

## Status

M4 implementation: sticky setup adds section and checklist editing, Frosted/Clear/Paper
styles, live opacity, four corner presets, dragging, and compact mode. The agenda,
appearance, visibility, and custom placement persist across restarts. The macOS eyedropper
remains behind its M2 feature flag; multi-display selection and Windows validation are M5.

The [v1 roadmap](https://github.com/christianrazul/waypoint/issues/1) and
[M4 specification](https://github.com/christianrazul/waypoint/issues/6) define the current scope.
See [M4 verification](docs/m4-verification.md) for checks, derived colors, and native acceptance.
[M3](docs/m3-verification.md), [M2](docs/m2-verification.md), and
[M1 verification](docs/m1-verification.md) record the previous milestones.

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
- Tray "Waypoint sticky setup" or Alt-click Sticky: open setup. Text saves on blur/Enter;
  detail lines support newlines and Ctrl/Cmd+Enter to finish. Other controls save immediately.
  Esc, the close button, or clicking outside saves pending edits before closing. Invalid text
  keeps the editor open. Drawing input and annotation shortcuts pause while setup is open.
- Drag section grips to reorder, or use Move up/down in the expanded editor. Reset checklist
  clears all checks without changing the current section.
- Drag the sticky header to place it freely. A corner preset resets custom placement for the
  current display; content resizing preserves the selected top or bottom anchor.
- Clear starts at 35% fill opacity, Frosted at 72%; reselecting the active style keeps its value.
  Paper stays solid. Compact hides checklist items while retaining progress and navigation.
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
checked items, and appearance are restored on subsequent launches. Frosted uses a translucent
fill; there is no native blur. Clear suits light slides; Paper uses a solid yellow fill. Closing
the hotbar leaves the sticky visible.

Changing colors does not arm drawing or recolor existing annotations. Strokes and history stay in memory during pass-through and after hiding
the hotbar; they disappear on quit. Inter fonts ship locally; no runtime network is needed.

## Architecture

- `src-tauri/src/platform/{macos,windows}.rs`: OS-specific behavior behind `platform/mod.rs`.
  macOS uses separate overlay, never-key floating, and keyboard-capable setup panel classes.
  The overlay borrows focus only while typing; setup borrows it while editing. Focus restoration avoids activating an old app after a user switches
  to a different one.
- `src-tauri/src/{windows,tray,shortcuts}.rs`: window lifecycle, text/sampling transitions,
  menu bar, and global shortcuts. Annotation shortcut changes roll back on registration failure.
- `src-tauri/src/{editing,setup}.rs`: field-level agenda edits and the keyboard-capable setup
  panel. Close requests flush frontend drafts before hiding and returning focus; switching to
  another app does not reactivate an older app.
- `src-tauri/src/agenda.rs`: persisted agenda/settings, serialized checklist/navigation mutations,
  and seed initialization. `agendaState` in the existing `settings.json` is authoritative;
  interested webviews re-read after `agenda:changed` / `sticky:toggle` events.
- `src-tauri/src/lib.rs`: commands and authoritative drawing state. Revisioned snapshots prevent
  late initialization or reordered events from reverting tool, color, editing, or sampling state.
- `src-tauri/capabilities/*.json`: least-privilege capability per window. Only the overlay and setup can
  acquire text focus; only the hotbar can select tools or initiate sampling.
- `src/overlay/{controller,history,geometry,render}.ts`: pointer gestures, object-change commands,
  constraints/hit-testing, and rendering. Completed paths and eraser outlines are cached;
  canvas frames are scheduled only after changes, with no idle polling.
- `src/setup`: agenda editor and live appearance/position controls.
- `src/sticky`: themed agenda rendering and ResizeObserver sizing. The native window preserves
  the selected corner anchor as content changes and keeps its panel non-activating.
- `src/{overlay,hotbar,sticky,setup}`: separate React entries; `src/shared/{types,store,ipc}.ts`: annotation types,
  a Zustand store per webview, and typed commands/events; `agenda-store.ts` synchronizes agenda state.
- `src/shared/tokens.css`, `src/shared/fonts`: design values and bundled Inter weights.

Hotbar positions use tauri-plugin-store (`settings.json` in the app data directory), keyed
by display name, physical resolution, and display origin. Restored positions are clamped
inside the primary display. Sticky custom offsets use `sticky-position:` keys for the same
display identity, measured from the selected corner; presets clear that display's override.
Multiple overlays, display selection, and hot-plug are M5.

## Browser preview

Run `pnpm dev`, then open [the drawing preview](http://127.0.0.1:1420/dev/preview.html).
It uses the actual hotbar, overlay, sticky, and setup components with mocked IPC. Preview agenda state
persists in browser localStorage; "Reset agenda" resets that preview only. The slide diagram and
Undo/Redo/Clear controls are development-only; the preview does not test native focus or
OS shortcut registration and is excluded from the production build entries.
