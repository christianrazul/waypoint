import type { AgendaState, Section } from "../shared/types";

export function currentSection(state: AgendaState): Section | null {
  return state.agenda.sections[state.agenda.currentIndex] ?? null;
}
export function allChecked(section: Section): boolean {
  return section.items.length > 0 && section.items.every((item) => item.done);
}
export function nextSectionHint(state: AgendaState): string {
  const next = state.agenda.sections[state.agenda.currentIndex + 1];
  return next ? `Next: ${next.title}` : "Last step";
}

export function inlineSegments(
  text: string,
): { text: string; code: boolean }[] {
  const segments: { text: string; code: boolean }[] = [];
  let start = 0;
  while (start < text.length) {
    const opening = text.indexOf("`", start);
    if (opening < 0) {
      segments.push({ text: text.slice(start), code: false });
      break;
    }
    const closing = text.indexOf("`", opening + 1);
    if (closing < 0) {
      segments.push({ text: text.slice(start), code: false });
      break;
    }
    if (opening > start)
      segments.push({ text: text.slice(start, opening), code: false });
    if (closing > opening + 1)
      segments.push({ text: text.slice(opening + 1, closing), code: true });
    else segments.push({ text: "``", code: false });
    start = closing + 1;
  }
  return segments;
}
