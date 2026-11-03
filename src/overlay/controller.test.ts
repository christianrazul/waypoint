import { beforeEach, expect, it, vi } from "vitest";
import type { DrawingState } from "../shared/types";
import { DrawingController, type TextDraft } from "./controller";
const ipc = vi.hoisted(() => ({
  beginTextEdit: vi.fn(),
  endTextEdit: vi.fn(),
}));
vi.mock("../shared/ipc", () => ({ commands: ipc }));
const state = (tool: DrawingState["tool"]): DrawingState => ({
  tool,
  armed: true,
  editing: false,
  sampling: false,
  color: "#F0509A",
  revision: 0,
});
const pointer = (x: number, y: number, extra = {}): PointerEvent =>
  ({
    clientX: x,
    clientY: y,
    pointerId: 1,
    isPrimary: true,
    button: 0,
    pressure: 0.5,
    pointerType: "mouse",
    shiftKey: false,
    preventDefault: vi.fn(),
    ...extra,
  }) as unknown as PointerEvent;
let canvas: HTMLCanvasElement;
let editor: TextDraft | null;
let report: ReturnType<typeof vi.fn>;
const make = (tool: DrawingState["tool"]) => {
  const controller = new DrawingController(
    canvas,
    state(tool),
    (draft) => {
      editor = draft;
    },
    report,
  );
  controller.updateState(state(tool), true);
  return controller;
};
beforeEach(() => {
  vi.clearAllMocks();
  editor = null;
  report = vi.fn();
  ipc.beginTextEdit.mockResolvedValue(undefined);
  ipc.endTextEdit.mockResolvedValue(undefined);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("window", {
    innerWidth: 1200,
    innerHeight: 800,
    devicePixelRatio: 2,
  });
  vi.stubGlobal("document", { fonts: { ready: Promise.resolve() } });
  const captures = new Set<number>();
  canvas = {
    getContext: () => ({
      measureText: (text: string) => ({ width: text.length * 12 }),
    }),
    setPointerCapture: (id: number) => captures.add(id),
    hasPointerCapture: (id: number) => captures.has(id),
    releasePointerCapture: (id: number) => captures.delete(id),
  } as unknown as HTMLCanvasElement;
});

it("commits constrained shapes and ignores non-primary or secondary-button gestures", () => {
  const controller = make("rectangle");
  controller.pointerDown(pointer(0, 0, { button: 2 }));
  controller.pointerDown(pointer(0, 0, { isPrimary: false }));
  expect(controller.history.annotations).toHaveLength(0);
  controller.pointerDown(pointer(20, 20));
  controller.pointerUp(pointer(60, 80, { shiftKey: true }));
  expect(controller.history.annotations[0]).toMatchObject({
    type: "rectangle",
    from: [20, 20],
    to: [80, 80],
  });
});
it("groups an eraser drag into a single undo step and catches objects between samples", () => {
  const controller = make("rectangle");
  controller.pointerDown(pointer(20, 20));
  controller.pointerUp(pointer(60, 60));
  controller.pointerDown(pointer(100, 20));
  controller.pointerUp(pointer(140, 60));
  controller.updateState(state("eraser"), true);
  controller.pointerDown(pointer(0, 40));
  controller.pointerMove(pointer(170, 40));
  controller.pointerUp(pointer(180, 40));
  expect(controller.history.annotations).toHaveLength(0);
  controller.undo();
  expect(controller.history.annotations).toHaveLength(2);
  controller.redo();
  expect(controller.history.annotations).toHaveLength(0);
});
it("finalizes an interrupted stroke and makes clearing it undoable", () => {
  const controller = make("pen");
  controller.pointerDown(pointer(20, 20));
  controller.pointerMove(pointer(40, 40));
  controller.clear();
  expect(controller.history.annotations).toHaveLength(0);
  controller.undo();
  expect(controller.history.annotations[0]).toMatchObject({
    type: "pen",
    points: [
      [20, 20, 0.5],
      [40, 40, 0.5],
    ],
  });
});
it("ignores drawing in pass-through and while sampling", () => {
  const controller = make("pen");
  for (const next of [
    { ...state("pen"), armed: false },
    { ...state("pen"), sampling: true },
  ]) {
    controller.updateState(next, true);
    controller.pointerDown(pointer(20, 20));
    controller.pointerUp(pointer(40, 40));
  }
  expect(controller.history.annotations).toHaveLength(0);
});
it("waits for native focus before typing and commits text once before returning focus", async () => {
  const controller = make("text");
  controller.pointerDown(pointer(100, 100));
  expect(editor?.pending).toBe(true);
  await vi.waitFor(() => expect(editor?.pending).toBe(false));
  controller.updateText("Auth happens here");
  controller.commitText();
  controller.commitText();
  expect(controller.history.annotations[0]).toMatchObject({
    type: "text",
    text: "Auth happens here",
    color: "#F0509A",
  });
  await vi.waitFor(() => expect(ipc.endTextEdit).toHaveBeenCalledTimes(1));
  controller.undo();
  expect(controller.history.annotations).toHaveLength(0);
});
it("drops empty text and releases focus when interrupted or unmounted", async () => {
  const controller = make("text");
  controller.pointerDown(pointer(100, 100));
  await vi.waitFor(() => expect(editor?.pending).toBe(false));
  controller.updateState({ ...state("text"), armed: false }, true);
  expect(editor).toBeNull();
  expect(controller.history.annotations).toHaveLength(0);
  controller.dispose();
  await vi.waitFor(() => expect(ipc.endTextEdit).toHaveBeenCalled());
});
it("reports native focus failure and leaves no editable draft", async () => {
  ipc.beginTextEdit.mockRejectedValueOnce(new Error("focus denied"));
  const controller = make("text");
  controller.pointerDown(pointer(100, 100));
  await vi.waitFor(() => expect(report).toHaveBeenCalled());
  expect(editor).toBeNull();
  expect(controller.history.annotations).toHaveLength(0);
  expect(ipc.endTextEdit).toHaveBeenCalled();
});

it("commits once when clicking outside a text draft and keeps its original color", async () => {
  const controller = make("text");
  controller.pointerDown(pointer(100, 100));
  await vi.waitFor(() => expect(editor?.pending).toBe(false));
  controller.updateText("Keep this color");
  controller.updateState(
    { ...state("text"), editing: true, color: "#4FA3F7" },
    true,
  );
  controller.pointerDown(pointer(300, 300));
  expect(editor).toBeNull();
  expect(controller.history.annotations).toHaveLength(1);
  expect(controller.history.annotations[0]).toMatchObject({
    type: "text",
    text: "Keep this color",
    color: "#F0509A",
  });
  await vi.waitFor(() => expect(ipc.endTextEdit).toHaveBeenCalledOnce());
});

it("serializes focus acquisition and release when an editor is interrupted before native focus arrives", async () => {
  let release!: () => void;
  const sequence: string[] = [];
  ipc.beginTextEdit
    .mockImplementationOnce(() => {
      sequence.push("begin first");
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    })
    .mockImplementationOnce(async () => {
      sequence.push("begin second");
    });
  ipc.endTextEdit.mockImplementation(async () => {
    sequence.push("end first");
  });
  const controller = make("text");
  controller.pointerDown(pointer(100, 100));
  await vi.waitFor(() => expect(ipc.beginTextEdit).toHaveBeenCalledOnce());
  controller.commitText();
  controller.pointerDown(pointer(200, 200));
  release();
  await vi.waitFor(() => expect(ipc.beginTextEdit).toHaveBeenCalledTimes(2));
  expect(sequence).toEqual(["begin first", "end first", "begin second"]);
  expect(editor?.position).toEqual([200, 200]);
  expect(editor?.pending).toBe(false);
});
