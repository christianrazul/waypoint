import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AgendaDirection,
  AgendaState,
  DrawingState,
  Features,
  Tool,
} from "./types";

export interface Events {
  "tool:changed": DrawingState;
  "color:changed": DrawingState;
  "annotations:clear": null;
  "annotations:undo": null;
  "annotations:redo": null;
  "text:commit": null;
  "agenda:changed": number;
  "sticky:toggle": boolean;
  "setup:requested": null;
}

export function on<K extends keyof Events>(
  event: K,
  handler: (payload: Events[K]) => void,
): Promise<UnlistenFn> {
  return listen<Events[K]>(event, (e) => handler(e.payload));
}

export const commands = {
  getAgendaState: () => invoke<AgendaState>("get_agenda_state"),
  toggleSticky: () => invoke<AgendaState>("toggle_sticky"),
  navigateAgenda: (direction: AgendaDirection) =>
    invoke<AgendaState>("navigate_agenda", { direction }),
  setAgendaItemDone: (sectionId: string, itemId: string, done: boolean) =>
    invoke<AgendaState>("set_agenda_item_done", { sectionId, itemId, done }),
  resizeSticky: (height: number) => invoke<number>("resize_sticky", { height }),
  getDrawingState: () => invoke<DrawingState>("get_drawing_state"),
  selectTool: (tool: Tool) => invoke<void>("select_tool", { tool }),
  beginTextEdit: () => invoke<void>("begin_text_edit"),
  endTextEdit: () => invoke<void>("end_text_edit"),
  getFeatures: () => invoke<Features>("get_features"),
  beginSampling: () => invoke<void>("begin_sampling"),
  endSampling: () => invoke<void>("end_sampling"),
  sampleColor: () => invoke<void>("sample_color"),
  setColor: (color: string) => invoke<void>("set_color", { color }),
  clearAnnotations: () => invoke<void>("clear_annotations"),
  closeHotbar: () => invoke<void>("close_hotbar"),
  setPickerOpen: (open: boolean) => invoke<void>("set_picker_open", { open }),
};
