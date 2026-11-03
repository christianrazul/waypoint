import { create } from "zustand";
import { commands, on } from "./ipc";
import type { AgendaState } from "./types";

interface AgendaStore {
  state: AgendaState | null;
  ready: boolean;
  error: string | null;
  apply: (state: AgendaState) => void;
  reportError: (error: unknown) => void;
}
export const useAgendaStore = create<AgendaStore>((set) => ({
  state: null,
  ready: false,
  error: null,
  apply: (state) =>
    set((current) =>
      !current.state || state.revision >= current.state.revision
        ? { state, ready: true, error: null }
        : current,
    ),
  reportError: (error) => set({ error: String(error) }),
}));

export function connectAgendaState(): () => void {
  let disposed = false;
  let dirty = false;
  let reading = false;
  const unlisteners: (() => void)[] = [];
  const refresh = () => {
    dirty = true;
    if (reading || disposed) return;
    reading = true;
    void (async () => {
      try {
        while (dirty && !disposed) {
          dirty = false;
          const snapshot = await commands.getAgendaState();
          if (!disposed) useAgendaStore.getState().apply(snapshot);
        }
      } catch (error) {
        if (!disposed) useAgendaStore.getState().reportError(error);
      } finally {
        reading = false;
      }
    })();
  };
  const connect = async () => {
    for (const event of ["agenda:changed", "sticky:toggle"] as const) {
      const off = await on(event, refresh);
      if (disposed) {
        off();
        return;
      }
      unlisteners.push(off);
    }
    refresh();
  };
  void connect().catch((error) => {
    if (!disposed) useAgendaStore.getState().reportError(error);
  });
  return () => {
    disposed = true;
    unlisteners.forEach((off) => off());
  };
}

export async function runAgendaCommand(
  command: () => Promise<AgendaState>,
): Promise<void> {
  useAgendaStore.setState({ error: null });
  try {
    useAgendaStore.getState().apply(await command());
  } catch (error) {
    useAgendaStore.getState().reportError(error);
  }
}
