import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { on } from "../shared/ipc";
import "../shared/tokens.css";

// M0 spike: proves the overlay can capture the pointer while armed and that strokes survive
// pass-through. Plain polylines; perfect-freehand and vector objects arrive in M1/M2.

type Point = [number, number];

function Overlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const frame = useRef<number | null>(null);
  const [armed, setArmed] = useState(false);
  const [events, setEvents] = useState(0);

  const requestDraw = () => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#F0509A";
      for (const stroke of strokes.current) {
        ctx.beginPath();
        stroke.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.stroke();
      }
    });
  };

  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio;
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      requestDraw();
    };
    resize();
    window.addEventListener("resize", resize);
    const unlisteners = [
      on("overlay:armed", setArmed),
      on("annotations:clear", () => {
        strokes.current = [];
        requestDraw();
      }),
    ];
    return () => {
      window.removeEventListener("resize", resize);
      unlisteners.forEach((p) => p.then((off) => off()));
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    strokes.current.push([[e.clientX, e.clientY]]);
    setEvents((n) => n + 1);
    requestDraw();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const stroke = strokes.current[strokes.current.length - 1];
    const samples = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const s of samples) stroke.push([s.clientX, s.clientY]);
    requestDraw();
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          cursor: armed ? "crosshair" : "default",
          outline: armed ? "3px solid rgba(240,80,154,0.6)" : "none",
          outlineOffset: -3,
        }}
      />
      {armed && (
        <div
          style={{
            position: "fixed",
            left: 16,
            bottom: 16,
            padding: "6px 10px",
            borderRadius: 8,
            background: "rgba(14,16,20,0.85)",
            color: "#fff",
            font: "600 12px var(--wp-font)",
            pointerEvents: "none",
          }}
        >
          Overlay armed: drawing captures the mouse ({events} strokes). ⌃⌥D for pass-through.
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
);
