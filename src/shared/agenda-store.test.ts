import { beforeEach, expect, it, vi } from "vitest";
import seed from "./seed-agenda.json";
import type { AgendaState } from "./types";
const ipc = vi.hoisted(() => ({
  getAgendaState: vi.fn(),
  listeners: new Map<string, () => void>(),
  off: vi.fn(),
}));
vi.mock("./ipc", () => ({
  commands: { getAgendaState: ipc.getAgendaState },
  on: vi.fn(async (event: string, handler: () => void) => {
    ipc.listeners.set(event, handler);
    return () => {
      ipc.listeners.delete(event);
      ipc.off();
    };
  }),
}));
import {
  connectAgendaState,
  runAgendaCommand,
  useAgendaStore,
} from "./agenda-store";
const fresh = (revision = 0) =>
  ({ ...structuredClone(seed), revision }) as AgendaState;
beforeEach(() => {
  vi.clearAllMocks();
  ipc.listeners.clear();
  useAgendaStore.setState({ state: null, ready: false, error: null });
});

it("re-reads a change arriving during hydration instead of dropping it", async () => {
  let resolve!: (state: AgendaState) => void;
  const newer = fresh(1);
  newer.settings.enabled = true;
  ipc.getAgendaState
    .mockReturnValueOnce(
      new Promise<AgendaState>((done) => {
        resolve = done;
      }),
    )
    .mockResolvedValue(newer);
  const disconnect = connectAgendaState();
  await vi.waitFor(() => expect(ipc.getAgendaState).toHaveBeenCalledOnce());
  ipc.listeners.get("agenda:changed")!();
  resolve(fresh());
  await vi.waitFor(() =>
    expect(useAgendaStore.getState().state?.revision).toBe(1),
  );
  expect(useAgendaStore.getState().state?.settings.enabled).toBe(true);
  disconnect();
});
it("keeps the newest persisted state if a command response arrives after a newer read", async () => {
  useAgendaStore.getState().apply(fresh(4));
  await runAgendaCommand(async () => fresh(3));
  expect(useAgendaStore.getState().state?.revision).toBe(4);
});
it("refreshes from storage when sticky visibility changes", async () => {
  ipc.getAgendaState.mockResolvedValue(fresh());
  const disconnect = connectAgendaState();
  await vi.waitFor(() => expect(useAgendaStore.getState().ready).toBe(true));
  const shown = fresh(1);
  shown.settings.enabled = true;
  ipc.getAgendaState.mockResolvedValue(shown);
  ipc.listeners.get("sticky:toggle")!();
  await vi.waitFor(() =>
    expect(useAgendaStore.getState().state?.settings.enabled).toBe(true),
  );
  disconnect();
});
it("keeps visible state when persistence fails and reports the error", async () => {
  const previous = fresh(2);
  useAgendaStore.getState().apply(previous);
  await runAgendaCommand(async () => {
    throw new Error("disk full");
  });
  expect(useAgendaStore.getState().state).toEqual(previous);
  expect(useAgendaStore.getState().error).toContain("disk full");
});
it("unsubscribes and ignores a read that resolves after teardown", async () => {
  let resolve!: (state: AgendaState) => void;
  ipc.getAgendaState.mockReturnValue(
    new Promise<AgendaState>((done) => {
      resolve = done;
    }),
  );
  const disconnect = connectAgendaState();
  await vi.waitFor(() => expect(ipc.getAgendaState).toHaveBeenCalled());
  disconnect();
  resolve(fresh());
  await Promise.resolve();
  expect(ipc.off).toHaveBeenCalledTimes(3);
  expect(useAgendaStore.getState().ready).toBe(false);
});
