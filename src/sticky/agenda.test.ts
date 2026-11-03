import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import seed from "../shared/seed-agenda.json";
import type { AgendaState } from "../shared/types";
import { Sticky } from "./Sticky";
import {
  allChecked,
  currentSection,
  inlineSegments,
  nextSectionHint,
} from "./agenda";

const fresh = () => structuredClone(seed) as AgendaState;
const render = (state: AgendaState) =>
  renderToStaticMarkup(
    createElement(Sticky, {
      state,
      busy: new Set<string>(),
      error: null,
      onDone: () => {},
      onNavigate: () => {},
    }),
  );

it("shows the seed section, progress, detail, optional item, and next hint", () => {
  const state = fresh();
  expect(currentSection(state)?.title).toBe("Architecture overview");
  const html = render(state);
  expect(html).toContain("Step 3 / 5");
  expect(html).toContain("0 of 3 items checked");
  expect(html).toContain("Point at the gateway box");
  expect(html).toContain("Optional: ");
  expect(nextSectionHint(state)).toBe("Next: Live demo");
});
it("shows completion only for nonempty checked sections and hides checked details", () => {
  const state = fresh();
  const section = state.agenda.sections[2];
  section.items.forEach((item) => {
    item.done = true;
  });
  const html = render(state);
  expect(allChecked(section)).toBe(true);
  expect(html).toContain("All checked");
  expect(html).toContain('class="complete"');
  expect(html).toContain("3 of 3 items checked");
  expect(html).not.toContain("Point at the gateway box");
  expect(allChecked(state.agenda.sections[0])).toBe(false);
});
it("hides progress and checklist for sections with no items and disables the first Prev", () => {
  const state = fresh();
  state.agenda.currentIndex = 0;
  const html = render(state);
  expect(html).not.toContain('class="progress"');
  expect(html).not.toContain('type="checkbox"');
  expect(html).not.toContain("All checked");
  expect(html).toMatch(/<button disabled="">← Prev<\/button>/);
});
it("shows Last step and disables Next at the end", () => {
  const state = fresh();
  state.agenda.currentIndex = 4;
  expect(nextSectionHint(state)).toBe("Last step");
  expect(render(state)).toMatch(/class="next-button" disabled="">Next →/);
});
it("keeps header, title, progress and footer when compact hides the checklist", () => {
  const state = fresh();
  state.settings.compact = true;
  const html = render(state);
  expect(html).toContain("Architecture overview");
  expect(html).toContain("YOU ARE HERE");
  expect(html).toContain('class="progress"');
  expect(html).toContain('class="sticky-footer"');
  expect(html).not.toContain('type="checkbox"');
});
it("renders an empty agenda without invalid section counts or enabled navigation", () => {
  const state = fresh();
  state.agenda.sections = [];
  state.agenda.currentIndex = 0;
  const html = render(state);
  expect(html).toContain("Step 0 / 0");
  expect(html).toContain("No agenda sections yet");
  expect(html.match(/disabled=""/g)).toHaveLength(2);
});
it("renders inline code as text safely and keeps unmatched delimiters literal", () => {
  expect(inlineSegments("Explain `auth()` and `rateLimit` now")).toEqual([
    { text: "Explain ", code: false },
    { text: "auth()", code: true },
    { text: " and ", code: false },
    { text: "rateLimit", code: true },
    { text: " now", code: false },
  ]);
  expect(inlineSegments("an `unfinished segment")).toEqual([
    { text: "an `unfinished segment", code: false },
  ]);
  const state = fresh();
  state.agenda.sections[2].items[0].text =
    "Run `<script>alert(1)</script>` safely";
  const html = render(state);
  expect(html).toContain("<code>&lt;script&gt;alert(1)&lt;/script&gt;</code>");
  expect(html).not.toContain("<script>");
});

it("applies opacity only to the fill and keeps Paper solid", () => {
  const state = fresh();
  state.settings.style = "clear";
  state.settings.opacity = 35;
  let html = render(state);
  expect(html).toContain("sticky-clear");
  expect(html).toContain("--sticky-fill:rgba(255,255,255,0.35)");
  expect(html).not.toContain('style="opacity:');
  state.settings.style = "paper";
  state.settings.opacity = 0;
  html = render(state);
  expect(html).toContain("sticky-paper");
  expect(html).toContain("--sticky-fill:#FFE89A");
  expect(html).toContain("Point at the gateway box");
});
