import { useEffect } from "react";
import { create } from "zustand";
import { commands, on } from "./ipc";
import type { ShortcutAction, ShortcutSnapshot } from "./types";
export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  next: "ctrl+alt+ArrowRight",
  previous: "ctrl+alt+ArrowLeft",
  toggleDrawing: "ctrl+alt+KeyD",
  clear: "ctrl+alt+KeyC",
  toggleSticky: "ctrl+alt+KeyS",
};
export const useShortcutStore = create<{
  snapshot: ShortcutSnapshot;
  ready: boolean;
  error: string | null;
  apply: (value: ShortcutSnapshot) => void;
}>((set) => ({
  snapshot: { bindings: DEFAULT_SHORTCUTS, revision: -1, error: null },
  ready: false,
  error: null,
  apply: (snapshot) =>
    set((current) =>
      snapshot.revision >= current.snapshot.revision
        ? { snapshot, ready: true, error: null }
        : current,
    ),
}));
export function connectShortcuts(): () => void {
  let disposed = false;
  let off: (() => void) | undefined;
  void (async () => {
    off = await on("shortcuts:changed", (snapshot) => {
      if (!disposed) useShortcutStore.getState().apply(snapshot);
    });
    if (disposed) {
      off();
      return;
    }
    const snapshot = await commands.getShortcuts();
    if (!disposed) useShortcutStore.getState().apply(snapshot);
  })().catch((error) => {
    if (!disposed) useShortcutStore.setState({ error: String(error) });
  });
  return () => {
    disposed = true;
    off?.();
  };
}
export function useShortcuts() {
  useEffect(connectShortcuts, []);
  return useShortcutStore();
}
export function formatShortcut(
  binding: string,
  mac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform),
): string {
  return binding
    .split("+")
    .map((part) => {
      const lower = part.toLowerCase();
      if (["ctrl", "control"].includes(lower)) return "Ctrl";
      if (["alt", "option"].includes(lower)) return mac ? "Option" : "Alt";
      if (["meta", "super", "cmd", "command"].includes(lower))
        return mac ? "Cmd" : "Win";
      if (lower === "shift") return "Shift";
      return part
        .replace(/^Key/i, "")
        .replace(/^Digit/i, "")
        .replace(/^Arrow/i, "");
    })
    .join("+");
}
export function captureShortcut(
  event: Pick<
    KeyboardEvent,
    "code" | "ctrlKey" | "altKey" | "metaKey" | "shiftKey"
  >,
): string | null {
  if (/^(Control|Alt|Meta|Shift)/.test(event.code) || !event.code) return null;
  return [
    event.ctrlKey && "ctrl",
    event.altKey && "alt",
    event.metaKey && "super",
    event.shiftKey && "shift",
    event.code,
  ]
    .filter(Boolean)
    .join("+");
}
