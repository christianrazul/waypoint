import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { DrawingState } from "./types";

export interface Events {
  "tool:changed": DrawingState;
  "color:changed": DrawingState;
  "annotations:clear": null;
}

export function on<K extends keyof Events>(
  event: K,
  handler: (payload: Events[K]) => void,
): Promise<UnlistenFn> {
  return listen<Events[K]>(event, (e) => handler(e.payload));
}

export const commands = {
  getDrawingState: () => invoke<DrawingState>("get_drawing_state"),
  togglePen: () => invoke<void>("toggle_pen"),
  setColor: (color: string) => invoke<void>("set_color", { color }),
  clearAnnotations: () => invoke<void>("clear_annotations"),
  closeHotbar: () => invoke<void>("close_hotbar"),
  setPickerOpen: (open: boolean) => invoke<void>("set_picker_open", { open }),
};
