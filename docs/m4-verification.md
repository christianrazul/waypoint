# M4 verification

Scope: [M4 issue #6](https://github.com/christianrazul/waypoint/issues/6).

## Implementation

- A separate, keyboard-capable setup panel opens from the tray, Alt-click Sticky,
  or enabling a sticky with an empty agenda. It has a 400px visible container with
  the specified fill, border, 16px radius, 20px padding, 16px groups, and shadow.
  Its 96px transparent margin accommodates the large setup shadow. Long agendas
  scroll inside a monitor-limited panel rather than growing outside the display.
- macOS setup uses its own panel class, two levels above the annotation overlay;
  the hotbar/sticky remain never-key panels. The previous application is tracked
  separately from annotation text focus. Restoration checks the frontmost app so
  switching apps while setup is open does not reactivate an older app.
- Native resign-key/Windows blur, clicks on other Waypoint surfaces, transparent
  setup padding, Esc, and the close button all request a frontend close. Drafts
  and pending saves finish before native hiding/restoring focus. A blank title or
  failed draft save keeps the editor available and reports the error.
- Drawing pointer interception and annotation undo/redo/Esc shortcuts pause during
  setup. Closing restores the current armed state; shortcut failures fall back to
  pass-through. Agenda shortcuts remain available. Opening during color sampling
  is rejected until sampling finishes.
- Agenda rows select the current section. Expanded editors rename sections, edit
  checklist text/optional flags/detail lines, and add/delete items. New sections
  and items have usable default text. Section grips support HTML drag reordering;
  Move up/down provide keyboard-accessible alternatives. The setup webview disables
  native file-drop handling so Windows HTML drag/drop can function.
- Text saves on blur/Enter (Ctrl/Cmd+Enter for multiline details). A serialized
  frontend queue preserves action order, while native field-level operations
  update the latest stored state under the existing transaction lock. Stable IDs
  protect checkbox state and other fields from an unrelated text save.
- Reordering and deleting other sections preserve the current section by ID.
  Deleting the current section selects the next section, or the previous section
  at the end; deleting the last section leaves index 0. Reset checklist clears
  all `done` flags without advancing or selecting another section.
- Style changes set Frosted opacity to 72% and Clear to 35%. Reselecting the active
  style preserves its adjusted opacity. Paper ignores opacity. The range updates
  the fill live with an 80ms trailing debounce; draft flushing includes that save.
  Text, borders, controls, and shadows do not inherit fill opacity.
- Clear uses the specified translucent white fill and dark border. Paper uses
  solid #FFE89A, 4px radius, -1.5-degree rotation, and its smaller specified shadow.
  Measurement reserves the rotated vertical bounds and reduces the tall-content
  limit so Paper can resize without cropping its content.
- Four presets retain the 40px horizontal / 32px vertical visible offsets. Native
  header dragging saves custom corner-relative offsets under `sticky-position:`
  keys using the existing display identity (name/resolution/origin) and store
  autosave. Programmatic resize events do not overwrite those drag offsets.
  Resizing retains the selected top or bottom anchor; restored positions clamp
  to the display. Clicking any preset, including the current preset, clears that
  display's override and moves to the preset. Display selection remains M5.
- Compact mode hides only the checklist, preserving header/title/progress/footer.
  Existing M3 state loads without migration or reseeding; the toolbar shadow stays
  unchanged. All new commands have per-window capabilities.

## Derived Clear / Paper colors

| Element | Clear | Paper |
| --- | --- | --- |
| Main title, checklist, buttons | #111827 | #111827 |
| Header, details, next hint | #374151 | #5B4A12 |
| Checked items, completed title | #526071 | #526071 |
| Completion badge text / fill | #20552C / rgba(33,110,49,.12) | Same |
| Unfinished / finished progress | rgba(17,24,39,.22) / #6B5310 | Same |
| Checkbox accent | #237C35 | Same |
| Inline code fill | rgba(17,24,39,.09) | Same |
| Detail/footer rules | rgba(17,24,39,.2) | Same |
| Prev button border / fill | rgba(17,24,39,.35) / rgba(255,255,255,.25) | Same |
| Next button | Existing yellow accent, #111 text, #8D711F border | Same |
| Focus outline | #6B5310 | Same |
| Error text | #8A1538 | Same |

WCAG relative-luminance calculations: main text is 17.74:1 on white and 14.58:1
on Paper; Clear labels are 10.31:1 on white; Paper labels are 7.09:1 on Paper;
muted text is 6.42:1 on white and 5.28:1 on Paper. The green checkbox accent is
5.24:1 on white and 4.31:1 on Paper; finished progress is 7.32:1 / 6.01:1.
Completion badge text is 7.36:1 / 6.12:1 against its composited tinted fill.
Unfinished segments and decorative rules intentionally use lower contrast.
Clear is intended for light slides: these white-background ratios are not a
contrast guarantee over arbitrary slide content or at every opacity setting.
Paper's opaque background provides stable text contrast.

## Validation

- `pnpm test`: 54 frontend tests, including serialized editor saves, flushing drafts
  on close, failed-save recovery, stale responses, fill-only opacity, and Paper.
- `pnpm build`: TypeScript check and four bundled webview entries with local fonts.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib`: 14 Rust tests,
  including field-level IPC payloads, preservation of checks, reorder/deletion
  semantics, default style opacity, and custom corner-relative position clamping.
- `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-features -- -D warnings`.
- `pnpm tauri build --debug --bundles app`: macOS app packaged and launched; the
  annotation webview loaded without a startup alert.
- Browser preview checked Alt-click opening, section/item creation and deletion,
  section rename, checklist text/code/details/optional edits, Move up reordering,
  current-section selection/deletion, all four presets, live opacity, all three
  styles, compact mode, and empty-agenda enabling. Empty-title Esc retained the
  draft and editor with an error; correcting the title recovered normally. Reset
  checklist cleared all checks; Esc saved an active title draft before closing.
  The edited title and Paper style remained after a preview reload.

The browser preview uses mocked IPC and localStorage. Its drag simulation is not
native window dragging. The native automation surface exposes the overlay only;
packaging/startup does not verify setup keyboard focus, slideshow interaction,
HTML drag delivery, native drag persistence, or actual application restart state.
Those checks remain below. Windows compilation and display selection remain M5.

## Native acceptance checklist

Run `pnpm tauri dev` and review over full-screen Keynote, PowerPoint, and Google Slides.

- [ ] Tray and Alt-click Sticky open setup; ordinary Sticky click still toggles visibility.
- [ ] Setup text fields accept typing and normal text undo/redo. Drawing stays paused while
      setup is open and resumes its previous mode when setup closes.
- [ ] Close through Esc, outside click, and the close button with an unblurred draft:
      the draft saves and keyboard focus returns to the slideshow.
- [ ] Switch to a different app while editing: setup closes without activating the old app.
- [ ] Rename, add, delete, select, and drag-reorder sections; verify NOW follows the section
      identity. Check Move up/down too. Delete the last section and enable an empty sticky.
- [ ] Add/edit/delete items, optional flags and detail lines; reset all checks.
- [ ] Clear and Paper colors read well on light slides; opacity changes only Frosted/Clear
      fill. Paper remains solid with its rotated layout and smaller shadow.
- [ ] All corner presets move the sticky; drag its header to a custom position. Change
      section/compact mode and confirm the selected top/bottom anchor remains fixed.
- [ ] Quit normally and relaunch: edits, checks, settings, visibility, and custom placement
      return. Clicking the selected preset clears the custom offset and stays reset on restart.
- [ ] Verify tall content scrolls, Paper does not clip, setup shadow has no boxed edge,
      the toolbar shadow remains reduced, and there is no idle resize/event loop.
