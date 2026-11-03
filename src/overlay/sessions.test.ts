import { expect, it, vi } from "vitest";
import { AnnotationHistory, type HistorySnapshot } from "./history";
import { OverlaySessions } from "./sessions";

const empty = (): HistorySnapshot => ({ objects: [], past: [], future: [] });
function drawing(id: string): HistorySnapshot {
  const history = new AnnotationHistory();
  history.add({ id, type: "rectangle", color: "#F0509A", size: 5, from: [0, 0], to: [20, 20] });
  return history.snapshot();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function setup() {
  let current = empty();
  const surface = {
    finish: vi.fn(),
    snapshot: () => current,
    restore: vi.fn((snapshot: HistorySnapshot) => { current = snapshot; }),
    ready: vi.fn(),
    error: vi.fn(),
  };
  const transport = {
    get: vi.fn(async () => ({ generation: 1, snapshot: null as HistorySnapshot | null })),
    save: vi.fn(async (_generation: number, _snapshot: HistorySnapshot) => {}),
    ready: vi.fn(async (_generation: number) => true),
  };
  const sessions = new OverlaySessions(transport, surface);
  return { sessions, surface, transport, edit: (snapshot: HistorySnapshot) => { current = snapshot; } };
}

it("saves the departing Space before restoring another, including redo history", async () => {
  const { sessions, surface, transport, edit } = setup();
  await sessions.refresh();
  const history = new AnnotationHistory();
  history.restore(drawing("a"));
  history.undo();
  const a = history.snapshot();
  edit(a);
  transport.get.mockResolvedValue({ generation: 2, snapshot: null });
  await sessions.refresh();
  expect(transport.save).toHaveBeenLastCalledWith(1, a);
  expect(surface.restore).toHaveBeenLastCalledWith(empty());
  transport.get.mockResolvedValue({ generation: 3, snapshot: a });
  await sessions.refresh();
  expect(surface.restore).toHaveBeenLastCalledWith(a);
  expect(a.future).toHaveLength(1);
  expect(surface.ready).toHaveBeenLastCalledWith(true);
});

it("ignores a stale hydration response during rapid Space switches", async () => {
  const { sessions, surface, transport } = setup();
  await sessions.refresh();
  surface.restore.mockClear();
  const b = deferred<{ generation: number; snapshot: HistorySnapshot }>();
  transport.get.mockReturnValueOnce(b.promise);
  const first = sessions.refresh();
  await vi.waitFor(() => expect(transport.get).toHaveBeenCalledTimes(2));
  const c = drawing("c");
  transport.get.mockResolvedValue({ generation: 3, snapshot: c });
  await sessions.refresh();
  b.resolve({ generation: 2, snapshot: drawing("b") });
  await first;
  expect(surface.restore).toHaveBeenCalledExactlyOnceWith(c);
  expect(transport.ready).not.toHaveBeenCalledWith(2);
});

it("keeps input paused when saving the departing history fails", async () => {
  const { sessions, surface, transport } = setup();
  await sessions.refresh();
  transport.save.mockRejectedValueOnce(new Error("save failed"));
  await sessions.refresh();
  expect(transport.get).toHaveBeenCalledTimes(1);
  expect(surface.ready).toHaveBeenLastCalledWith(false);
  expect(surface.error).toHaveBeenCalledOnce();
});

it("does not enable an obsolete session after its readiness reply arrives late", async () => {
  const { sessions, surface, transport } = setup();
  await sessions.refresh();
  const b = deferred<boolean>();
  transport.get.mockResolvedValueOnce({ generation: 2, snapshot: drawing("b") });
  transport.ready.mockReturnValueOnce(b.promise);
  const first = sessions.refresh();
  await vi.waitFor(() => expect(transport.ready).toHaveBeenCalledWith(2));
  transport.get.mockResolvedValue({ generation: 3, snapshot: drawing("c") });
  await sessions.refresh();
  surface.ready.mockClear();
  b.resolve(true);
  await first;
  expect(surface.ready).not.toHaveBeenCalled();
});

it("captures each save's generation and serializes writes before loading another Space", async () => {
  const { sessions, surface, transport, edit } = setup();
  await sessions.refresh();
  const pending = deferred<void>();
  transport.save.mockReturnValueOnce(pending.promise);
  const a = drawing("a");
  edit(a);
  const save = sessions.save();
  const newer = drawing("newer-a");
  edit(newer);
  transport.get.mockResolvedValue({ generation: 2, snapshot: null });
  const refresh = sessions.refresh();
  await vi.waitFor(() => expect(transport.save).toHaveBeenCalledTimes(1));
  expect(transport.save).toHaveBeenCalledWith(1, a);
  expect(transport.get).toHaveBeenCalledTimes(1);
  pending.resolve();
  await Promise.all([save, refresh]);
  expect(transport.save).toHaveBeenLastCalledWith(1, newer);
  expect(surface.restore).toHaveBeenLastCalledWith(empty());
});

it("ignores hydration after the overlay is disposed", async () => {
  const { sessions, surface, transport } = setup();
  const pending = deferred<{ generation: number; snapshot: HistorySnapshot }>();
  transport.get.mockReturnValue(pending.promise);
  const refresh = sessions.refresh();
  await vi.waitFor(() => expect(transport.get).toHaveBeenCalledOnce());
  sessions.dispose();
  pending.resolve({ generation: 1, snapshot: drawing("a") });
  await refresh;
  expect(surface.restore).not.toHaveBeenCalled();
  expect(transport.ready).not.toHaveBeenCalled();
});
