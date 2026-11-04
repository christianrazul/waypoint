import type { AgendaItem, Section } from "../shared/types";

/**
 * Plain-text form of the agenda used by the sticky's inline editor. Accepts both the format
 * `serializeAgenda` writes (`# Section`, `- [ ] item`, indented details) and pasted outlines
 * where nesting alone says what is a section, an item or a detail:
 *
 *   * 1. Section
 *      * Item
 *         * Detail
 */
export function serializeAgenda(sections: readonly Section[]): string {
  return sections
    .map((section) =>
      [
        `# ${section.title}`,
        ...section.items.flatMap((item) => [
          `- [${item.done ? "x" : " "}] ${item.optional ? "Optional: " : ""}${item.text}`,
          ...item.details.map((detail) => `  - ${detail}`),
        ]),
      ].join("\n"),
    )
    .join("\n\n");
}

interface Line {
  indent: number;
  text: string;
  heading: boolean;
  bullet: boolean;
  checked: boolean | null;
}

const BULLET = /^(?:[-*+•▪◦]|\d+[.)])\s+/;
const NUMBER = /^\d+[.)]\s+/;
const CHECKBOX = /^\[([ xX])\]\s*/;
const OPTIONAL = /^(?:optional\s*:|\(optional\))\s*/i;

function readLine(raw: string): Line | null {
  const expanded = raw.replace(/\t/g, "    ");
  const text = expanded.trim();
  if (!text) return null;
  const indent = expanded.length - expanded.trimStart().length;
  const heading = /^#{1,6}\s+/.exec(text);
  if (heading)
    return {
      indent,
      text: text.slice(heading[0].length).trim(),
      heading: true,
      bullet: false,
      checked: null,
    };
  const bullet = BULLET.exec(text);
  let rest = bullet ? text.slice(bullet[0].length) : text;
  const box = CHECKBOX.exec(rest);
  if (box) rest = rest.slice(box[0].length);
  return {
    indent,
    text: rest.trim(),
    heading: false,
    bullet: Boolean(bullet || box),
    checked: box ? box[1] !== " " : null,
  };
}

const clean = (text: string) =>
  text.replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => a ?? b).trim();

/** Parses editor text into sections, reusing IDs of matching sections and items in `previous`. */
export function parseAgenda(
  source: string,
  previous: readonly Section[] = [],
  newId: () => string = () => crypto.randomUUID(),
): Section[] {
  const lines = source
    .split(/\r?\n/)
    .map(readLine)
    .filter((l) => l !== null);
  // Nesting depth from indentation: each deeper indent opens a level, a shallower one closes
  // back to the matching level (or the nearest shallower one for ragged pastes).
  const stack: number[] = [];
  const depths = lines.map((line) => {
    if (line.heading) {
      stack.length = 0;
      return -1;
    }
    while (stack.length && stack[stack.length - 1] > line.indent) stack.pop();
    if (!stack.length || stack[stack.length - 1] < line.indent)
      stack.push(line.indent);
    return stack.length - 1;
  });
  const headings = lines.some((line) => line.heading);
  const nested = depths.some((depth) => depth > 0);

  const sections: Section[] = [];
  let item: AgendaItem | null = null;
  let itemDepth = 0;
  const section = () => {
    if (!sections.length)
      sections.push({ id: "", title: "Checklist", items: [] });
    return sections[sections.length - 1];
  };
  lines.forEach((line, index) => {
    const depth = depths[index];
    const isSection =
      line.heading || (!headings && depth === 0 && (!line.bullet || nested));
    if (isSection) {
      const title = clean(line.text.replace(NUMBER, ""));
      if (title) sections.push({ id: "", title, items: [] });
      item = null;
      return;
    }
    const itemLevel = headings ? 0 : nested ? 1 : 0;
    if (item && depth > itemDepth) {
      const detail = clean(line.text);
      if (detail) item.details.push(detail);
      return;
    }
    let text = clean(line.text);
    const optional = OPTIONAL.test(text);
    if (optional) text = text.replace(OPTIONAL, "").trim();
    if (!text) return;
    item = {
      id: "",
      text,
      optional,
      details: [],
      done: line.checked ?? false,
    };
    itemDepth = Math.max(depth, itemLevel);
    section().items.push(item);
  });

  const usedSections = new Set<string>();
  for (const next of sections) {
    const match = previous.find(
      (old) => old.title === next.title && !usedSections.has(old.id),
    );
    next.id = match?.id ?? newId();
    usedSections.add(next.id);
    const usedItems = new Set<string>();
    for (const nextItem of next.items) {
      const old = match?.items.find(
        (old) => old.text === nextItem.text && !usedItems.has(old.id),
      );
      nextItem.id = old?.id ?? newId();
      usedItems.add(nextItem.id);
    }
  }
  return sections;
}

/** Character offset of the `index`-th section heading in `serializeAgenda` output. */
export function sectionOffset(sections: readonly Section[], index: number) {
  return serializeAgenda(sections.slice(0, index)).length + (index > 0 ? 2 : 0);
}
