import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { on } from "../shared/ipc";
import { connectDrawingState, useAppStore } from "../shared/store";
import { DrawingController, type TextDraft } from "./controller";
import { TEXT_FONT, TEXT_HEIGHT } from "./render";
import "../shared/tokens.css";

function Overlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<DrawingController | null>(null);
  const [editor, setEditor] = useState<TextDraft | null>(null);
  const drawing = useAppStore((state) => state.drawing);
  const error = useAppStore((state) => state.error);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const controller = new DrawingController(
      canvas,
      useAppStore.getState().drawing,
      setEditor,
      useAppStore.getState().reportError,
    );
    controllerRef.current = controller;
    const disconnect = connectDrawingState();
    const offStore = useAppStore.subscribe((state) =>
      controller.updateState(state.drawing, state.ready),
    );
    controller.updateState(
      useAppStore.getState().drawing,
      useAppStore.getState().ready,
    );
    const listeners = [
      on("annotations:clear", controller.clear),
      on("annotations:undo", controller.undo),
      on("annotations:redo", controller.redo),
      on("text:commit", controller.commitText),
    ];
    listeners.forEach(
      (listener) => void listener.catch(useAppStore.getState().reportError),
    );
    canvas.addEventListener("pointerdown", controller.pointerDown);
    canvas.addEventListener("pointermove", controller.pointerMove);
    canvas.addEventListener("pointerup", controller.pointerUp);
    canvas.addEventListener("pointercancel", controller.pointerCancel);
    canvas.addEventListener("lostpointercapture", controller.pointerCancel);
    window.addEventListener("resize", controller.resize);
    window.addEventListener("blur", controller.finishGesture);
    window.addEventListener("blur", controller.commitText);
    let query: MediaQueryList;
    const watchDpr = () => {
      query?.removeEventListener("change", watchDpr);
      controller.resize();
      query = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      query.addEventListener("change", watchDpr);
    };
    watchDpr();
    return () => {
      disconnect();
      offStore();
      controller.dispose();
      controllerRef.current = null;
      listeners.forEach(
        (listener) => void listener.then((off) => off()).catch(() => {}),
      );
      canvas.removeEventListener("pointerdown", controller.pointerDown);
      canvas.removeEventListener("pointermove", controller.pointerMove);
      canvas.removeEventListener("pointerup", controller.pointerUp);
      canvas.removeEventListener("pointercancel", controller.pointerCancel);
      canvas.removeEventListener(
        "lostpointercapture",
        controller.pointerCancel,
      );
      window.removeEventListener("resize", controller.resize);
      window.removeEventListener("blur", controller.finishGesture);
      window.removeEventListener("blur", controller.commitText);
      query.removeEventListener("change", watchDpr);
    };
  }, []);

  useEffect(() => {
    if (editor && !editor.pending) inputRef.current?.focus();
  }, [editor?.id, editor?.pending]);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-label="Screen annotations"
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          touchAction: "none",
          cursor: !drawing.armed
            ? "default"
            : drawing.tool === "text"
              ? "text"
              : "crosshair",
        }}
      />
      {editor && (
        <input
          ref={inputRef}
          aria-label="Annotation text"
          value={editor.text}
          disabled={editor.pending}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) =>
            controllerRef.current?.updateText(event.currentTarget.value)
          }
          onBlur={() => {
            if (!editor.pending) controllerRef.current?.commitText();
          }}
          onKeyDown={(event) => {
            if (
              !event.nativeEvent.isComposing &&
              (event.key === "Enter" || event.key === "Escape")
            ) {
              event.preventDefault();
              event.stopPropagation();
              controllerRef.current?.commitText();
            }
          }}
          style={{
            position: "fixed",
            left: editor.position[0],
            top: editor.position[1],
            width: editor.width,
            maxWidth: `calc(100vw - ${editor.position[0]}px)`,
            boxSizing: "border-box",
            height: TEXT_HEIGHT,
            padding: 0,
            border: 0,
            borderRadius: 0,
            outline: `1px dashed ${editor.color}`,
            outlineOffset: 3,
            background: "transparent",
            color: editor.color,
            font: TEXT_FONT,
            lineHeight: `${TEXT_HEIGHT}px`,
            caretColor: editor.color,
            userSelect: "text",
          }}
        />
      )}
      {error && (
        <div
          role="alert"
          style={{
            position: "fixed",
            bottom: 12,
            left: 12,
            padding: "6px 10px",
            borderRadius: 6,
            background: "#0e1014",
            color: "#ffd25a",
            fontSize: 12,
            pointerEvents: "none",
          }}
        >
          {error}
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
