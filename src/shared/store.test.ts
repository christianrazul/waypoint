import { beforeEach, expect, it, vi } from "vitest";
import type { DrawingState } from "./types";

const ipc = vi.hoisted(() => ({
  listeners: new Map<string, (state: DrawingState) => void>(),
  getDrawingState: vi.fn(),
  unlisten: vi.fn(),
}));
vi.mock("./ipc", () => ({
  commands: { getDrawingState: ipc.getDrawingState },
  on: vi.fn(async (event: string, handler: (state: DrawingState) => void) => {
    ipc.listeners.set(event, handler);
    return () => {
      ipc.listeners.delete(event);
      ipc.unlisten();
    };
  }),
}));
import { connectDrawingState, useAppStore } from "./store";

const snapshot = (
  revision: number,
  armed: boolean,
  color = "#F0509A",
): DrawingState => ({
  tool: "pen",
  armed,
  editing: false,
  sampling: false,
  color,
  revision,
});

beforeEach(() => {
  ipc.listeners.clear();
  vi.clearAllMocks();
  useAppStore.setState({
    drawing: snapshot(-1, false),
    ready: false,
    error: null,
  });
});

it("keeps an event that arrives before an older hydration response", async () => {
  let resolve!: (state: DrawingState) => void;
  ipc.getDrawingState.mockReturnValue(
    new Promise<DrawingState>((done) => {
      resolve = done;
    }),
  );
  const disconnect = connectDrawingState();
  await vi.waitFor(() => expect(ipc.getDrawingState).toHaveBeenCalled());
  ipc.listeners.get("tool:changed")!(snapshot(2, true));
  resolve(snapshot(0, false));
  await Promise.resolve();
  expect(useAppStore.getState().drawing.armed).toBe(true);
  expect(useAppStore.getState().drawing.revision).toBe(2);
  disconnect();
});

it("does not regress either color or tool state when events arrive out of order", () => {
  useAppStore.getState().apply(snapshot(4, true, "#4FA3F7"));
  useAppStore.getState().apply(snapshot(3, false));
  expect(useAppStore.getState().drawing).toEqual(snapshot(4, true, "#4FA3F7"));
});

it("unsubscribes on teardown and ignores late hydration", async () => {
  let resolve!: (state: DrawingState) => void;
  ipc.getDrawingState.mockReturnValue(
    new Promise<DrawingState>((done) => {
      resolve = done;
    }),
  );
  const disconnect = connectDrawingState();
  await vi.waitFor(() => expect(ipc.getDrawingState).toHaveBeenCalled());
  disconnect();
  resolve(snapshot(5, true));
  await Promise.resolve();
  expect(ipc.unlisten).toHaveBeenCalledTimes(2);
  expect(useAppStore.getState().ready).toBe(false);
});
