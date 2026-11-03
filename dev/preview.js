import seed from "../src/shared/seed-agenda.json";
const agendaKey = "waypoint-preview-agenda-v1";
let storedAgenda;
try {
  storedAgenda = JSON.parse(localStorage.getItem(agendaKey));
} catch {
  storedAgenda = null;
}

const bridge = {
  agenda: storedAgenda ?? structuredClone(seed),
  state: {
    tool: "pen",
    armed: false,
    editing: false,
    sampling: false,
    color: "#F0509A",
    revision: 0,
  },
  emit(event, payload = null) {
    for (const frame of document.querySelectorAll("iframe"))
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
    this.emit("agenda:changed", next.revision);
  },
  toggleSticky() {
    const next = structuredClone(this.agenda);
    next.settings.enabled = !next.settings.enabled;
    this.setAgenda(next);
    this.emit("sticky:toggle", next.settings.enabled);
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
    if (event.ctrlKey && event.altKey) {
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        this.toggleSticky();
        return;
      }
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        this.navigateAgenda(event.key === "ArrowRight" ? "next" : "previous");
        return;
      }
    }
    if (!this.state.armed || this.state.editing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      this.update({ armed: false });
    } else if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "z"
    ) {
      event.preventDefault();
      this.emit(event.shiftKey ? "annotations:redo" : "annotations:undo");
    }
  },
};
window.waypointPreview = bridge;
for (const view of ["overlay", "hotbar", "sticky"]) {
  const frame = document.createElement("iframe");
  frame.id = view;
  frame.title = `Waypoint ${view}`;
  frame.src = `/dev/window.html?view=${view}`;
  document.body.insertBefore(frame, document.querySelector(".controls"));
}
for (const action of ["undo", "redo", "clear"])
  document.getElementById(action).onclick = () => {
    bridge.emit("text:commit");
    bridge.emit(`annotations:${action}`);
  };
window.addEventListener("keydown", (event) => bridge.key(event));

document.getElementById("sticky").style.visibility = bridge.agenda.settings
  .enabled
  ? "visible"
  : "hidden";
document.getElementById("reset-agenda").onclick = () =>
  bridge.setAgenda(structuredClone(seed));
