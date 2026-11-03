import type { CSSProperties } from "react";
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

export function Sticky({
  state,
  busy,
  error,
  maxHeight,
  onDone,
  onNavigate,
}: {
  state: AgendaState;
  busy: ReadonlySet<string>;
  error: string | null;
  maxHeight?: number;
  onDone: (sectionId: string, itemId: string, done: boolean) => void;
  onNavigate: (direction: "previous" | "next") => void;
}) {
  const section = currentSection(state);
  const complete = section ? allChecked(section) : false;
  const style = {
    "--sticky-fill": `rgba(30,34,42,${state.settings.opacity / 100})`,
    "--sticky-accent": state.settings.accent,
    maxHeight,
  } as CSSProperties;
  return (
    <section className="sticky" aria-label="Waypoint agenda" style={style}>
      <header className="sticky-header">
        <span>YOU ARE HERE</span>
        <span>
          Step {section ? state.agenda.currentIndex + 1 : 0} /{" "}
          {state.agenda.sections.length}
        </span>
      </header>
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
            <li key={item.id}>
              <label className={`checklist-row ${item.done ? "done" : ""}`}>
                <input
                  type="checkbox"
                  checked={item.done}
                  disabled={busy.has(item.id)}
                  onChange={(event) =>
                    onDone(section.id, item.id, event.currentTarget.checked)
                  }
                />
                <span>
                  {item.optional && <em>Optional: </em>}
                  <InlineText text={item.text} />
                </span>
              </label>
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
          ))}
        </ul>
      )}
      {!section && (
        <p className="empty-agenda">
          Agenda setup will be available in a later update.
        </p>
      )}
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
      {error && (
        <div className="sticky-error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
