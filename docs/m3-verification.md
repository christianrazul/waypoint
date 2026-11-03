# M3 verification

Scope: [M3 issue #5](https://github.com/christianrazul/waypoint/issues/5).

## Implementation

- One shared seed JSON defines the five sections, current "Architecture overview" section,
  and three checklist items. Rust bundles it at compile time; the browser preview uses the
  same data. A new installation starts with the sticky hidden, as agreed with Chan.
- `Agenda`, `Section`, `AgendaItem`, and `StickySettings` follow the issue's model. The settings
  contain future style/corner/display fields; M3 exposes only the frosted sticky and default
  primary-display bottom-left placement. Appearance editing remains M4; display selection M5.
- The native persistence plugin is authoritative. Agenda/settings/revision live in one
  `agendaState` key in the existing `settings.json`, alongside existing hotbar positions.
  Existing agenda state is never reseeded on restart. Invalid saved agenda data is reported.
- A native transaction lock serializes read-modify-save operations. Each checkbox/navigation/
  visibility change is saved before success is returned or change events are sent. Failed
  saves restore the previous cached state and report an error; the UI does not optimistically
  mark a failed checkbox change as saved.
- Checklist commands identify both section and item, so an update made before navigation
  cannot accidentally change the new current section. Checking items never auto-advances.
  Navigation stops at either end; an empty agenda stays at index 0.
- Consumers subscribe before hydration, re-read persisted state on `agenda:changed` and
  `sticky:toggle`, and reject stale revisions. A change arriving during a read causes another
  read, without an idle polling loop.
- The sticky uses the existing never-key floating panel class, at overlay level + 1. Showing
  it does not arm drawing. Hiding the hotbar does not hide the sticky. Clicking sticky controls
  also finishes an active annotation text edit before mutating the agenda.
- Toggle: hotbar Sticky button, checked tray item, or Ctrl+Option+S. Next/Previous:
  Ctrl+Option+Right/Left, independent of drawing mode and hotbar visibility.
- First enabling an empty agenda emits `setup:requested`, the explicit integration hook for
  the M4 setup window. The setup menu remains disabled until M4. Empty content renders an
  explanatory state with disabled navigation.

## Layout and sizing

- Visible container width 460px; padding 16px 18px; 14px radius; specified frosted colors,
  borders, and shadow. Background alpha uses `opacity / 100`; text remains fully opaque.
  No CSS backdrop-filter or native blur is used.
- Header, 17px title, item progress segments, 16px checkboxes, optional labels, inline code,
  detail lines, and the 36px Prev/Next footer follow the issue's values.
- "All checked" only appears for nonempty sections with every item done; the title dims,
  details hide, checked text is struck through, and progress fills with the accent.
- Sections without items hide the progress/checklist. The compact flag hides only the
  checklist, preparing the rendering behavior for M4's control.
- The native sticky has its own 48px transparent margin for its specified shadow. The visible
  panel stays 40px from the left and 32px from the bottom, even when details or entire checklists
  disappear. M1's reduced toolbar shadow is preserved.
- Initial measurement is synchronous after layout, rather than waiting for an animation frame
  in a hidden OS window. Subsequent ResizeObserver, font-ready, and revision changes resize
  the window. Oversized content scrolls within a monitor-based height limit; that limit does
  not depend on the current window height, allowing short sections to grow again.
- The native window stays hidden until its first content measurement. A saved visible state
  is then shown without taking focus. Resize permission is scoped to the sticky's own command.

## Validation

- `pnpm test`: 49 frontend tests, including seed layout, completion, empty sections, end
  boundaries, safe inline code, compact rendering, stale reads, visibility refresh, and errors.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib`: 8 Rust tests covering seed
  defaults, navigation bounds, item targeting, serialized restart state, invalid data, and
  native anchor calculations across sizes and display origins.
- `pnpm build`: TypeScript and the three production webview entries, including local fonts.
- `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-features -- -D warnings`.
- `pnpm tauri build --debug --bundles app`: packaged macOS app built and launched;
  the annotation webview loaded without a startup alert. Its native settings file contained
  the hidden five-section seed at index 2 and preserved the existing hotbar position key.
  The automation surface exposed only the overlay, so native sticky interaction and focus
  remain on the acceptance checklist below.
- Browser preview checked initial hidden state, the seed layout, checking/unchecking items,
  progress, details, completion without auto-advance, Prev/Next boundaries, independent
  visibility, and visibility/current section/check restoration after reload. The sticky's
  visible bottom anchor stayed fixed while its height changed.

The preview uses mocked IPC and browser localStorage. It does not establish native slideshow
focus, OS shortcut delivery, or native store behavior across an actual app restart.

## Changed files

- `src-tauri/src/agenda.rs`: models, seed initialization, persistence and agenda operations.
- `src-tauri/src/{lib,windows,tray,shortcuts}.rs`: commands, sticky lifecycle/geometry, tray and keys.
- `src-tauri/{build.rs,capabilities,permissions}`: declared commands and per-window access.
- `src/shared/{types,ipc,agenda-store}.ts` and `seed-agenda.json`: contracts, rehydration and seed.
- `src/sticky`, `sticky.html`, `vite.config.ts`: sticky components, styling, sizing, and entry point.
- `src/hotbar/main.tsx`: live sticky toggle and error reporting.
- Tests beside the new modules, development preview fixtures, tokens, and README.

## Native acceptance checklist

Run `pnpm tauri dev` and check over full-screen Keynote, PowerPoint, and Google Slides.

- [ ] First launch stays hidden; Sticky/tray/Ctrl+Option+S shows section 3 at bottom-left.
- [ ] Checklist updates progress, hides details, and shows "All checked" without auto-advancing.
- [ ] Clicking sticky controls never stops ordinary arrow keys from advancing the slideshow.
- [ ] Ctrl+Option+Right/Left and Prev/Next navigate; end buttons disable; "Last step" appears.
- [ ] Hide/close the hotbar: sticky remains visible and usable; its shortcut still toggles it.
- [ ] Switch from the detailed section to an empty-items section and back: it shrinks/grows
      while the visible bottom edge stays 32px from the display edge.
- [ ] Check items, change section, quit normally, relaunch: section, checks, and visibility return.
- [ ] Hide sticky, quit, relaunch: it remains hidden and still restores the agenda when enabled.
- [ ] Recheck drawing/text/undo shortcuts alongside agenda controls; the toolbar shadow stays reduced.
- [ ] Confirm no visible shadow clipping and no continuous idle activity.
