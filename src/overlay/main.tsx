import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { on } from "../shared/ipc";
import { connectDrawingState, useAppStore } from "../shared/store";
import type { PenStroke, Point } from "../shared/types";
import { strokePath } from "./strokes";
import "../shared/tokens.css";

function Overlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useAppStore((state) => state.drawing);

  useEffect(() => {
    const disconnect = connectDrawingState();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const strokes: { stroke: PenStroke; path: Path2D }[] = [];
    let active: { stroke: PenStroke; pointerId: number } | null = null;
    let frame: number | null = null;
    let disposed = false;

    const draw = () => {
      frame = null;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const dpr = window.devicePixelRatio;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const { stroke, path } of strokes) {
        ctx.fillStyle = stroke.color;
        ctx.fill(path);
      }
      if (active) {
        ctx.fillStyle = active.stroke.color;
        ctx.fill(strokePath(active.stroke, false));
      }
    };
    const requestDraw = () => {
      if (frame === null) frame = requestAnimationFrame(draw);
    };
    const finish = () => {
      if (!active) return;
      const { stroke, pointerId } = active;
      active = null;
      strokes.push({ stroke, path: strokePath(stroke, true) });
      if (canvas.hasPointerCapture(pointerId))
        canvas.releasePointerCapture(pointerId);
      requestDraw();
    };
    const resize = () => {
      canvas.width = Math.round(window.innerWidth * window.devicePixelRatio);
      canvas.height = Math.round(window.innerHeight * window.devicePixelRatio);
      requestDraw();
    };
    const point = (event: PointerEvent): Point => [
      event.clientX,
      event.clientY,
      event.pressure,
    ];
    const down = (event: PointerEvent) => {
      const { drawing, ready } = useAppStore.getState();
      if (
        !ready ||
        !drawing.armed ||
        event.button !== 0 ||
        !event.isPrimary ||
        active
      )
        return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      active = {
        pointerId: event.pointerId,
        stroke: {
          id: crypto.randomUUID(),
          type: "pen",
          points: [point(event)],
          color: drawing.color,
          size: 5,
          simulatePressure: event.pointerType !== "pen",
        },
      };
      requestDraw();
    };
    const sample = (event: PointerEvent) => {
      if (!active || event.pointerId !== active.pointerId) return;
      const coalesced = event.getCoalescedEvents?.();
      for (const sample of coalesced?.length ? coalesced : [event])
        active.stroke.points.push(point(sample));
      requestDraw();
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== active?.pointerId) return;
      sample(event);
      finish();
    };
    const cancel = (event: PointerEvent) => {
      if (event.pointerId === active?.pointerId) finish();
    };
    const offStore = useAppStore.subscribe((state) => {
      if (!state.drawing.armed) finish();
    });
    const offClear = on("annotations:clear", () => {
      if (disposed) return;
      if (active && canvas.hasPointerCapture(active.pointerId))
        canvas.releasePointerCapture(active.pointerId);
      active = null;
      strokes.length = 0;
      requestDraw();
    });
    void offClear.catch(useAppStore.getState().reportError);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", sample);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener("lostpointercapture", cancel);
    window.addEventListener("blur", finish);
    window.addEventListener("resize", resize);
    let dprQuery: MediaQueryList;
    const watchDpr = () => {
      dprQuery?.removeEventListener("change", watchDpr);
      resize();
      dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dprQuery.addEventListener("change", watchDpr);
    };
    watchDpr();
    return () => {
      disposed = true;
      disconnect();
      offStore();
      void offClear.then((off) => off()).catch(() => {});
      if (frame !== null) cancelAnimationFrame(frame);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", sample);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("blur", finish);
      window.removeEventListener("resize", resize);
      dprQuery.removeEventListener("change", watchDpr);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-label="Screen annotations"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        touchAction: "none",
        cursor: drawing.armed ? "crosshair" : "default",
      }}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
);
