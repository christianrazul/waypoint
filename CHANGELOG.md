# Changelog

## 0.1.0

First personal-use release (macOS, Apple Silicon). Ad hoc signed; not notarized.

- Menu-bar tray, click-through overlay and non-activating hotbar (M0–M1).
- Drawing tools: pen, shapes, text, eraser, undo/redo; hold H for fading highlights (M1–M2, #8).
- Agenda sticky with checklist, navigation and persistence (M3).
- Setup window: editing, styles, position, compact mode (M4).
- Multi-monitor overlays with per-display, per-Space annotation sessions (memory only).
- Configurable global shortcuts, Primary / Display-at-cursor placement (M5).
- Hotbar: drag from anywhere, icon-only sticky toggle (#9, #10).

Known limitations: memory footprint above the 150 MB target (~286 MiB, two displays);
Retina latency unmeasured; Space scoping uses private SkyLight APIs that may break on
macOS updates; Windows support is post-v1 and untested on a desktop.
