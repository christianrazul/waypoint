import { beforeEach, expect, it, vi } from "vitest";
import seed from "../shared/seed-agenda.json";
import type { AgendaState } from "../shared/types";
const ipc = vi.hoisted(() => ({ edit: vi.fn() }));
vi.mock("../shared/ipc", () => ({ commands: { editAgenda: ipc.edit } }));
import { draftSavers, flushEdits, saveEdit } from "./editing";
import { useAgendaStore } from "../shared/agenda-store";
const fresh = (revision: number) =>
  ({ ...structuredClone(seed), revision }) as AgendaState;
beforeEach(() => {
  vi.clearAllMocks();
  draftSavers.clear();
  useAgendaStore.setState({ state: fresh(0), error: null });
});

it("serializes field changes so closing waits for all submitted saves", async () => {
  let resolve!: (state: AgendaState) => void;
  ipc.edit
    .mockReturnValueOnce(
      new Promise<AgendaState>((done) => {
        resolve = done;
      }),
    )
    .mockResolvedValueOnce(fresh(2));
  const first = saveEdit({
    type: "renameSection",
    sectionId: "intro",
    title: "Opening",
  });
  const second = saveEdit({ type: "compact", compact: true });
  await vi.waitFor(() => expect(ipc.edit).toHaveBeenCalledTimes(1));
  const flushing = flushEdits();
  resolve(fresh(1));
  expect(await first).toBe(true);
  expect(await second).toBe(true);
  expect(await flushing).toBe(true);
  expect(ipc.edit).toHaveBeenCalledTimes(2);
  expect(useAgendaStore.getState().state?.revision).toBe(2);
});
it("keeps the saved state on write failure and allows the next change to recover", async () => {
  ipc.edit
    .mockRejectedValueOnce(new Error("disk full"))
    .mockResolvedValueOnce(fresh(1));
  expect(await saveEdit({ type: "compact", compact: true })).toBe(false);
  expect(useAgendaStore.getState().state?.revision).toBe(0);
  expect(useAgendaStore.getState().error).toContain("disk full");
  expect(await saveEdit({ type: "compact", compact: true })).toBe(true);
  expect(useAgendaStore.getState().error).toBeNull();
});
it("flushes drafts before close and refuses to discard a failed draft", async () => {
  const failedDraft = vi.fn(async () => false);
  draftSavers.set("title", failedDraft);
  expect(await flushEdits()).toBe(false);
  expect(failedDraft).toHaveBeenCalledOnce();
  draftSavers.set("title", async () => true);
  expect(await flushEdits()).toBe(true);
});
it("does not replace a newer snapshot with an older save response", async () => {
  useAgendaStore.getState().apply(fresh(9));
  ipc.edit.mockResolvedValue(fresh(8));
  await saveEdit({ type: "resetChecklist" });
  expect(useAgendaStore.getState().state?.revision).toBe(9);
});
