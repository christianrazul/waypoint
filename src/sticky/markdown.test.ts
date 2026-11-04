import { expect, it } from "vitest";
import seed from "../shared/seed-agenda.json";
import type { AgendaState } from "../shared/types";
import { parseAgenda, sectionOffset, serializeAgenda } from "./markdown";

const ids = () => {
  let next = 0;
  return () => `id-${++next}`;
};
const shape = (text: string) =>
  parseAgenda(text, [], ids()).map(({ title, items }) => ({
    title,
    items: items.map(({ text, optional, details, done }) => ({
      text,
      ...(optional && { optional }),
      ...(details.length && { details }),
      ...(done && { done }),
    })),
  }));

it("turns a pasted nested outline into sections, items and details", () => {
  const pasted = `* 1. Switch the Policy Library on for a client
   * Open Atlas → \`Client configuration\` for the test client
      * Verify the \`Policy Management\` switch is off
   * Turn the switch on → verify the success message
   * Optional: turn it off while the author has the Library open
* 2. Open the Policy Library
   * As the author, click \`Policies\`
      * Verify the table shows \`Name\`
      * Verify a deactivated owner shows greyed out
* 3. Upload a policy
   * Error handling:
      * Verify only \`.docx\` / \`.pdf\` are accepted
      * Verify files over 10 MB are refused
   * Note: the server fills in the owner`;
  expect(shape(pasted)).toEqual([
    {
      title: "Switch the Policy Library on for a client",
      items: [
        {
          text: "Open Atlas → `Client configuration` for the test client",
          details: ["Verify the `Policy Management` switch is off"],
        },
        { text: "Turn the switch on → verify the success message" },
        {
          text: "turn it off while the author has the Library open",
          optional: true,
        },
      ],
    },
    {
      title: "Open the Policy Library",
      items: [
        {
          text: "As the author, click `Policies`",
          details: [
            "Verify the table shows `Name`",
            "Verify a deactivated owner shows greyed out",
          ],
        },
      ],
    },
    {
      title: "Upload a policy",
      items: [
        {
          text: "Error handling:",
          details: [
            "Verify only `.docx` / `.pdf` are accepted",
            "Verify files over 10 MB are refused",
          ],
        },
        { text: "Note: the server fills in the owner" },
      ],
    },
  ]);
});

it("reads headings with checkboxes, tabs and plain titled lists", () => {
  expect(
    shape(`## Intro\n- [x] **Say hi**\n\t- wave\n- [ ] Agenda\n\n# Demo`),
  ).toEqual([
    {
      title: "Intro",
      items: [
        { text: "Say hi", details: ["wave"], done: true },
        { text: "Agenda" },
      ],
    },
    { title: "Demo", items: [] },
  ]);
  expect(shape("Groceries\n- milk\n- eggs\nChores\n- dishes")).toEqual([
    { title: "Groceries", items: [{ text: "milk" }, { text: "eggs" }] },
    { title: "Chores", items: [{ text: "dishes" }] },
  ]);
  expect(shape("- one\n- two")).toEqual([
    { title: "Checklist", items: [{ text: "one" }, { text: "two" }] },
  ]);
  expect(shape("  \n")).toEqual([]);
});

it("round-trips the agenda and keeps IDs and checks of unchanged entries", () => {
  const sections = (structuredClone(seed) as AgendaState).agenda.sections;
  sections[2].items[1].done = true;
  const text = serializeAgenda(sections);
  expect(text).toContain("- [x] Explain where auth happens");
  expect(text).toContain("- [ ] Optional: Mention rate limiting");
  expect(parseAgenda(text, sections, ids())).toEqual(sections);

  const edited = parseAgenda(
    text.replace("Explain where auth happens", "Explain auth") +
      "\n\n# Wrap-up",
    sections,
    ids(),
  );
  expect(edited[2].id).toBe("architecture");
  expect(edited[2].items.map((item) => item.id)).toEqual([
    "request-path",
    "id-1",
    "rate-limiting",
  ]);
  expect(edited[5]).toEqual({ id: "id-2", title: "Wrap-up", items: [] });
  expect(text.slice(sectionOffset(sections, 2))).toMatch(
    /^# Architecture overview/,
  );
});
