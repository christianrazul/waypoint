import { connectSetupDismissal } from "../shared/setup-dismissal";
import {
  StrictMode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { commands } from "../shared/ipc";
import {
  connectAgendaState,
  runAgendaCommand,
  useAgendaStore,
} from "../shared/agenda-store";
import { Sticky } from "./Sticky";
import "../shared/tokens.css";
import "./styles.css";

function StickyWindow() {
  useEffect(connectSetupDismissal, []);
  const { state, error } = useAgendaStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<() => void>(() => {});
  const [maxHeight, setMaxHeight] = useState<number>();
  const [busy, setBusy] = useState<Set<string>>(new Set());
  useEffect(connectAgendaState, []);

  useLayoutEffect(() => {
    const element = containerRef.current?.firstElementChild;
    if (!element) return;
    let disposed = false;
    let pending: number | null = null;
    let lastHeight = -1;
    let sending = false;
    const send = async () => {
      if (sending) return;
      sending = true;
      try {
        while (pending !== null && !disposed) {
          const height = pending;
          pending = null;
          if (height === lastHeight) continue;
          const limit = await commands.resizeSticky(height);
          lastHeight = height;
          if (!disposed) setMaxHeight(limit);
        }
      } catch (error) {
        if (!disposed) useAgendaStore.getState().reportError(error);
      } finally {
        sending = false;
      }
    };
    const measure = () => {
      if (disposed) return;
      const note = element.querySelector<HTMLElement>(".sticky");
      if (note && element instanceof HTMLElement) {
        const expansion = note.classList.contains("sticky-paper")
          ? Math.max(0, note.getBoundingClientRect().height - note.offsetHeight)
          : 0;
        element.style.paddingBlock = `${expansion / 2}px`;
      }
      const height = Math.ceil(element.getBoundingClientRect().height);
      if (height > 0) {
        pending = height;
        void send();
      }
    };
    measureRef.current = measure;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    void document.fonts.ready.then(measure);
    return () => {
      disposed = true;
      measureRef.current = () => {};
      observer.disconnect();
    };
  }, [Boolean(state)]);
  useLayoutEffect(() => {
    measureRef.current();
  }, [state?.revision]);

  const setDone = (sectionId: string, itemId: string, done: boolean) => {
    setBusy((current) => new Set(current).add(itemId));
    void runAgendaCommand(() =>
      commands.setAgendaItemDone(sectionId, itemId, done),
    ).finally(() =>
      setBusy((current) => {
        const next = new Set(current);
        next.delete(itemId);
        return next;
      }),
    );
  };
  return (
    <main ref={containerRef} className="sticky-surface">
      {state ? (
        <div className="sticky-frame">
          <Sticky
            state={state}
            busy={busy}
            error={error}
            maxHeight={
              maxHeight === undefined
                ? undefined
                : Math.max(
                    1,
                    maxHeight - (state.settings.style === "paper" ? 13 : 0),
                  )
            }
            onDone={setDone}
            onDrag={() =>
              void commands
                .startStickyDrag()
                .catch((error) => useAgendaStore.getState().reportError(error))
            }
            onSetup={() =>
              void commands
                .openSetup()
                .catch((error) => useAgendaStore.getState().reportError(error))
            }
            onNavigate={(direction) =>
              void runAgendaCommand(() => commands.navigateAgenda(direction))
            }
          />
        </div>
      ) : error ? (
        <div className="sticky sticky-error" role="alert">
          {error}
        </div>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StickyWindow />
  </StrictMode>,
);
