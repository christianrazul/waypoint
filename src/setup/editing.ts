import { commands } from "../shared/ipc";
import { useAgendaStore } from "../shared/agenda-store";
import type { AgendaEdit } from "../shared/types";

let tail: Promise<boolean> = Promise.resolve(true);
export const draftSavers = new Map<string, () => Promise<boolean>>();
export function saveEdit(edit: AgendaEdit): Promise<boolean> {
  const saved = tail.then(async () => {
    try {
      useAgendaStore.getState().apply(await commands.editAgenda(edit));
      return true;
    } catch (error) {
      useAgendaStore.getState().reportError(error);
      return false;
    }
  });
  tail = saved;
  return saved;
}
export async function flushEdits(): Promise<boolean> {
  const results = await Promise.all(
    [...draftSavers.values()].map((save) => save()),
  );
  await tail;
  return results.every(Boolean);
}
