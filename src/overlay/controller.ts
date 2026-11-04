import type {
  Annotation,
  DrawingState,
  PenStroke,
  Position,
  ShapeAnnotation,
  TextAnnotation,
} from "../shared/types";
import { commands } from "../shared/ipc";
import { annotationOutline, constrainEndpoint, hitTestSweep } from "./geometry";
import { AnnotationHistory, type HistorySnapshot } from "./history";
import { AnnotationRenderer, TEXT_FONT, TEXT_HEIGHT } from "./render";
import type { Highlight, HighlightLayer } from "./highlight";

export interface TextDraft {
  id: string;
  position: Position;
  color: string;
  text: string;
  width: number;
  pending: boolean;
}
type Gesture =
  | { pointerId: number; type: "pen"; object: PenStroke }
  | { pointerId: number; type: "shape"; object: ShapeAnnotation }
  | { pointerId: number; type: "highlight"; trail: Highlight }
  | { pointerId: number; type: "eraser"; last: Position; erased: Set<string> };

export class DrawingController {
  onInputFrame: ((milliseconds: number) => void) | null = null;
  private inputTime: number | null = null;
  private markInput(event: PointerEvent): void {
    if (this.onInputFrame && this.inputTime === null)
      this.inputTime = event.timeStamp || performance.now();
  }
  readonly history = new AnnotationHistory();
  private renderer = new AnnotationRenderer();
  private outlines = new WeakMap<Annotation, Position[]>();
  private gesture: Gesture | null = null;
  private editor: TextDraft | null = null;
  private frame: number | null = null;
  private disposed = false;
  private focusTask: Promise<void> = Promise.resolve();
  private drawing: DrawingState;
  private ready = false;
  private ctx: CanvasRenderingContext2D;

  constructor(
    private canvas: HTMLCanvasElement,
    drawing: DrawingState,
    private onEditor: (editor: TextDraft | null) => void,
    private onError: (error: unknown) => void,
    private highlights: HighlightLayer | null = null,
  ) {
    this.drawing = drawing;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas rendering is unavailable");
    this.ctx = ctx;
  }

  updateState(drawing: DrawingState, ready: boolean): void {
    const previous = this.drawing;
    this.drawing = drawing;
    this.ready = ready;
    if (
      !drawing.armed ||
      drawing.sampling ||
      drawing.tool !== previous.tool ||
      (drawing.tool === "highlighter" && !drawing.highlighting)
    )
      this.finishGesture();
    if (
      this.editor &&
      (!drawing.armed ||
        drawing.sampling ||
        drawing.tool !== "text" ||
        (!drawing.editing && !this.editor.pending))
    )
      this.commitText();
  }

  resize = (): void => {
    this.canvas.width = Math.round(window.innerWidth * window.devicePixelRatio);
    this.canvas.height = Math.round(
      window.innerHeight * window.devicePixelRatio,
    );
    this.highlights?.resize();
    this.requestDraw();
  };

  restoreSession(snapshot: HistorySnapshot): void {
    this.history.restore(snapshot);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.draw();
  }

  pointerDown = (event: PointerEvent): void => {
    if (
      event.button !== 0 ||
      !event.isPrimary ||
      !this.ready ||
      !this.drawing.armed ||
      this.drawing.sampling
    )
      return;
    // Highlights draw on their own layer, so they never produce an annotation frame to time.
    if (this.drawing.tool !== "highlighter") this.markInput(event);
    event.preventDefault();
    if (this.editor) {
      this.commitText();
      return;
    }
    if (this.gesture) return;
    const position: Position = [event.clientX, event.clientY];
    if (this.drawing.tool === "text") {
      this.startText(position);
      return;
    }
    if (this.drawing.tool === "highlighter") {
      if (!this.drawing.highlighting || !this.highlights) return;
      this.canvas.setPointerCapture(event.pointerId);
      this.gesture = {
        type: "highlight",
        pointerId: event.pointerId,
        trail: this.highlights.start(this.drawing.color, ...position),
      };
      return;
    }
    this.canvas.setPointerCapture(event.pointerId);
    const common = {
      id: crypto.randomUUID(),
      color: this.drawing.color,
      size: 5,
    };
    if (this.drawing.tool === "pen") {
      this.gesture = {
        type: "pen",
        pointerId: event.pointerId,
        object: {
          ...common,
          type: "pen",
          points: [[...position, event.pressure]],
          simulatePressure: event.pointerType !== "pen",
        },
      };
    } else if (this.drawing.tool === "eraser") {
      this.gesture = {
        type: "eraser",
        pointerId: event.pointerId,
        last: position,
        erased: new Set(),
      };
      this.erase(position);
    } else {
      this.gesture = {
        type: "shape",
        pointerId: event.pointerId,
        object: {
          ...common,
          type: this.drawing.tool,
          from: position,
          to: position,
        },
      };
    }
    this.requestDraw();
  };

  pointerMove = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const coalesced = event.getCoalescedEvents?.();
    const samples = coalesced?.length ? coalesced : [event];
    if (gesture.type === "highlight") {
      for (const sample of samples)
        this.highlights?.extend(gesture.trail, sample.clientX, sample.clientY);
      return;
    }
    this.markInput(event);
    for (const sample of samples) {
      const position: Position = [sample.clientX, sample.clientY];
      if (gesture.type === "pen")
        gesture.object.points.push([...position, sample.pressure]);
      else if (gesture.type === "shape")
        gesture.object.to = constrainEndpoint(
          gesture.object.type,
          gesture.object.from,
          position,
          event.shiftKey,
        );
      else this.erase(position);
    }
    this.requestDraw();
  };

  pointerUp = (event: PointerEvent): void => {
    if (this.gesture?.pointerId !== event.pointerId) return;
    this.pointerMove(event);
    this.finishGesture();
  };
  pointerCancel = (event: PointerEvent): void => {
    if (this.gesture?.pointerId === event.pointerId) this.finishGesture();
  };

  finishGesture = (): void => {
    const gesture = this.gesture;
    if (!gesture) return;
    this.gesture = null;
    if (gesture.type === "highlight") this.highlights?.end(gesture.trail);
    else if (gesture.type === "eraser") this.history.remove(gesture.erased);
    else if (
      gesture.type === "pen" ||
      Math.hypot(
        gesture.object.to[0] - gesture.object.from[0],
        gesture.object.to[1] - gesture.object.from[1],
      ) >= 2
    )
      this.history.add(gesture.object);
    if (this.canvas.hasPointerCapture(gesture.pointerId))
      this.canvas.releasePointerCapture(gesture.pointerId);
    this.requestDraw();
  };

  clear = (): void => {
    this.commitText();
    this.finishGesture();
    this.history.clear();
    this.highlights?.clear();
    this.requestDraw();
  };
  undo = (): void => {
    this.commitText();
    this.finishGesture();
    this.history.undo();
    this.requestDraw();
  };
  redo = (): void => {
    this.commitText();
    this.finishGesture();
    this.history.redo();
    this.requestDraw();
  };

  updateText(text: string): void {
    if (!this.editor) return;
    this.ctx.font = TEXT_FONT;
    this.editor = {
      ...this.editor,
      text,
      width: Math.max(36, this.ctx.measureText(text || " ").width + 8),
    };
    this.onEditor(this.editor);
  }

  commitText = (): void => {
    const editor = this.editor;
    if (!editor) return;
    this.editor = null;
    this.onEditor(null);
    if (editor.text.trim()) {
      this.ctx.font = TEXT_FONT;
      const object: TextAnnotation = {
        id: editor.id,
        type: "text",
        position: editor.position,
        text: editor.text,
        color: editor.color,
        size: 5,
        width: this.ctx.measureText(editor.text).width,
        height: TEXT_HEIGHT,
      };
      this.history.add(object);
      this.requestDraw();
    }
    this.focusTask = this.focusTask
      .then(() => commands.endTextEdit())
      .catch(this.onError);
  };

  private startText(position: Position): void {
    const editor: TextDraft = {
      id: crypto.randomUUID(),
      position: [
        Math.max(0, Math.min(position[0], window.innerWidth - 40)),
        Math.max(0, Math.min(position[1], window.innerHeight - TEXT_HEIGHT)),
      ],
      color: this.drawing.color,
      text: "",
      width: 36,
      pending: true,
    };
    this.editor = editor;
    this.onEditor(editor);
    this.focusTask = this.focusTask
      .then(async () => {
        await document.fonts.ready;
        if (this.disposed || this.editor?.id !== editor.id) return;
        await commands.beginTextEdit();
        if (this.editor?.id === editor.id) {
          this.editor = { ...this.editor, pending: false };
          this.onEditor(this.editor);
        }
      })
      .catch(async (error: unknown) => {
        if (this.editor?.id === editor.id) {
          this.editor = null;
          this.onEditor(null);
        }
        this.onError(error);
        await commands.endTextEdit().catch(this.onError);
      });
  }

  private erase(to: Position): void {
    const gesture = this.gesture;
    if (gesture?.type !== "eraser") return;
    for (const object of this.history.annotations) {
      if (gesture.erased.has(object.id)) continue;
      let outline = this.outlines.get(object);
      if (!outline) {
        outline = annotationOutline(object);
        this.outlines.set(object, outline);
      }
      if (hitTestSweep(object, outline, gesture.last, to))
        gesture.erased.add(object.id);
    }
    gesture.last = to;
  }

  requestDraw = (): void => {
    if (!this.disposed && this.frame === null)
      this.frame = requestAnimationFrame(this.draw);
  };
  private draw = (): void => {
    this.frame = null;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const dpr = window.devicePixelRatio;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const object of this.history.annotations) {
      if (
        this.gesture?.type !== "eraser" ||
        !this.gesture.erased.has(object.id)
      )
        this.renderer.draw(this.ctx, object);
    }
    if (this.gesture?.type === "pen" || this.gesture?.type === "shape")
      this.renderer.draw(this.ctx, this.gesture.object, false);
    if (this.inputTime !== null) {
      this.onInputFrame?.(performance.now() - this.inputTime);
      this.inputTime = null;
    }
  };

  dispose(): void {
    this.disposed = true;
    this.editor = null;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.highlights?.dispose();
    this.focusTask = this.focusTask
      .then(() => commands.endTextEdit())
      .catch(this.onError);
  }
}
