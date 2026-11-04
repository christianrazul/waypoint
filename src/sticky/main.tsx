import { connectSetupDismissal } from "../shared/setup-dismissal";
import {
  StrictMode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { commands, on } from "../shared/ipc";
import {
  connectAgendaState,
  runAgendaCommand,
  useAgendaStore,
} from "../shared/agenda-store";
import { Sticky } from "./Sticky";
import { StickyEditor } from "./StickyEditor";
import { parseAgenda, sectionOffset, serializeAgenda } from "./markdown";
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
  const [draft, setDraft] = useState<{
    text: string;
    original: string;
    caret: number;
    focused: boolean;
    saving: boolean;
  } | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const beginEdit = () => {
    const current = useAgendaStore.getState().state;
    if (!current || draftRef.current) return;
    const text = serializeAgenda(current.agenda.sections);
    const next = {
      text,
      original: text,
      caret: Math.min(
        text.length,
        sectionOffset(current.agenda.sections, current.agenda.currentIndex),
      ),
      focused: false,
      saving: false,
    };
    draftRef.current = next;
    setDraft(next);
    useAgendaStore.setState({ error: null });
    commands.beginStickyEdit().then(
      () => setDraft((d) => d && { ...d, focused: true }),
      (error) => {
        draftRef.current = null;
        setDraft(null);
        useAgendaStore.getState().reportError(error);
      },
    );
  };
  const finishEdit = () => {
    draftRef.current = null;
    setDraft(null);
    void commands
      .endStickyEdit()
      .catch((error) => useAgendaStore.getState().reportError(error));
  };
  const saveEdit = async () => {
    const current = draftRef.current;
    const agenda = useAgendaStore.getState().state;
    if (!current || current.saving || !agenda) return;
    if (current.text === current.original) return finishEdit();
    draftRef.current = { ...current, saving: true };
    setDraft(draftRef.current);
    try {
      useAgendaStore.getState().apply(
        await commands.editAgenda({
          type: "replaceSections",
          sections: parseAgenda(current.text, agenda.agenda.sections),
        }),
      );
      finishEdit();
    } catch (error) {
      useAgendaStore.getState().reportError(error);
      draftRef.current = draftRef.current && {
        ...draftRef.current,
        saving: false,
      };
      setDraft(draftRef.current);
    }
  };
  // Editing stays open until Save or Cancel, even while you copy from other apps. Clicking
  // back into the editor re-takes keyboard focus if something else (setup, the text tool)
  // ended the native edit session in the meantime.
  const refocusEdit = () => {
    if (draftRef.current)
      void commands
        .beginStickyEdit()
        .catch((error) => useAgendaStore.getState().reportError(error));
  };

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
    const offDisplay = on("displays:changed", () => {
      lastHeight = -1;
      measure();
    });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    void document.fonts.ready.then(measure);
    return () => {
      disposed = true;
      measureRef.current = () => {};
      observer.disconnect();
      void offDisplay.then((off) => off()).catch(() => {});
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
    <main
      ref={containerRef}
      className="sticky-surface"
      style={
        {
          "--sticky-scale": (state?.settings.scale ?? 100) / 100,
        } as React.CSSProperties
      }
    >
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
                    maxHeight -
                      (state.settings.style === "paper"
                        ? 13 * (state.settings.scale / 100)
                        : 0),
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
            onEdit={beginEdit}
            editor={
              draft && (
                <StickyEditor
                  value={draft.text}
                  caret={draft.caret}
                  focused={draft.focused}
                  saving={draft.saving}
                  maxHeight={maxHeight}
                  scale={state.settings.scale / 100}
                  onChange={(text) => {
                    draftRef.current = draftRef.current && {
                      ...draftRef.current,
                      text,
                    };
                    setDraft(draftRef.current);
                  }}
                  onSave={() => void saveEdit()}
                  onCancel={finishEdit}
                  onActivate={refocusEdit}
                />
              )
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
