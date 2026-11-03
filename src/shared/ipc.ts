import type { HistorySnapshot } from "../overlay/history";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AgendaEdit,
  AgendaDirection,
  AgendaState,
  DrawingState,
  Features,
  Tool,
  ShortcutSnapshot,
  ShortcutAction,
} from "./types";

export interface Events {
  "app:error": string;
  "displays:changed": null;
  "shortcuts:changed": ShortcutSnapshot;
  "tool:changed": DrawingState;
  "color:changed": DrawingState;
  "annotations:clear": null;
  "annotations:undo": null;
  "annotations:redo": null;
  "text:commit": null;
  "agenda:changed": number;
  "sticky:toggle": boolean;
  "setup:opened": null;
  "setup:closing": null;
}

export function on<K extends keyof Events>(
  event: K,
  handler: (payload: Events[K]) => void,
): Promise<UnlistenFn> {
  return listen<Events[K]>(event, (e) => handler(e.payload));
}

export const commands = {
  recordShortcut: (active: boolean) =>
    invoke<void>("record_shortcut", { active }),
  getShortcuts: () => invoke<ShortcutSnapshot>("get_shortcuts"),
  setShortcut: (action: ShortcutAction, binding: string) =>
    invoke<ShortcutSnapshot>("set_shortcut", { action, binding }),
  getOverlaySession: () =>
    invoke<HistorySnapshot | null>("get_overlay_session"),
  saveOverlaySession: (snapshot: HistorySnapshot) =>
    invoke<void>("save_overlay_session", { snapshot }),
  editAgenda: (edit: AgendaEdit) =>
    invoke<AgendaState>("edit_agenda", { edit }),
  openSetup: () => invoke<void>("open_setup"),
  requestSetupClose: () => invoke<void>("request_setup_close"),
  closeSetup: () => invoke<void>("close_setup"),
  startStickyDrag: () => invoke<void>("start_sticky_drag"),
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
