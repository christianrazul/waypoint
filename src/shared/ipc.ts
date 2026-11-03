import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type Level = "status" | "popUpMenu" | "screenSaver" | "shielding";

export interface SpikeState {
  appName: string;
  clickThrough: boolean;
  level: Level;
  frontmostApp: string | null;
}

/** Typed event map. Every cross-window event goes through here. */
export interface Events {
  "overlay:armed": boolean;
  "annotations:clear": null;
  "spike:level": Level;
}

export function on<K extends keyof Events>(
  event: K,
  handler: (payload: Events[K]) => void,
): Promise<UnlistenFn> {
  return listen<Events[K]>(event, (e) => handler(e.payload));
}

export const commands = {
  getSpikeState: () => invoke<SpikeState>("get_spike_state"),
  setClickThrough: (enabled: boolean) => invoke<void>("set_click_through", { enabled }),
  spikePing: (count: number) => invoke<void>("spike_ping", { count }),
};
