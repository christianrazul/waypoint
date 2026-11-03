export function editPreviewAgenda(state, edit) {
  const currentId = state.agenda.sections[state.agenda.currentIndex]?.id;
  const sections = state.agenda.sections;
  const section = sections.find((s) => s.id === edit.sectionId);
  const item = section?.items.find((i) => i.id === edit.itemId);
  const text = (value) => {
    if (!value.trim()) throw new Error("Text cannot be empty");
    return value.trim();
  };
  switch (edit.type) {
    case "addSection":
      sections.push({ id: edit.id, title: "New section", items: [] });
      break;
    case "renameSection":
      section.title = text(edit.title);
      break;
    case "deleteSection":
      sections.splice(sections.indexOf(section), 1);
      break;
    case "moveSection": {
      if (edit.beforeId === edit.sectionId) break;
      sections.splice(sections.indexOf(section), 1);
      sections.splice(
        edit.beforeId
          ? sections.findIndex((s) => s.id === edit.beforeId)
          : sections.length,
        0,
        section,
      );
      break;
    }
    case "selectSection":
      state.agenda.currentIndex = sections.indexOf(section);
      return state;
    case "addItem":
      section.items.push({
        id: edit.id,
        text: "New item",
        optional: false,
        details: [],
        done: false,
      });
      break;
    case "editItem":
      if (edit.text !== undefined) item.text = text(edit.text);
      if (edit.optional !== undefined) item.optional = edit.optional;
      if (edit.details !== undefined)
        item.details = edit.details.map((s) => s.trim()).filter(Boolean);
      break;
    case "deleteItem":
      section.items.splice(section.items.indexOf(item), 1);
      break;
    case "resetChecklist":
      for (const s of sections) for (const i of s.items) i.done = false;
      break;
    case "style":
      if (state.settings.style !== edit.style) {
        state.settings.style = edit.style;
        if (edit.style === "clear") state.settings.opacity = 35;
        if (edit.style === "frosted") state.settings.opacity = 72;
      }
      break;
    case "opacity":
      if (state.settings.style !== "paper")
        state.settings.opacity = edit.opacity;
      break;
    case "corner":
      state.settings.corner = edit.corner;
      break;
    case "display":
      state.settings.display = edit.display;
      break;
    case "compact":
      state.settings.compact = edit.compact;
      break;
    default:
      throw new Error("Unknown preview edit");
  }
  const current = sections.findIndex((s) => s.id === currentId);
  state.agenda.currentIndex =
    current < 0
      ? Math.max(0, Math.min(state.agenda.currentIndex, sections.length - 1))
      : current;
  return state;
}
