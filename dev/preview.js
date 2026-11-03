const bridge = {
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
  key(event) {
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
for (const view of ["overlay", "hotbar"]) {
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
