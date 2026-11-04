import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { KeyboardEvent } from "react";
import { parseAgenda } from "./markdown";

const MARKER =
  /^(\s*)(?:(#{1,6})\s+|((?:[-*+]|(\d+)([.)]))\s+)(\[[ xX]\]\s+)?)?/;
const INDENT = "  ";

/** Replaces text through the browser's editing pipeline so Cmd+Z keeps working. */
function replace(
  area: HTMLTextAreaElement,
  start: number,
  end: number,
  text: string,
  caret: [number, number] = [start + text.length, start + text.length],
) {
  area.focus();
  area.setSelectionRange(start, end);
  if (!document.execCommand("insertText", false, text)) {
    area.setRangeText(text, start, end, "end");
    area.dispatchEvent(new Event("input", { bubbles: true }));
  }
  area.setSelectionRange(...caret);
}

function lineStart(value: string, index: number) {
  return value.lastIndexOf("\n", index - 1) + 1;
}
function lineEnd(value: string, index: number) {
  const end = value.indexOf("\n", index);
  return end < 0 ? value.length : end;
}

/** Notion-style list editing: Enter continues the list, Tab nests, Shift+Tab un-nests. */
export function handleListKey(
  event: KeyboardEvent<HTMLTextAreaElement>,
): boolean {
  const area = event.currentTarget;
  const { value, selectionStart: from, selectionEnd: to } = area;
  if (event.key === "Tab") {
    const start = lineStart(value, from);
    const end = lineEnd(
      value,
      to > from && value[to - 1] === "\n" ? to - 1 : to,
    );
    const lines = value.slice(start, end).split("\n");
    const next = lines.map((line) =>
      event.shiftKey ? line.replace(/^ {1,2}|^\t/, "") : INDENT + line,
    );
    const shift = next[0].length - lines[0].length;
    const total = next.join("\n").length - (end - start);
    replace(area, start, end, next.join("\n"), [
      Math.max(start, from + shift),
      to + total,
    ]);
    return true;
  }
  if (event.key !== "Enter" || event.shiftKey || from !== to) return false;
  const start = lineStart(value, from);
  const line = value.slice(start, lineEnd(value, from));
  const match = MARKER.exec(line)!;
  const [prefix, indent, heading, bullet, number, delimiter, box] = match;
  if (!heading && !bullet) return false;
  const content = line.slice(prefix.length);
  if (bullet && !content.trim() && from >= start + prefix.length) {
    // An empty list line: step out one level, then out of the list.
    const outdented = indent.length
      ? indent.slice(Math.min(INDENT.length, indent.length)) +
        bullet +
        (box ?? "")
      : "";
    replace(area, start, start + line.length, outdented);
    return true;
  }
  if (from < start + prefix.length) return false;
  const marker = heading
    ? "- [ ] "
    : `${number ? `${Number(number) + 1}${delimiter} ` : bullet}${box ? "[ ] " : ""}`;
  replace(area, from, from, `\n${heading ? "" : indent}${marker}`);
  return true;
}

export function StickyEditor({
  value,
  caret,
  focused,
  saving,
  maxHeight,
  scale = 1,
  onChange,
  onSave,
  onCancel,
  onActivate,
}: {
  value: string;
  caret: number;
  focused: boolean;
  saving: boolean;
  maxHeight?: number;
  scale?: number;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onActivate?: () => void;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const summary = useMemo(() => {
    const sections = parseAgenda(value, [], () => "");
    const items = sections.reduce((sum, s) => sum + s.items.length, 0);
    return `${sections.length} step${sections.length === 1 ? "" : "s"} · ${items} item${items === 1 ? "" : "s"}`;
  }, [value]);
  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight + 2}px`;
  }, [value, maxHeight]);
  useEffect(() => {
    const element = area.current;
    if (!focused || !element) return;
    element.focus();
    element.setSelectionRange(caret, caret);
    const line = value.slice(0, caret).split("\n").length - 1;
    const height = parseFloat(getComputedStyle(element).lineHeight) || 19;
    element.scrollTop = Math.max(0, line * height - 8);
    // Only when focus is first granted; later renders keep the user's caret.
  }, [focused]);
  return (
    <div className="sticky-editor">
      <textarea
        ref={area}
        aria-label="Agenda markdown"
        onMouseDown={onActivate}
        spellCheck={false}
        value={value}
        placeholder={
          "# Step title\n- [ ] Checklist item\n  - Detail\n\nOr paste an outline…"
        }
        style={{
          maxHeight: maxHeight
            ? Math.max(120 * scale, maxHeight - 132 * scale)
            : 420 * scale,
        }}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          } else if (
            (event.key === "Enter" && (event.metaKey || event.ctrlKey)) ||
            (event.key === "s" && (event.metaKey || event.ctrlKey))
          ) {
            event.preventDefault();
            onSave();
          } else if (handleListKey(event)) {
            event.preventDefault();
          }
        }}
      />
      <footer className="sticky-footer">
        <button onClick={onCancel} disabled={saving} title="Esc">
          Cancel
        </button>
        <span className="next-hint" title="⌘↵ saves · Esc cancels">
          {summary}
        </span>
        <button
          className="next-button"
          onClick={onSave}
          disabled={saving}
          title="⌘↵"
        >
          Save
        </button>
      </footer>
    </div>
  );
}
