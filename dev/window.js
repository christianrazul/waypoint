import { mockIPC } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
const bridge = window.parent.waypointPreview;
window.addEventListener("message", ({ origin, data }) => {
  if (origin === location.origin && data?.kind === "waypoint-preview")
    void emit(data.event, data.payload);
});
window.addEventListener("keydown", (event) => bridge.key(event));
mockIPC(
  (command, args) => {
    switch (command) {
      case "request_setup_close":
        if (bridge.setupOpen) bridge.emit("setup:closing");
        break;
      case "open_setup":
        bridge.openSetup();
        break;
      case "close_setup":
        bridge.closeSetup();
        break;
      case "edit_agenda":
        return bridge.editAgenda(args.edit);
      case "start_sticky_drag":
        startStickyDrag();
        break;
      case "get_agenda_state":
        return structuredClone(bridge.agenda);
      case "toggle_sticky":
        return bridge.toggleSticky();
      case "navigate_agenda":
        return bridge.navigateAgenda(args.direction);
      case "set_agenda_item_done": {
        const next = structuredClone(bridge.agenda);
        const section = next.agenda.sections.find(
          (section) => section.id === args.sectionId,
        );
        const item = section?.items.find((item) => item.id === args.itemId);
        if (!item) throw new Error("Unknown checklist item");
        item.done = args.done;
        bridge.setAgenda(next);
        return structuredClone(bridge.agenda);
      }
      case "resize_sticky": {
        const limit = window.parent.innerHeight - 160;
        window.frameElement.style.height = `${Math.min(args.height, limit) + 96}px`;
        bridge.placeSticky();
        return limit;
      }
      case "get_drawing_state":
        return { ...bridge.state };
      case "get_features":
        return { nativeEyedropper: false, webEyedropper: false };
      case "select_tool":
        bridge.update({
          tool: args.tool,
          armed: !bridge.state.armed || bridge.state.tool !== args.tool,
          editing: false,
        });
        break;
      case "set_color":
        bridge.update({ color: args.color }, "color:changed");
        break;
      case "begin_text_edit":
        bridge.update({ editing: true });
        break;
      case "end_text_edit":
        if (bridge.state.editing) bridge.update({ editing: false });
        break;
      case "clear_annotations":
        bridge.emit("text:commit");
        bridge.emit("annotations:clear");
        break;
      case "close_hotbar":
        bridge.update({ armed: false, editing: false });
        window.frameElement.style.display = "none";
        break;
      case "set_picker_open":
        window.frameElement.style.height = args.open ? "384px" : "112px";
        break;
      case "plugin:window|start_dragging":
        break;
      default:
        throw new Error(`Unsupported preview command: ${command}`);
    }
  },
  { shouldMockEvents: true },
);
const view = new URLSearchParams(location.search).get("view");
if (view === "overlay") await import("../src/overlay/main.tsx");
else if (view === "hotbar") await import("../src/hotbar/main.tsx");
else if (view === "sticky") await import("../src/sticky/main.tsx");
else if (view === "setup") await import("../src/setup/main.tsx");
else throw new Error("Unknown preview surface");

let dragStart;
window.addEventListener("mousedown", (event) => {
  dragStart = { x: event.screenX, y: event.screenY };
  if (view !== "setup" && bridge.setupOpen) bridge.emit("setup:closing");
});
function startStickyDrag() {
  if (!dragStart) return;
  const frame = window.frameElement;
  const start = {
    ...dragStart,
    left: parseFloat(frame.style.left),
    top: parseFloat(frame.style.top),
  };
  const move = (event) => {
    const left = Math.max(
      0,
      Math.min(
        parent.innerWidth - 460,
        start.left + 48 + event.screenX - start.x,
      ),
    );
    const height = parseFloat(frame.style.height) - 96;
    const top = Math.max(
      0,
      Math.min(
        parent.innerHeight - height,
        start.top + 48 + event.screenY - start.y,
      ),
    );
    const corner = bridge.agenda.settings.corner;
    localStorage.setItem(
      "waypoint-preview-position",
      JSON.stringify({
        x: corner.endsWith("r") ? parent.innerWidth - 460 - left : left,
        y: corner.startsWith("b") ? parent.innerHeight - height - top : top,
      }),
    );
    bridge.placeSticky();
  };
  const end = () => {
    for (const target of [window, parent]) {
      target.removeEventListener("mousemove", move);
      target.removeEventListener("mouseup", end);
    }
  };
  for (const target of [window, parent]) {
    target.addEventListener("mousemove", move);
    target.addEventListener("mouseup", end);
  }
}
