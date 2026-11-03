import { StrictMode, useCallback, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { connectAgendaState, useAgendaStore } from "../shared/agenda-store";
import { commands, on } from "../shared/ipc";
import { flushEdits } from "./editing";
import { Setup } from "./Setup";
import "../shared/tokens.css";
import "./styles.css";

function SetupWindow() {
  const { state, error } = useAgendaStore();
  const closing = useRef(false);
  useEffect(connectAgendaState, []);
  const close = useCallback(async () => {
    if (closing.current) return;
    closing.current = true;
    try {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
      await commands.recordShortcut(false);
      if (!(await flushEdits())) {
        await commands.openSetup();
        return;
      }
      await commands.closeSetup();
    } catch (error) {
      useAgendaStore.getState().reportError(error);
    } finally {
      closing.current = false;
    }
  }, []);
  useEffect(() => {
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    const subscribe = async () => {
      for (const [event, handler] of [
        [
          "setup:closing",
          () => {
            void close();
          },
        ],
        [
          "setup:opened",
          () => {
            document
              .querySelector<HTMLButtonElement>(".close-setup")
              ?.focus({ preventScroll: true });
          },
        ],
      ] as const) {
        const off = await on(event, handler);
        if (disposed) off();
        else unlisteners.push(off);
      }
    };
    void subscribe().catch((error) =>
      useAgendaStore.getState().reportError(error),
    );
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void close();
      }
    };
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        !event.target.closest(".setup-panel")
      )
        void close();
    };
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    return () => {
      disposed = true;
      unlisteners.forEach((off) => off());
      document.removeEventListener("keydown", escape);
      document.removeEventListener("pointerdown", outside);
    };
  }, [close]);
  return state ? (
    <Setup state={state} error={error} onClose={() => void close()} />
  ) : error ? (
    <div className="setup-surface">
      <p className="setup-panel setup-error" role="alert">
        {error}
      </p>
    </div>
  ) : null;
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SetupWindow />
  </StrictMode>,
);
