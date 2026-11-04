# M5 verification

Scope: [M5 issue #7](https://github.com/christianrazul/waypoint/issues/7).
This milestone remains open pending the manual checks and performance targets below.

## Implemented behavior

- Each connected monitor has an `overlay-<n>` webview with its own canvas, history,
  and session. Tool/color/drawing-mode state is global; undo, redo, and Clear target
  the monitor under the cursor. Clicking Clear on the hotbar targets its display;
  the tray/global keys use the display under the cursor at invocation time.
- Completed history snapshots are cached in Rust memory after changes, including
  redo and original stacking order. Destroying/recreating a display webview restores
  its session. Nothing is written to disk; quitting discards annotations. Unfinished
  gestures are not completed-session data. Stable monitor names preserve identity;
  duplicated names need position-qualified IDs and can change after rearrangement.
- Reconciliation creates/destroys overlays and updates existing monitor geometry.
  macOS watches `NSApplicationDidChangeScreenParametersNotification`; Windows
  subclasses the hotbar HWND for display, DPI, and settings messages. Refresh requests
  coalesce on the main thread. There is no monitor or pointer polling loop. The macOS
  observer is removed on exit; Windows removes its subclass and context on destruction.
- Primary / Display at cursor is exposed in setup. Cursor selection happens on showing
  controls, settings changes, or global actions; controls do not chase pointer movement.
  The hotbar, sticky and setup share the selected monitor. Hot-plug selects an available
  monitor and clamps restored controls. Setup is created on first use to avoid its
  startup webview cost.
- macOS placement uses global logical origins derived from each target monitor;
  Windows uses physical desktop origins plus scaled local offsets. This avoids
  converting a global desktop origin with the floating window's previous scale.
  Canvas backing pixels update on window/DPR changes.
- Hotbar/sticky placement now uses stable display identity and local offsets, with
  legacy M1–M4 storage fallback. A preset writes a cleared-position marker so an old
  legacy custom offset cannot return after a reconnect. Layout-generated movement
  is filtered and does not replace remembered positions with stale move events.
- Text editing tracks the owning overlay. Global actions finish that editor; a late
  end-edit message from another display cannot resign the current editor. All overlays
  update click-through and drawing cursor state together; setup/sampling pause capture.
- All five action shortcuts are persisted/configurable. Native parsing canonicalizes
  aliases; duplicates, missing modifiers, Esc, and annotation undo/redo are rejected.
  Replacement registers the candidate before releasing the old key. A registration
  conflict keeps the previous key; a store failure restores the previous registration
  and cached configuration. Startup conflicts leave other actions usable and report
  an error in setup/hotbar. Recording temporarily releases active action keys; Esc or
  blur cancels and restores them. Undo/redo remain armed-only and pause during typing,
  setup, and sampling. Tray labels, the hotbar tooltip and setup footer use live bindings.
- `overlay-*` capabilities allow only session, focus, read-state and event commands;
  setup alone can edit shortcuts. Per-display session commands use the caller's native
  window identity, not a frontend-selected display ID.
- Windows CI tests/lints on a Windows runner and builds an NSIS installer. macOS release
  app/DMG packaging is reproducible without Finder automation. Signing/notarization
  and App Store restrictions are covered in [packaging](packaging.md). No M0 spike
  window remains; the window-level debug menu is retained for acceptance testing.

## Automated and local checks

- `pnpm test`: 57 frontend tests, including independent history restoration, capture
  keys/platform labels, existing editor/store races, shapes, erasing and history.
- `pnpm build`: TypeScript and all four production webview entries.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib`: 19 Rust tests,
  including negative-origin/fractional-DPI offset math, duplicate aliases/reserved keys,
  registration conflicts retaining old keys, and save-failure registration rollback.
- `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-features -- -D warnings`.
- Browser preview: changed a shortcut and saw its footer update; duplicate binding
  reported an error while retaining the working key; Esc canceled recording. Two canvas
  surfaces drew independently; Clear affected only the second, Undo restored it, and
  removing/recreating that simulated display restored its strokes and history.
- The preview is mocked IPC, not a hardware hot-plug or OS-focus test.

## Original M5 release artifacts and Windows build

The validation branch is `codex/m5-validation-20261103`; it does not update `main` or
close M5. Initial Windows build:
[41594233299](https://github.com/christianrazul/waypoint/actions/runs/41594233299),
commit `26134a6`, passed and produced an installer. The original M5 implementation build is
[41595482180](https://github.com/christianrazul/waypoint/actions/runs/41595482180),
commit `1f3f56c`, passed frontend/native tests, native lint, and NSIS packaging.
The downloaded artifact is `src-tauri/target/release/bundle/nsis/Waypoint_0.1.0_x64-setup.exe`.
Its outer NSIS launcher is PE32; the bundled application target is x64.
The CI snapshot includes application source and packaging scripts; documentation and
subsequent macOS-only signing verification do not change the Windows executable.

The local release `.app` and `.dmg` are Apple Silicon builds. Tauri's Finder-layout
step timed out, so `scripts/package-macos.sh` stages a plain Applications-symlink image,
seals/verifies the app's ad hoc signature, creates the DMG, and verifies its checksum.
Developer ID/notarization credentials and a Windows code-signing identity were not used.

Artifact SHA-256 checksums:

- `Waypoint_0.1.0_aarch64.dmg`: `9849accc42aef97f987421eac2f4d43f9d7076322a5ec873a5c7c465e6fd4a0b`
- `Waypoint_0.1.0_x64-setup.exe`: `c7b4c17afb376dc6ee96f21a9bf4bea28a1f77ad69d4e6f737ecec09e9462ffe`

## Performance measurements

Native profiles are recorded separately for idle and interaction. Reproduce against a
release app that has settled after startup (the script also waits 15 seconds):

```bash
python3 scripts/measure-idle.py APP_PID --seconds 30 --output /tmp/waypoint-idle.json
```

The script attributes WebKit/XPC helpers using the OS responsible-PID relationship,
not only child PIDs (WebKit processes can have parent PID 1). It samples process CPU
counter deltas/RSS, then collects `footprint` physical-memory totals. RSS and physical
footprint differ due to sharing, compression, and accounting; neither is a heap-only
React measurement. The report includes a digest of the measured executable.

Hardware: Apple M3 / macOS 27.0.1, two physical displays (2560×1440 144 Hz landscape
and 1080×1920 60 Hz portrait). These displays do not establish Retina testing.

The earlier observation is retained in [m5-performance-early.json](m5-performance-early.json):
10.494 seconds, 2.764% of one core on average, 233.34 MiB physical footprint.
The longer [interaction profile](m5-performance-interaction.json) ran for 31.450 seconds:
10.238% of one core, 349.84 MiB footprint. The persisted opacity/section changed during
that interval and an additional WebContent process appeared, so it is **not an idle
CPU result**. It reflects the cost of opening/interacting with controls on this machine.

After Chan confirmed a quiet interval, the [idle profile](m5-performance-idle.json)
measured 31.531 seconds, **0.159% of one core** on average, **286.00 MiB** physical
footprint, and 224.00–227.64 MiB RSS. Persisted settings stayed unchanged. The app
had been running for 6:54, setup had been visited, and the sticky was enabled on the
two-display configuration. The aggregate includes the app and 11 responsible helpers.
CPU counters have 10 ms resolution; this is a sampled idle result, not a zero-work claim.
The preliminary [quiet sample](m5-performance-quiet.json), taken before Chan's confirmation,
is retained separately: 31.414 seconds, 0.127% CPU, 291.93 MiB physical footprint.
The confirmed idle CPU result meets the target; other native configurations remain unmeasured.

The memory target is **not passed**. Setup is already lazy. Further cuts would be
creating/destroying the hidden sticky on demand, releasing the hidden hotbar webview,
and measuring a shared renderer or native floating controls to remove WebKit process
overhead. Font or stylesheet trimming alone will not address the observed process
costs. Each added overlay needs its own memory measurement. History/session retention
is unbounded within a run; Clear remains undoable and does not purge that history.
Large sessions also increase full-snapshot IPC cost; incremental cache updates and
an agreed retention policy are further optimization candidates.

Browser timing: [m5-browser-performance.json](m5-browser-performance.json): 49 frames,
median **12.10 ms**, p95 **12.80 ms**, at 1280×720 CSS pixels / DPR 1. It measures the
first pending pointer event to completion of Canvas draw submission, with no idle
frame loop. The sample used two clicks and five pen drags on two preview surfaces.
This is below a 16.67 ms frame at p95 for that sample. It does not include native
input delivery, compositor/presentation latency, OS focus, a tablet, or Retina scale;
the native 60 Hz Retina target is **unverified**.

## Native acceptance still required

### Two-display Undo failure and correction

Chan's native baseline test found that Cmd+Z removed the latest annotation on both
monitors, although the pointer was on only one. This fails display-scoped history
acceptance. Rust selected one overlay correctly, but the frontend registered its
listeners with Tauri's default `Any` target, which also receives targeted events.
The browser preview filtered iframe recipients before delivery and masked this bug.

The correction explicitly scopes Undo, Redo, Clear and text-commit listeners to
their current `WebviewWindow` label. Tool/color listeners remain global. Six event
regression tests cover both overlay labels, listener removal and shared state
subscriptions; all 63 frontend tests and the production build pass. The preview
now supplies each mocked window's identity. Chan reported that the native retest works.
This does not establish mixed-DPI, hot-plug, or full-screen acceptance. The Windows
installer above predates this correction.
The performance profiles and artifact checksums above describe the original M5
candidate, before this correction.

The corrected macOS app and DMG were rebuilt; strict bundle-signature verification
and DMG checksum verification passed. Corrected artifact SHA-256 values:

- App executable: `64af043f4e7a2695c589d2f2af82d629f4ecd362aea9ca84fd308f297e5322f2`
- DMG: `26d05aef7d1fb27e54d27d139310ced2a3244cb1d96446636a192085d431d5a8`


### macOS Space-scoped sessions

Chan approved keeping separate drawings/undo/redo per display and Space, with hotbar
and agenda sticky available across Spaces, and approved private macOS APIs for this.

- One overlay webview per connected display is retained. Native `canJoinAllSpaces`
  panel behavior is preserved for full-screen compatibility; the drawing session,
  rather than the panel's native Space membership, changes with the active Space.
- `platform/macos/spaces.rs` loads SkyLight with `dlopen` and checks both SLS/CGS
  symbol names for the main connection and copied managed-display Spaces. Calls are
  read-only: no Space creation/switching, Dock injection, or SIP changes. Framework
  availability, null results, JSON shape, Space identity and display mapping are checked.
- Display UUIDs come from CoreGraphics. Each display gets its own active Space UUID,
  falling back to a nonzero numeric Space ID when no UUID exists. A sole `Main` group
  supports macOS shared Spaces. Unknown mappings fail rather than guessing a display.
- NSWorkspace's own notification center observes `NSWorkspaceActiveSpaceDidChangeNotification`.
  Space refreshes coalesce on the main thread separately from hardware topology changes;
  observers are removed on exit. There is no idle Space polling loop.
- Each native binding has a generation. Saves retain the departing generation and
  are authorized against the caller's overlay. Late saves cannot cross display/Space
  boundaries or replace a newer generation's saved history. History remains memory-only.
- Changed overlays are hidden and made click-through. The frontend finishes outgoing
  text/gestures, flushes that history, ignores stale hydration replies, restores the new
  history and clears/redraws the canvas synchronously. Only the current generation's
  readiness acknowledgement can show the panel and re-enable input.
- Lookup failures suspend annotations and preserve saved sessions. Startup errors are
  exposed through the hotbar; runtime errors use the existing app error channel. A later
  successful notification or action can recover. Windows retains per-display sessions.
- Inactive Space histories and generation records add memory, but visiting a new Space
  does not create a new WebKit process. Deleted/recreated Spaces can get new identities;
  their old histories are retained until quit, not reassigned to another Space.

Validation: 71 frontend tests; 24 Rust unit tests; frontend build and all-feature
Rust lint pass. A separate ignored native integration test was explicitly run against
the logged-in WindowServer: both display groups returned usable Space identities and
matched public CoreGraphics display UUIDs. This proves lookup on this host, not Space
switching behavior. Browser preview drawing, scoped Clear/Undo and simulated display
reconnect restoration still pass. Rapid switching, delayed writes/hydration/readiness,
save failure and teardown are covered by unit tests.

Chan confirmed the native Space A/B baseline on 2026-11-03: drawings stayed separate
and restored correctly on return. The test prompt also included hotbar/sticky availability
across Spaces; no failure was reported for those controls. This is user-observed acceptance,
not an automated test. Undo isolation was confirmed in the earlier native retest.

Chan also confirmed the full-screen slideshow checkpoint on 2026-11-03: overlay
visibility and drawing restoration worked after switching away and back; clicking
hotbar/sticky controls preserved arrow-key slide navigation, and navigation worked
after committing annotation text. The presentation app was not specified, so this
records one macOS slideshow scenario rather than separate passes for all three apps.

Chan confirmed the idle display unplug/reconnect checkpoint on 2026-11-03:
with drawing disarmed, controls remained reachable and drawing worked on the remaining
display; reconnect placement and separate drawings were reported as fine. This covers
the idle path, not unplugging while armed or typing, mixed DPI, or display rearrangement.

Chan confirmed the native shortcut checkpoint on 2026-11-03: a changed Next-section
binding worked outside setup, assigning another Waypoint action's binding was rejected
while preserving the working key, Esc canceled recording without a change, and the
saved binding worked after quit/relaunch. This verifies Waypoint duplicate handling;
an actual OS/other-application registration conflict has not been tested.

Chan confirmed independent display Spaces on 2026-11-03: switching Spaces on one
monitor left the other monitor's drawings unchanged; switching back restored the
original drawings, and Undo remained scoped to the display under the pointer.

Chan confirmed the text-editing Space-switch checkpoint on 2026-11-04: text typed
in Space A without an explicit commit was committed in A after switching away,
was absent from B, and normal application keyboard shortcuts worked afterward.

Switching during a pen gesture, unplugging while armed or editing text, ending the
slideshow/returning to its desktop and visibility during the Space animation remain
pending.
The read-only private ABI is not guaranteed across macOS releases.
The final candidate passed macOS app signing verification and DMG checksum validation:

- App executable SHA-256: `bc1ace7a0d42f9edf804ccfb91176392447c3e9b9aaff257d8cd5fc0ce5b7fae`
- DMG SHA-256: `8f1afd9c1f9e929ce48d970e4e5ad66301d9f6aa5ac73c2e0938457fea71d953`

Windows validation uses commit `f4a4097` on the validation branch,
[run 41622648489](https://github.com/christianrazul/waypoint/actions/runs/41622648489),
which passed frontend tests/build, Windows native tests/lint, and NSIS packaging.
The downloaded installer replaced the local candidate at
`src-tauri/target/release/bundle/nsis/Waypoint_0.1.0_x64-setup.exe`.
Its SHA-256 is `281fc7cc3b72a4986db329eb741f0e1e6ae3dc2149534627b1734e847a3bb835`.
Windows virtual-desktop scoping is not part of this macOS feature; its per-display
session handshake compiled and passed CI, but Windows interactive acceptance remains open.
The initial Space-session CI attempt passed tests but caught two missing macOS-only
compilation guards in lint; those guards were added for this rerun.

Sources checked against implementation:
[Apple Space-change notification](https://developer.apple.com/documentation/appkit/nsworkspace/activespacedidchangenotification),
[yabai's display UUID and Space lookup implementation](https://github.com/koekeishiya/yabai/blob/master/src/display.c).

- [ ] Draw on every physical monitor, including negative origins and mixed DPI; move
      windows between displays and verify physical placement and canvas sharpness.
- [ ] Plug/unplug/rearrange monitors while idle, armed, and typing. Check overlay lifecycle,
      completed history restoration, fallback selection, and clamped hotbar/sticky/setup.
- [ ] Check Primary / Cursor invocation behavior and per-display placement restoration.
- [ ] Change action bindings; verify actual OS delivery, an OS/other-app conflict, duplicate
      rejection, cancellation, persistence across quit/relaunch, and armed-only undo/redo.
- [ ] On Windows 10/11 over full-screen PowerPoint: topmost, skip taskbar, non-activating
      controls, click-through, text/setup focus restoration, and EyeDropper availability.
- [ ] Validate the downloaded NSIS installer on a desktop, including WebView2 installation.
- [ ] Review Keynote/PowerPoint/Google Slides focus again after the multi-monitor changes.
- [ ] Measure native Retina pen/compositor latency and multi-monitor/visible-setup memory.
- [ ] Review and implement an agreed memory reduction if the 150 MB total remains required.
- [ ] Sign/notarize and validate trusted distribution artifacts when credentials are available.

M5 is not marked complete solely because a cross-platform build or mocked preview passes.
