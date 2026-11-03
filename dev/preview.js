import { DEFAULT_SHORTCUTS, captureShortcut } from "../src/shared/shortcuts";
import { editPreviewAgenda } from "./agenda";
import seed from "../src/shared/seed-agenda.json";
const agendaKey = "waypoint-preview-agenda-v1";
let storedAgenda;
try {
  storedAgenda = JSON.parse(localStorage.getItem(agendaKey));
} catch {
  storedAgenda = null;
}

const bridge = {
  setupOpen: false,
  activeOverlay: "overlay",
  sessions: new Map(),
  recording: false,
  shortcuts: {
    bindings: JSON.parse(
      localStorage.getItem("waypoint-preview-shortcuts"),
    ) ?? { ...DEFAULT_SHORTCUTS },
    error: null,
    revision: 0,
  },
  agenda: storedAgenda ?? structuredClone(seed),
  state: {
    tool: "pen",
    armed: false,
    editing: false,
    sampling: false,
    color: "#F0509A",
    revision: 0,
  },
  emit(event, payload = null, target = null) {
    for (const frame of [...document.querySelectorAll("iframe")].filter(
      (frame) => !target || frame.id === target,
    ))
      frame.contentWindow.postMessage(
        { kind: "waypoint-preview", event, payload },
        location.origin,
      );
  },
  update(patch, event = "tool:changed") {
    this.state = { ...this.state, ...patch, revision: this.state.revision + 1 };
    this.emit(event, this.state);
  },
  setAgenda(next) {
    next.revision = this.agenda.revision + 1;
    localStorage.setItem(agendaKey, JSON.stringify(next));
    this.agenda = next;
    document.getElementById("sticky").style.visibility = next.settings.enabled
      ? "visible"
      : "hidden";
    this.placeSticky();
    this.emit("agenda:changed", next.revision);
  },
  openSetup() {
    this.setupOpen = true;
    document.getElementById("overlay").style.pointerEvents = "none";
    document.getElementById("setup").style.visibility = "visible";
    this.emit("setup:opened");
  },
  closeSetup() {
    this.setupOpen = false;
    document.getElementById("overlay").style.pointerEvents = "auto";
    document.getElementById("setup").style.visibility = "hidden";
  },
  editAgenda(edit) {
    if (edit.type === "corner")
      localStorage.removeItem("waypoint-preview-position");
    this.setAgenda(editPreviewAgenda(structuredClone(this.agenda), edit));
    return structuredClone(this.agenda);
  },
  placeSticky() {
    const frame = document.getElementById("sticky");
    const corner = this.agenda.settings.corner;
    const height = Number.parseFloat(frame.style.height) || 416;
    let custom;
    try {
      custom = JSON.parse(localStorage.getItem("waypoint-preview-position"));
    } catch {
      custom = null;
    }
    const ox = custom?.x ?? 40;
    const oy = custom?.y ?? 32;
    const left = corner.endsWith("r") ? innerWidth - 460 - ox : ox;
    const top = corner.startsWith("b") ? innerHeight - (height - 96) - oy : oy;
    frame.style.left = `${Math.max(0, Math.min(innerWidth - 460, left)) - 48}px`;
    frame.style.top = `${Math.max(0, Math.min(innerHeight - height + 96, top)) - 48}px`;
    frame.style.bottom = "auto";
  },
  toggleSticky() {
    const next = structuredClone(this.agenda);
    next.settings.enabled = !next.settings.enabled;
    this.setAgenda(next);
    this.emit("sticky:toggle", next.settings.enabled);
    if (next.settings.enabled && !next.agenda.sections.length) this.openSetup();
    return structuredClone(this.agenda);
  },
  navigateAgenda(direction) {
    const next = structuredClone(this.agenda);
    next.agenda.currentIndex = Math.max(
      0,
      Math.min(
        next.agenda.sections.length - 1,
        next.agenda.currentIndex + (direction === "next" ? 1 : -1),
      ),
    );
    this.setAgenda(next);
    return structuredClone(this.agenda);
  },
  key(event) {
    if (this.recording) return;
    const binding = captureShortcut(event);
    const action = Object.entries(this.shortcuts.bindings).find(
      ([, value]) => value.toLowerCase() === binding?.toLowerCase(),
    )?.[0];
    if (action) {
      event.preventDefault();
      if (action === "toggleSticky") this.toggleSticky();
      if (action === "toggleDrawing") this.update({ armed: !this.state.armed });
      if (action === "next" || action === "previous")
        this.navigateAgenda(action);
      if (action === "clear")
        this.emit("annotations:clear", null, this.activeOverlay);
      return;
    }
    if (this.setupOpen || !this.state.armed || this.state.editing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      this.update({ armed: false });
    } else if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "z"
    ) {
      event.preventDefault();
      this.emit(
        event.shiftKey ? "annotations:redo" : "annotations:undo",
        null,
        this.activeOverlay,
      );
    }
  },
};
window.waypointPreview = bridge;
for (const view of ["overlay", "hotbar", "sticky", "setup"]) {
  const frame = document.createElement("iframe");
  frame.id = view;
  frame.title = `Waypoint ${view}`;
  frame.src = `/dev/window.html?view=${view}`;
  document.body.insertBefore(frame, document.querySelector(".controls"));
}
for (const action of ["undo", "redo", "clear"])
  document.getElementById(action).onclick = () => {
    bridge.emit("text:commit");
    bridge.emit(`annotations:${action}`, null, bridge.activeOverlay);
  };
window.addEventListener("keydown", (event) => bridge.key(event));

document.getElementById("sticky").style.visibility = bridge.agenda.settings
  .enabled
  ? "visible"
  : "hidden";
document.getElementById("reset-agenda").onclick = () =>
  bridge.setAgenda(structuredClone(seed));

bridge.placeSticky();
document.getElementById("open-setup").onclick = () => bridge.openSetup();
window.addEventListener("mousedown", () => {
  if (bridge.setupOpen) bridge.emit("setup:closing");
});
window.addEventListener("resize", () => bridge.placeSticky());

document.getElementById("second-display").onchange = (event) => {
  const first = document.getElementById("overlay");
  if (event.currentTarget.checked) {
    first.style.width = "50vw";
    const second = document.createElement("iframe");
    second.id = "overlay-secondary";
    second.title = "Waypoint second display";
    second.src = "/dev/window.html?view=overlay-secondary";
    document.body.insertBefore(second, document.getElementById("hotbar"));
  } else {
    document.getElementById("overlay-secondary")?.remove();
    first.style.width = "100vw";
    bridge.activeOverlay = "overlay";
  }
};
