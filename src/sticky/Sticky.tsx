import { useId, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { AgendaState } from "../shared/types";
import {
  allChecked,
  currentSection,
  inlineSegments,
  nextSectionHint,
} from "./agenda";

export function InlineText({ text }: { text: string }) {
  return (
    <>
      {inlineSegments(text).map((segment, index) =>
        segment.code ? (
          <code key={index}>{segment.text}</code>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

/** Delay before a click on item text toggles it, so a double-click can open the editor. */
const TOGGLE_DELAY = 220;

function ChecklistRow({
  item,
  busy,
  onToggle,
}: {
  item: AgendaState["agenda"]["sections"][number]["items"][number];
  busy: boolean;
  onToggle: (done: boolean) => void;
}) {
  const id = useId();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  return (
    <li>
      <div className={`checklist-row ${item.done ? "done" : ""}`}>
        <input
          type="checkbox"
          aria-labelledby={id}
          checked={item.done}
          disabled={busy}
          onChange={(event) => onToggle(event.currentTarget.checked)}
        />
        <span
          id={id}
          onClick={(event) => {
            clearTimeout(timer.current);
            if (event.detail === 1 && !busy)
              timer.current = setTimeout(
                () => onToggle(!item.done),
                TOGGLE_DELAY,
              );
          }}
        >
          {item.optional && <em>Optional: </em>}
          <InlineText text={item.text} />
        </span>
      </div>
      {!item.done && item.details.length > 0 && (
        <div className="item-details">
          {item.details.map((detail, index) => (
            <div key={index}>
              <InlineText text={detail} />
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

export function Sticky({
  state,
  busy,
  error,
  maxHeight,
  onDone,
  onNavigate,
  onDrag,
  onSetup,
  onEdit,
  editor,
}: {
  state: AgendaState;
  busy: ReadonlySet<string>;
  error: string | null;
  maxHeight?: number;
  onDone: (sectionId: string, itemId: string, done: boolean) => void;
  onNavigate: (direction: "previous" | "next") => void;
  onDrag?: () => void;
  onSetup?: () => void;
  /** Double-click anywhere on the note (except its controls) to edit the agenda inline. */
  onEdit?: () => void;
  /** When set, the sticky is in edit mode and shows this instead of the checklist. */
  editor?: ReactNode;
}) {
  const section = currentSection(state);
  const complete = section ? allChecked(section) : false;
  const style = {
    "--sticky-fill":
      state.settings.style === "paper"
        ? "#FFE89A"
        : state.settings.style === "clear"
          ? `rgba(255,255,255,${state.settings.opacity / 100})`
          : `rgba(30,34,42,${state.settings.opacity / 100})`,
    "--sticky-accent": state.settings.accent,
    maxHeight,
  } as CSSProperties;
  return (
    <section
      className={`sticky sticky-${state.settings.style}${editor ? " editing" : ""}`}
      aria-label="Waypoint agenda"
      style={style}
      onMouseDown={(event) => {
        // Keep double-clicks from selecting words.
        if (!editor && event.detail > 1) event.preventDefault();
      }}
      onDoubleClick={(event) => {
        if (
          editor ||
          (event.target as Element).closest("button, input, .sticky-header")
        )
          return;
        onEdit?.();
      }}
    >
      <header
        className="sticky-header"
        title="Drag to move sticky"
        onMouseDown={(event) => {
          if (event.button === 0) {
            event.preventDefault();
            onDrag?.();
          }
        }}
      >
        <span>{editor ? "EDITING AGENDA" : "YOU ARE HERE"}</span>
        <span>
          {editor
            ? "Markdown"
            : `Step ${section ? state.agenda.currentIndex + 1 : 0} / ${state.agenda.sections.length}`}
        </span>
      </header>
      {editor}
      {!editor && (
        <>
          <div className="sticky-title-row">
            <h1 className={complete ? "complete" : ""}>
              {section?.title ?? "No agenda sections yet"}
            </h1>
            {complete && <span className="all-checked">All checked</span>}
          </div>
          {section && section.items.length > 0 && (
            <div
              className="progress"
              role="img"
              aria-label={`${section.items.filter((item) => item.done).length} of ${section.items.length} items checked`}
            >
              {section.items.map((item) => (
                <span key={item.id} className={item.done ? "done" : ""} />
              ))}
            </div>
          )}
          {section && section.items.length > 0 && !state.settings.compact && (
            <ul className="checklist">
              {section.items.map((item) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  busy={busy.has(item.id)}
                  onToggle={(done) => onDone(section.id, item.id, done)}
                />
              ))}
            </ul>
          )}
          {!section && (
            <p className="empty-agenda">
              {onEdit
                ? "Double-click to write your agenda, or paste an outline."
                : "Add sections and checklist items in setup."}
              {onSetup && (
                <button className="empty-setup" onClick={onSetup}>
                  Open setup
                </button>
              )}
            </p>
          )}
        </>
      )}
      {!editor && (
        <footer className="sticky-footer">
          <button
            onClick={() => onNavigate("previous")}
            disabled={!section || state.agenda.currentIndex === 0}
          >
            ← Prev
          </button>
          <span
            className="next-hint"
            title={section ? nextSectionHint(state) : ""}
          >
            {section ? nextSectionHint(state) : "No sections"}
          </span>
          <button
            className="next-button"
            onClick={() => onNavigate("next")}
            disabled={
              !section ||
              state.agenda.currentIndex >= state.agenda.sections.length - 1
            }
          >
            Next →
          </button>
        </footer>
      )}
      {error && (
        <div className="sticky-error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
