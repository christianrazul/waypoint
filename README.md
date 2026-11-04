# Waypoint

Screen annotation and agenda sticky for presenters. Tauri 2 + React 18.

V1 is macOS-only and built for personal use (unsigned, not notarized; see [packaging](docs/packaging.md)). Windows implementation and build instructions are retained for
post-v1 work; Windows desktop acceptance is deferred until after v1 deployment.

## Status

M5 implementation is ready for validation: overlays per display, native display-change
notifications, Primary / Cursor placement, configurable shortcuts, and release packaging.
On macOS, annotation sessions are scoped to each display and Space; the hotbar and
agenda sticky remain available across Spaces. Native A/B Space isolation and restoration
were confirmed, along with restoration and keyboard focus in one full-screen slideshow
scenario. Chan has also confirmed the remaining Mac edge cases as good.
Annotations and history stay in memory per display, including completed-session restoration
after reconnecting a display. The macOS eyedropper remains behind its M2 feature flag.

M5 remains open for native performance verification. Retina input-to-display latency
is unverified; the earlier two-display build measured 286 MiB total physical footprint,
above the 150 MB target. That profile predates Space-scoped sessions and needs a new
baseline. Further external-shortcut-conflict testing is deferred by agreement.
See [M5 verification](docs/m5-verification.md) for the recorded results and scope changes.
[Packaging notes](docs/packaging.md) cover installers, Developer ID signing,
notarization, and distribution limitations.

The [v1 roadmap](https://github.com/christianrazul/waypoint/issues/1) and
[M5 specification](https://github.com/christianrazul/waypoint/issues/7) define the scope.
Previous checks: [M4](docs/m4-verification.md), [M3](docs/m3-verification.md),
[M2](docs/m2-verification.md), and [M1](docs/m1-verification.md).

## Requirements

- V1: macOS 13+; the current validated build is Apple Silicon.
- Post-v1 Windows builds: Windows 10/11 with WebView2.
- macOS: Xcode Command Line Tools. Windows builds: Visual Studio C++ Build Tools + Windows SDK.
- Rust 1.80+ (M0 tested with 1.98.1), Node 20+ (local 24.14.1; CI pins 24.13.0), pnpm 10

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
- Right click: hotbar, sticky setup/visibility, click-through, window-level debugging, undo/redo, clear, and quit.
- Click a tool to arm it; re-click the active tool to return to pass-through.
- Highlighter: the pointer keeps working in other apps until you hold H; drag while holding it to
  draw a translucent highlight that fades from its start after 2.5 s and is never saved or undone.
  While the highlighter is armed, H is taken globally (other apps cannot type it) and Esc disarms.
- Ctrl+Option+D: toggle drawing / pass-through, even with the hotbar hidden.
- Ctrl+Option+C: clear annotations on the display under the cursor.
- On Windows, use Ctrl+Alt in place of Ctrl+Option. These five global actions can be changed
  in setup: Next, Previous, Toggle drawing, Clear, and Toggle sticky. Click a binding and press
  the new key combination; Esc cancels recording. Duplicate/reserved/in-use keys show an error
  and keep the previous binding. Startup conflicts leave the app usable and appear in setup
  and the hotbar error message. Global action keys pause while recording a replacement.
- Sticky button, tray check item, or Ctrl+Option+S: show/hide the agenda sticky independently.
- Tray "Waypoint sticky setup" or Alt-click Sticky: open setup. Text saves on blur/Enter;
  detail lines support newlines and Ctrl/Cmd+Enter to finish. Other controls save immediately.
  Esc, the close button, or clicking outside saves pending edits before closing. Invalid text
  keeps the editor open. Drawing input and annotation shortcuts pause while setup is open.
- Drag section grips to reorder, or use Move up/down in the expanded editor. Reset checklist
  clears all checks without changing the current section.
- Display selects Primary or Display at cursor. Cursor mode chooses when controls are shown,
  settings change, or a global action is invoked; the controls do not continuously follow mouse
  movement. Setup follows the same display. A disconnected target falls back to an available display.
- Drag the sticky header to place it freely. A corner preset resets custom placement for the
  current display; content resizing preserves the selected top or bottom anchor.
- Clear starts at 35% fill opacity, Frosted at 72%; reselecting the active style keeps its value.
  Paper stays solid. Compact hides checklist items while retaining progress and navigation.
- Ctrl+Option+Right / Ctrl+Option+Left: next / previous agenda section, including with the hotbar hidden.
- Checklist: check items to update progress. Details hide when checked; checking everything never
  advances the agenda automatically. Prev/Next stop at the ends.
- Esc: return to pass-through. While typing, Esc commits text instead; press it again to disarm.
- Cmd+Z / Shift+Cmd+Z on macOS, Ctrl+Z / Shift+Ctrl+Z on Windows: undo / redo annotations.
  These shortcuts target the display under the cursor, are global only while armed, and are
  released during text editing, sampling, and setup. Text fields keep their normal text undo.
- Shift-drag: constrain arrows to 45-degree steps, rectangles to squares, ellipses to circles.
- Text: click to place, type, and commit with Enter, Esc, or a click outside. Empty text is discarded.
  Inter 600 at 22px; keyboard focus is borrowed only while typing and returned on commit.
- Eraser: click or drag over an object's outline to delete the whole object. A drag is one undo step.
- Colors: pink, blue, green, or the color wheel's saturation/brightness and hue controls.
- Clear all: remove annotations; undo restores them. Close: hide the hotbar and return to pass-through.
- Drag any empty part of the hotbar to move it. Its position survives restarts.

The hotbar starts visible with drawing off. The sticky first opens on section 3 of the seed
agenda, "Architecture overview", in the bottom-left corner. Its last visibility, current section,
checked items, and appearance are restored on subsequent launches. Frosted uses a translucent
fill; there is no native blur. Clear suits light slides; Paper uses a solid yellow fill. Closing
the hotbar leaves the sticky visible.

Changing colors does not arm drawing or recolor existing annotations. Strokes and history stay in memory during pass-through and after hiding
the hotbar. Completed annotations and history survive display reconnects during the same run;
they disappear on quit. On macOS, changing Spaces saves the departing history and restores
that display's history for the destination Space, including undo/redo. The same overlay
webviews are reused. Space changes finish the current gesture/text edit; drawings are hidden
and input pauses until the destination session is ready. On Windows, history remains scoped
per display. In-progress gestures are not a saved reconnect session. Inter fonts ship locally; no runtime network is needed.

## Architecture

- `src-tauri/src/platform/{macos,windows}.rs`: OS-specific behavior behind `platform/mod.rs`.
  macOS uses separate overlay, never-key floating, and keyboard-capable setup panel classes.
  The overlay borrows focus only while typing; setup borrows it while editing. Focus restoration avoids activating an old app after a user switches
  to a different one.
- `src-tauri/src/displays.rs`: stable overlay registry, active-session history dispatch and
  in-memory session cache, platform-specific display placement, and topology reconciliation. macOS uses
  the screen-parameters notification; Windows uses display/settings/DPI messages. No display poll.
- `src-tauri/src/sessions.rs`: display/Space histories and generation ownership. Late saves
  cannot write into another Space; overlays acknowledge the current generation before showing.
- `src-tauri/src/platform/macos/spaces.rs`: dynamically loaded, read-only SkyLight Space lookup,
  mapped to displays through CoreGraphics UUIDs. NSWorkspace's Space-change notification
  triggers session changes; there is no Space polling or Space-switching/injection API.
- `src-tauri/src/{windows,tray,shortcuts}.rs`: window lifecycle, text/sampling transitions,
  menu bar, and global shortcuts. Shortcut replacement registers the new key before releasing the old and rolls back if saving fails.
- `src-tauri/src/{editing,setup}.rs`: field-level agenda edits and the keyboard-capable setup
  panel. Close requests flush frontend drafts before hiding and returning focus; switching to
  another app does not reactivate an older app.
- `src-tauri/src/agenda.rs`: persisted agenda/settings, serialized checklist/navigation mutations,
  and seed initialization. `agendaState` in the existing `settings.json` is authoritative;
  interested webviews re-read after `agenda:changed` / `sticky:toggle` events.
- `src-tauri/src/lib.rs`: commands and authoritative drawing state. Revisioned snapshots prevent
  late initialization or reordered events from reverting tool, color, editing, or sampling state.
- `src-tauri/capabilities/*.json`: least-privilege capability per window, including `overlay-*`. Only the overlay and setup can
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

Agenda, settings, shortcuts, and placement use tauri-plugin-store (`settings.json` in the app
data directory). Hotbar/sticky positions use display identity and local offsets, so moving a
display's desktop origin does not rewrite the saved placement. Legacy M1–M4 keys are read
and migrated without removing agenda data. Restored positions clamp to the current display.
Display identities use the monitor name exposed by the OS; duplicate names fall back to
position-qualified identities, which can change after rearranging those ambiguous displays.

## Install and build

Use the generated DMG to copy Waypoint into Applications, or run the Windows NSIS installer.
There is no Dock/taskbar window: use the tray/menu bar icon. Existing settings are retained
when replacing the app. Current local artifacts have no trusted publisher notarization/signature;
see [packaging](docs/packaging.md) before distributing them.

```bash
./scripts/package-macos.sh
# On Windows:
pnpm tauri build --bundles nsis
```

## Permissions and limitations

- Drawing overlays do not capture the screen and normally need no Screen Recording permission.
  Global key conflicts depend on OS reservations and other apps. Sampling is optional; Windows
  EyeDropper availability and its system UI are checked at runtime.
- Keep Keynote's "Allow Mission Control, Dashboard and others to use the screen" option enabled
  when presenting with auxiliary overlays. Recheck full-screen focus using the acceptance list.
- Frosted is translucent paint, without native blur. Clear is intended for light slides.
- The horizontal hotbar retains its fixed design width (794 logical pixels on default macOS,
  844 on Windows); very narrow/portrait displays can clip it. Sticky/setup also use fixed widths.
- In-memory history/reconnect snapshots grow with edits. Clear is undoable and does not
  purge history; quitting resets it. Large sessions add memory and snapshot serialization work.
- macOS Space lookup uses private APIs and can break after OS updates. A lookup failure
  hides annotations, disables their input, and reports an error rather than showing another
  Space's drawings. This adds no Accessibility/Screen Recording permission requirement.
  Deleted/recreated Spaces, including during display reconnects, can have new identities;
  restoration requires the same display/Space identity. Orphaned sessions remain in memory until
  quit. Space switches and full-screen slideshow transitions need native acceptance testing.
- Hardware display changes, Windows slideshow focus, Retina latency, and the memory target
  are not declared passed by automated unit tests or the browser preview.

## Browser preview

Run `pnpm dev`, then open [the drawing preview](http://127.0.0.1:1420/dev/preview.html).
It uses the actual hotbar, overlay, sticky, and setup components with mocked IPC. Preview agenda state
persists in browser localStorage; the Second display checkbox exercises independent canvas
sessions and reconnects with mocked IPC. A development-only output reports pointer-event to
canvas-submit timing; it does not measure OS/compositor/physical pen latency.
"Reset agenda" resets that preview only. The slide diagram and
Undo/Redo/Clear controls are development-only; the preview does not test native focus or
OS shortcut registration and is excluded from the production build entries.
