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
else throw new Error("Unknown preview surface");
