import { useRef, useState } from "react";
import { commands } from "../shared/ipc";
import {
  captureShortcut,
  formatShortcut,
  useShortcuts,
  useShortcutStore,
} from "../shared/shortcuts";
import type { ShortcutAction } from "../shared/types";
const actions: [ShortcutAction, string][] = [
  ["next", "Next section"],
  ["previous", "Previous section"],
  ["toggleDrawing", "Toggle drawing"],
  ["clear", "Clear annotations"],
  ["toggleSticky", "Toggle sticky"],
];
export function Shortcuts() {
  const { snapshot, ready, error: loadError } = useShortcuts();
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<ShortcutAction | null>(null);
  const cancel = async () => {
    active.current = null;
    setRecording(null);
    await commands.recordShortcut(false);
  };
  return (
    <div className="setup-group">
      <h2>Shortcuts</h2>
      {(error || loadError || snapshot.error) && (
        <p className="setup-error" role="alert">
          {error ?? loadError ?? snapshot.error}
        </p>
      )}
      <div className="shortcut-list">
        {actions.map(([action, label]) => (
          <label key={action} className="shortcut-row">
            <span>{label}</span>
            <button
              aria-label={`Record ${label} shortcut`}
              disabled={!ready || busy}
              className={recording === action ? "recording" : ""}
              onClick={async (event) => {
                const button = event.currentTarget;
                setBusy(true);
                setError(null);
                try {
                  await commands.recordShortcut(true);
                  active.current = action;
                  setRecording(action);
                } catch (error) {
                  setError(String(error));
                } finally {
                  setBusy(false);
                  requestAnimationFrame(() => {
                    if (active.current === action && button.isConnected)
                      button.focus();
                  });
                }
              }}
              onBlur={() => {
                if (active.current === action)
                  void cancel().catch((error) => setError(String(error)));
              }}
              onKeyDown={async (event) => {
                if (active.current !== action || event.repeat) return;
                event.preventDefault();
                event.stopPropagation();
                if (event.key === "Escape") {
                  await cancel().catch((error) => setError(String(error)));
                  return;
                }
                const binding = captureShortcut(event.nativeEvent);
                if (!binding) return;
                setBusy(true);
                try {
                  await cancel();
                  useShortcutStore
                    .getState()
                    .apply(await commands.setShortcut(action, binding));
                  setError(null);
                } catch (error) {
                  setError(String(error));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {recording === action
                ? "Press shortcut…"
                : formatShortcut(snapshot.bindings[action])}
            </button>
          </label>
        ))}
      </div>
      <p className="field-hint">
        Click a binding, then press its new shortcut. Esc cancels recording.
        Undo/redo stay reserved for drawing and text editing.
      </p>
    </div>
  );
}
