import { Shortcuts } from "./Shortcuts";
import { useShortcuts, formatShortcut } from "../shared/shortcuts";
import { useEffect, useRef, useState } from "react";
import type { AgendaState, Section, StickySettings } from "../shared/types";
import { DraftField } from "./DraftField";
import { draftSavers, flushEdits, saveEdit } from "./editing";

function SectionEditor({ section }: { section: Section }) {
  return (
    <div className="section-editor">
      <DraftField
        id={`title-${section.id}`}
        label="Section title"
        value={section.title}
        onSave={(title) =>
          saveEdit({ type: "renameSection", sectionId: section.id, title })
        }
      />
      <div className="items-heading">
        Checklist <span>{section.items.length} items</span>
      </div>
      {section.items.map((item, index) => (
        <fieldset className="item-editor" key={item.id}>
          <legend>Item {index + 1}</legend>
          <DraftField
            id={`text-${section.id}-${item.id}`}
            label={`Item ${index + 1} text`}
            value={item.text}
            onSave={(text) =>
              saveEdit({
                type: "editItem",
                sectionId: section.id,
                itemId: item.id,
                text,
              })
            }
          />
          <label className="check-control">
            <input
              type="checkbox"
              checked={item.optional}
              onChange={(event) =>
                void saveEdit({
                  type: "editItem",
                  sectionId: section.id,
                  itemId: item.id,
                  optional: event.currentTarget.checked,
                })
              }
            />
            Optional item
          </label>
          <DraftField
            id={`details-${section.id}-${item.id}`}
            label={`Item ${index + 1} details (one per line)`}
            value={item.details.join("\n")}
            multiline
            onSave={(value) =>
              saveEdit({
                type: "editItem",
                sectionId: section.id,
                itemId: item.id,
                details: value.split("\n"),
              })
            }
          />
          <button
            className="text-button danger"
            onClick={() =>
              void saveEdit({
                type: "deleteItem",
                sectionId: section.id,
                itemId: item.id,
              })
            }
          >
            Delete item {index + 1}
          </button>
        </fieldset>
      ))}
      <button
        className="add-button"
        onClick={() =>
          void saveEdit({
            type: "addItem",
            sectionId: section.id,
            id: crypto.randomUUID(),
          })
        }
      >
        + Add checklist item
      </button>
      <p className="field-hint">
        Use backticks for inline code. Text saves when you leave the field.
      </p>
    </div>
  );
}

function Opacity({ settings }: { settings: StickySettings }) {
  const [value, setValue] = useState(settings.opacity);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const dirty = useRef(false);
  const current = useRef(value);
  current.current = value;
  useEffect(() => {
    if (!dirty.current) setValue(settings.opacity);
  }, [settings.opacity, settings.style]);
  useEffect(() => {
    const save = async () => {
      clearTimeout(timer.current);
      if (!dirty.current) return true;
      const opacity = current.current;
      dirty.current = false;
      const success = await saveEdit({ type: "opacity", opacity });
      if (!success && current.current === opacity) dirty.current = true;
      return success;
    };
    draftSavers.set("opacity", save);
    return () => {
      clearTimeout(timer.current);
      draftSavers.delete("opacity");
    };
  }, []);
  return (
    <div className="setup-group">
      <label className="group-label" htmlFor="opacity">
        <span>Opacity</span>
        <output>{settings.style === "paper" ? "Solid" : `${value}%`}</output>
      </label>
      <input
        id="opacity"
        aria-label="Opacity"
        type="range"
        min="0"
        max="100"
        value={value}
        disabled={settings.style === "paper"}
        onChange={(event) => {
          const opacity = Number(event.currentTarget.value);
          setValue(opacity);
          current.current = opacity;
          dirty.current = true;
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            void draftSavers.get("opacity")?.();
          }, 80);
        }}
      />
    </div>
  );
}

export function Setup({
  state,
  error,
  onClose,
}: {
  state: AgendaState;
  error: string | null;
  onClose: () => void;
}) {
  const { snapshot: shortcuts } = useShortcuts();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const sections = state.agenda.sections;
  const move = (sectionId: string, beforeId: string | null) => {
    void saveEdit({ type: "moveSection", sectionId, beforeId });
    setDragged(null);
    setDropTarget(null);
  };
  return (
    <main className="setup-surface">
      <section
        className="setup-panel"
        aria-label="Waypoint sticky setup"
        style={
          { "--setup-accent": state.settings.accent } as React.CSSProperties
        }
      >
        <header className="setup-heading">
          <h1>Sticky setup</h1>
          <button
            className="close-setup"
            aria-label="Close setup"
            title="Close (Esc)"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {error && (
          <div className="setup-error" role="alert">
            {error}
          </div>
        )}
        <div className="setup-group">
          <div className="group-label">
            <h2>Agenda</h2>
            <button
              className="text-button"
              onClick={() => void saveEdit({ type: "resetChecklist" })}
            >
              Reset checklist
            </button>
          </div>
          <ol className="section-list" aria-label="Agenda sections">
            {sections.map((section, index) => (
              <li
                key={section.id}
                className={dropTarget === section.id ? "drop-target" : ""}
                onDragOver={(event) => {
                  if (dragged) {
                    event.preventDefault();
                    setDropTarget(section.id);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragged) move(dragged, section.id);
                }}
              >
                <div
                  className={`section-row ${state.agenda.currentIndex === index ? "current" : ""}`}
                >
                  <span
                    className="section-grip"
                    draggable
                    aria-label={`Drag ${section.title} to reorder`}
                    title="Drag to reorder"
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", section.id);
                      event.dataTransfer.effectAllowed = "move";
                      setDragged(section.id);
                    }}
                    onDragEnd={() => {
                      setDragged(null);
                      setDropTarget(null);
                    }}
                  >
                    ⠿
                  </span>
                  <button
                    className="select-section"
                    aria-current={
                      state.agenda.currentIndex === index ? "step" : undefined
                    }
                    onClick={() =>
                      void saveEdit({
                        type: "selectSection",
                        sectionId: section.id,
                      })
                    }
                  >
                    <span className="section-number">{index + 1}</span>
                    <span className="section-name">{section.title}</span>
                    {state.agenda.currentIndex === index && (
                      <span className="now-tag">NOW</span>
                    )}
                  </button>
                  <button
                    className="row-action"
                    aria-label={`Edit ${section.title}`}
                    aria-expanded={expanded === section.id}
                    onClick={async () => {
                      if (expanded && !(await flushEdits())) return;
                      setExpanded(expanded === section.id ? null : section.id);
                    }}
                  >
                    Edit
                  </button>
                </div>
                {expanded === section.id && (
                  <div className="expanded-section">
                    <div className="section-actions">
                      <button
                        disabled={index === 0}
                        aria-label={`Move ${section.title} up`}
                        onClick={() => move(section.id, sections[index - 1].id)}
                      >
                        Move up
                      </button>
                      <button
                        disabled={index === sections.length - 1}
                        aria-label={`Move ${section.title} down`}
                        onClick={() =>
                          move(section.id, sections[index + 2]?.id ?? null)
                        }
                      >
                        Move down
                      </button>
                      <button
                        className="danger"
                        onClick={() =>
                          void saveEdit({
                            type: "deleteSection",
                            sectionId: section.id,
                          })
                        }
                      >
                        Delete section
                      </button>
                    </div>
                    <SectionEditor section={section} />
                  </div>
                )}
              </li>
            ))}
          </ol>
          <button
            className={`add-button ${dropTarget === "end" ? "drop-target" : ""}`}
            onDragOver={(event) => {
              if (dragged) {
                event.preventDefault();
                setDropTarget("end");
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragged) move(dragged, null);
            }}
            onClick={async () => {
              if (!(await flushEdits())) return;
              const id = crypto.randomUUID();
              if (await saveEdit({ type: "addSection", id })) setExpanded(id);
            }}
          >
            + Add section
          </button>
          {sections.length === 0 && (
            <p className="field-hint">Add a section to start your agenda.</p>
          )}
        </div>
        <div className="setup-group">
          <h2>Background</h2>
          <div className="style-options">
            {(["frosted", "clear", "paper"] as const).map((style) => (
              <button
                key={style}
                className={`style-option preview-${style}`}
                aria-pressed={state.settings.style === style}
                onClick={async () => {
                  if (await flushEdits())
                    await saveEdit({ type: "style", style });
                }}
              >
                {style[0].toUpperCase() + style.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <Opacity settings={state.settings} />
        <div className="setup-group">
          <h2>Text size</h2>
          <div className="text-size-options">
            {[100, 125, 150, 175, 200].map((scale) => (
              <button
                key={scale}
                aria-pressed={state.settings.scale === scale}
                aria-label={`Text size ${scale}%`}
                onClick={() => void saveEdit({ type: "scale", scale })}
              >
                <span style={{ fontSize: 10 + (scale - 100) / 20 }}>A</span>
                {scale}%
              </button>
            ))}
          </div>
          <p className="field-hint">
            Scales the whole sticky so it stays readable on a projector or
            shared screen.
          </p>
        </div>
        <div className="setup-group">
          <h2>Header label</h2>
          <DraftField
            id="sticky-label"
            label="Text above the current section"
            value={state.settings.label}
            onSave={(label) => saveEdit({ type: "label", label })}
          />
          <p className="field-hint">
            Shown at the top of the sticky. Clear it to go back to "YOU ARE
            HERE".
          </p>
        </div>
        <div className="setup-group">
          <h2>Display</h2>
          <div className="position-options">
            {(
              [
                ["primary", "Primary display"],
                ["cursor", "Display at cursor"],
              ] as const
            ).map(([display, label]) => (
              <button
                key={display}
                aria-pressed={state.settings.display === display}
                onClick={() => void saveEdit({ type: "display", display })}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="field-hint">
            Cursor mode chooses a display when controls or a shortcut are
            invoked.
          </p>
        </div>
        <div className="setup-group">
          <h2>Position</h2>
          <div className="position-options">
            {(
              [
                ["tl", "Top left"],
                ["tr", "Top right"],
                ["bl", "Bottom left"],
                ["br", "Bottom right"],
              ] as const
            ).map(([corner, label]) => (
              <button
                key={corner}
                aria-pressed={state.settings.corner === corner}
                onClick={() => void saveEdit({ type: "corner", corner })}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="field-hint">
            Drag the sticky header to place it freely. A preset resets that
            position.
          </p>
        </div>
        <label className="check-control compact-control">
          <input
            type="checkbox"
            checked={state.settings.compact}
            onChange={(event) =>
              void saveEdit({
                type: "compact",
                compact: event.currentTarget.checked,
              })
            }
          />
          <span>
            Compact mode
            <small>Hide checklist items; keep progress and navigation.</small>
          </span>
        </label>
        <Shortcuts />
        <footer className="setup-footer">
          <span>Next section</span>
          <kbd>{formatShortcut(shortcuts.bindings.next)}</kbd>
        </footer>
      </section>
    </main>
  );
}
