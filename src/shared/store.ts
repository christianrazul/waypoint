import { create } from "zustand";
import { commands, on } from "./ipc";
import type { DrawingState } from "./types";

interface AppStore {
  drawing: DrawingState;
  ready: boolean;
  error: string | null;
  apply: (drawing: DrawingState) => void;
  reportError: (error: unknown) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  drawing: {
    tool: "pen",
    armed: false,
    editing: false,
    sampling: false,
    color: "#F0509A",
    revision: -1,
  },
  ready: false,
  error: null,
  apply: (drawing) =>
    set((state) =>
      drawing.revision >= state.drawing.revision
        ? { drawing, ready: true }
        : state,
    ),
  reportError: (error) => set({ error: String(error) }),
}));

export function connectDrawingState(): () => void {
  let disposed = false;
  const unlisteners: (() => void)[] = [];
  const receive = (drawing: DrawingState) => {
    if (!disposed) useAppStore.getState().apply(drawing);
  };
  const connect = async () => {
    for (const event of ["tool:changed", "color:changed"] as const) {
      const off = await on(event, receive);
      if (disposed) {
        off();
        return;
      }
      unlisteners.push(off);
    }
    receive(await commands.getDrawingState());
  };
  void connect().catch((error) => {
    if (!disposed) useAppStore.getState().reportError(error);
  });
  return () => {
    disposed = true;
    unlisteners.forEach((off) => off());
  };
}

export async function runCommand(command: () => Promise<void>): Promise<void> {
  useAppStore.setState({ error: null });
  try {
    await command();
  } catch (error) {
    useAppStore.getState().reportError(error);
  }
}
