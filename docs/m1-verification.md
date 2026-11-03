# M1 verification

Scope: [M1 issue #3](https://github.com/christianrazul/waypoint/issues/3).

## Implementation decisions

- Preserve M0's non-activating panel configuration and its window-level debugging menu.
- Start with the hotbar visible, pink selected, drawing off. Choosing a color preserves
  armed state. Hiding via the tray has the same pass-through behavior as Close.
- Future tools, eyedropper, sticky, and sticky setup are disabled with explanatory labels.
- The full custom picker lives inside the non-activating hotbar. It exposes hue and
  saturation/brightness without opening a native color dialog or taking keyboard focus.
- Rust owns drawing state and emits `tool:changed` / `color:changed` snapshots with
  monotonic revisions. Zustand mirrors them independently in each webview.
- Pen strokes capture their own color, size, points, and pressure mode. Clear removes
  both completed and in-progress strokes. Disarming finalizes an in-progress stroke.
- perfect-freehand simulates pressure for mouse/touch; tablet samples keep real pressure.
  Mouse samples omit pressure before outline generation to avoid pressure-seed artifacts.
- Completed Path2D outlines are cached. There is no idle polling or continuous render loop.
- Esc registration must succeed before the overlay captures clicks. Native cursor setting
  supplements CSS because never-key panel cursor behavior varies.
- Position saving is debounced by 300 ms and flushed by the store plugin on normal quit.
  The display key includes name, resolution, and origin to distinguish equal-size monitors.
- Tray active state swaps to an alternate template image with a 22% alpha rounded fill;
  this is an approximation of the mockup, not an OS selection-highlight API.

## Automated checks

- `pnpm test`: 13 tests covering picker color preservation, click-dot rendering, tablet
  pressure versus mouse simulation, stale hydration, reordered events, and listener cleanup.
- `pnpm build`: strict TypeScript check and production build, including four local font files.
- `cargo clippy --locked --manifest-path src-tauri/Cargo.toml -- -D warnings`: Rust checks.

## Visual and native smoke checks

- Built a macOS debug `.app` with `pnpm tauri build --debug --bundles app`; launch succeeds.
- Sampled the native process: its main thread was waiting in the normal AppKit event loop,
  rather than blocked during setup. This does not establish end-to-end input correctness.
- Checked the actual hotbar components in an isolated browser harness with mocked Tauri IPC:
  layout, preset selection, active pen styling, opening the picker, and choosing a custom
  hue/saturation/brightness all rendered and updated correctly. Measured bar width is about
  795 logical pixels; its native window reserves 24 pixels around it for shadow.
- Native automation exposed only the overlay window, so it could not establish toolbar
  input, global-shortcut behavior, tray state, position restoration, or slideshow focus.

## Native acceptance checklist

Use `pnpm tauri dev`. Recheck over full-screen Keynote, PowerPoint, and Google Slides;
M0's results do not establish that M1 passes these checks.

- [ ] Compare hotbar dimensions, spacing, swatches, icons, and selected pen fill to issue #3.
- [ ] Tray left-click shows/hides hotbar and swaps the active/inactive template image.
- [ ] Click colors, pen, and the full picker; slideshow arrow keys continue to advance slides.
- [ ] Draw in pink, blue, green, and a custom color. Existing strokes retain their colors.
- [ ] Test mouse and tablet: dots, long/fast strokes, pressure variation, and crosshair.
- [ ] Re-click pen, press Esc, and use Ctrl+Option+D: strokes remain and clicks pass through.
- [ ] Verify Esc resumes its normal behavior in other apps after leaving drawing mode.
- [ ] Clear all removes strokes, including a stroke interrupted by a shortcut or mode change.
- [ ] Close hides the hotbar and disarms. Reopen from the tray; strokes are still visible.
- [ ] Drag by grip, quit from tray, relaunch, and confirm restored position.
- [ ] Test opening the picker near the display's bottom edge; controls stay reachable.
- [ ] Measure Retina pen latency against the under-one-frame at 60 Hz target.
- [ ] Observe idle CPU with strokes visible, without moving the pointer or interacting.

Build and unit checks do not measure end-to-end latency, idle CPU, or slideshow focus.
Windows validation and multiple-display overlays remain M5 work.
