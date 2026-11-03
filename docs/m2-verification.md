# M2 verification

Scope: [M2 issue #4](https://github.com/christianrazul/waypoint/issues/4).

## Implementation

- Annotation objects: pen points/pressure, arrow endpoints, rectangle/ellipse endpoints, and
  text with position and measured bounds. Every object captures its color; strokes use size 5.
- Shift constrains arrows to 45-degree steps and shapes to squares/circles in any drag direction.
  The arrow is straight as required by the behavior specification; the sample's curved arrow
  is illustrative, not an additional curved-arrow tool.
- Eraser hit-testing follows the pointer's swept segment, not just individual samples. Hollow
  shapes are erased at their outlines; pen and text also hit-test their filled areas. Tolerance
  is 6 logical pixels beyond the visible outline. A whole drag is one remove-objects command.
- History stores inserted/removed objects and their stacking indices, preserving z-order and
  original pen samples across undo/redo. Empty actions do not discard redo; a new edit does.
- Clear finalizes any in-progress gesture or text draft, then records a clear command. Undoing
  Clear restores all visible objects. Undo during a drawing gesture finalizes then undoes it.
- No new hotbar buttons are required: undo/redo are available through armed-only shortcuts
  and explicit tray menu actions. Sticky remains disabled for M3.
- Separate macOS panel classes keep the hotbar never-key even while the overlay accepts text.
  The text gate is enabled only after annotation shortcuts are released. Enter, Esc, blur,
  a click outside, disarming, or selecting another tool commits text and releases native focus.
- Text uses locally bundled Inter 600 at 22px. IME composition prevents Enter/Esc from committing
  prematurely. Whitespace-only drafts are discarded. Undo while typing belongs to the input.
- Text focus transitions are serialized so an interrupted pending editor cannot acquire focus
  after its draft has already been dismissed. Restoration does not activate the previous app
  if the user has switched to a third app in the meantime.
- Escape and annotation undo/redo are registered together only while armed, outside editing
  and sampling. Registration failures roll back the group; a failed sampler restoration leaves
  the overlay in pass-through instead of arming it without escape shortcuts.
- M1's reduced toolbar shadow is preserved.

## Eyedropper fallback

The pinned `objc2-app-kit 0.3.2` source includes `NSColorSampler`, its selection callback,
`NSColorSpace::sRGBColorSpace`, and RGB component conversion. The native implementation is
compiled and linted with the `native-eyedropper` Cargo feature. It does not explicitly activate
Waypoint. It suspends overlay input/annotation shortcuts during sampling and restores them on
selection or cancellation.

The feature is **off by default**, and its hotbar button is hidden on macOS. Non-activation
has not been established by native manual testing, so this uses the fallback allowed by M2.
Test it explicitly with:

```bash
pnpm tauri dev --features native-eyedropper
```

Windows uses `EyeDropper.open()` directly from the click handler to preserve transient user
activation. Cancellation keeps the old color. An AbortController closes the sampler if native
setup fails, and cleanup restores drawing state after browser failures. The button is hidden
if the API is unavailable. Windows native validation remains M5.

API references: [Apple NSColorSampler](https://developer.apple.com/documentation/appkit/nscolorsampler),
[EyeDropper specification](https://wicg.github.io/eyedropper-api/).

## Automated and visual checks

- `pnpm test`: 37 tests across history, constraints, swept erasing, pen pressure, state ordering,
  controller interactions, text focus cleanup/failure, and eyedropper cancellation/failure.
- `pnpm build`: strict TypeScript checking and production assets.
- Rust lint checks with both default features and `--all-features`.
- Packaged a macOS debug `.app` and launched it successfully; the native overlay rendered
  without an IPC error. Native automation exposes only the overlay, so toolbar interactions
  and focus restoration remain manual checks.
- Browser preview uses the real components with mocked IPC. Checked ellipse, rectangle, arrow,
  text rendering/Enter/Escape, pen drawing, whole-object erasing, undo/redo, undoable Clear,
  and Escape pass-through. Recreated the pink ellipse, blue arrow/label, and green pen sample.
- Preview: `pnpm dev`, then `http://127.0.0.1:1420/dev/preview.html`.

The browser preview does not establish OS focus, global shortcut behavior, modifier delivery
inside never-key panels, screen sampling, or end-to-end performance.

## Changed files

- `src/shared/{types,ipc,store}.ts`: tools, object types, editing/sampling state, and commands/events.
- `src/overlay/{controller,geometry,history,render}.ts` and `main.tsx`: gestures, constraints,
  swept erasing, reversible object changes, rendering, and the text input.
- `src/hotbar/{main.tsx,eyedropper.ts}`: enabled tools and browser sampling.
- `src-tauri/src/{lib,windows,shortcuts,tray}.rs`: tool transitions, commands, shortcut lifetime,
  text focus orchestration, sampler lifecycle, and explicit undo/redo menu actions.
- `src-tauri/src/platform/*.rs`: separate macOS panel classes, text focus restoration,
  optional native sampling, and Windows focus support.
- `src-tauri/{Cargo.toml,Cargo.lock,build.rs,capabilities,permissions}`: pinned native dependencies,
  sampler feature flag, command declarations, and per-window permissions.
- Tests beside the affected modules, `dev/` preview fixtures, and README/verification notes.

## Native acceptance checklist

Run `pnpm tauri dev`, then check over full-screen Keynote, PowerPoint, and Google Slides.

- [ ] Arrow, rectangle, and ellipse draw in every direction; Shift constraints work while the
      overlay remains non-key. Confirm releasing Shift while dragging removes the constraint.
- [ ] Pen behavior and the reduced shadow match M1.
- [ ] Click Text, place an editor, type; Enter and Esc both commit. Click outside also commits.
- [ ] After each text commit, arrow keys advance the slideshow again. The hotbar never takes
      keyboard focus. Switching apps during editing does not reactivate the old app on blur.
- [ ] Switch tools or toggle pass-through while an editor is pending; no orphaned key window remains.
- [ ] Eraser deletes whole pen, arrow, rectangle, ellipse, and text objects by click and fast drag.
- [ ] A multi-object eraser drag undoes in one step with original stacking order.
- [ ] Undo/redo cover every tool and Clear. New drawing discards redo. Empty actions preserve redo.
- [ ] In pass-through, Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z reach the underlying app. While typing,
      undo edits the text input. Esc commits text first, then disarms on the next press.
- [ ] With the macOS sampler flag enabled, selecting/cancelling keeps slideshow focus and restores
      the previous armed/pass-through state. Keep the flag off if focus behavior is unreliable.
- [ ] On Windows, the web sampler selects a screen color, Esc cancels, and app focus is preserved (M5).
- [ ] Recheck Retina latency and idle CPU with mixed annotation types visible.
