import type { PointerEvent as ReactPointerEvent } from "react";
import { commands } from "../shared/ipc";
import type { ResizeEdges, StickySize } from "../shared/types";

const HANDLES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;
type Handle = (typeof HANDLES)[number];

function edgesOf(handle: Handle): ResizeEdges {
  return {
    left: handle.includes("w"),
    right: handle.includes("e"),
    top: handle.includes("n"),
    bottom: handle.includes("s"),
  };
}

/**
 * Invisible grab zones on the note's edges and corners. Dragging one resizes the note while
 * the opposite edges stay put; double-clicking one returns that dimension to its default.
 */
export function ResizeHandles({
  onResized,
  onError,
}: {
  onResized: (size: StickySize) => void;
  onError: (error: unknown) => void;
}) {
  const start = (event: ReactPointerEvent<HTMLDivElement>, handle: Handle) => {
    if (event.button !== 0) return;
    const target = event.currentTarget;
    const note = target.parentElement?.querySelector<HTMLElement>(".sticky");
    if (!note) return;
    event.preventDefault();
    event.stopPropagation();
    target.setPointerCapture(event.pointerId);
    const edges = edgesOf(handle);
    // Screen coordinates, because the window itself moves when dragging a left or top edge.
    const origin = { x: event.screenX, y: event.screenY };
    let pending: { dx: number; dy: number } | null = null;
    let queued = false;
    let chain: Promise<void> = commands.beginStickyResize(
      note.offsetWidth,
      note.offsetHeight,
    );
    const step = async () => {
      queued = false;
      const delta = pending;
      pending = null;
      if (delta)
        onResized(await commands.resizeStickyTo(edges, delta.dx, delta.dy));
    };
    const move = (moveEvent: PointerEvent) => {
      pending = {
        dx: moveEvent.screenX - origin.x,
        dy: moveEvent.screenY - origin.y,
      };
      // Coalesce moves so at most one resize is waiting behind the one in flight.
      if (!queued) {
        queued = true;
        chain = chain.then(step);
      }
    };
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
      target.removeEventListener("lostpointercapture", end);
      chain
        .then(step)
        .finally(() => commands.endStickyResize())
        .catch(onError);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
    target.addEventListener("lostpointercapture", end);
  };
  const reset = (handle: Handle) => {
    const edges = edgesOf(handle);
    commands
      .resetStickySize(edges.left || edges.right, edges.top || edges.bottom)
      .then(onResized, onError);
  };
  return (
    <>
      {HANDLES.map((handle) => (
        <div
          key={handle}
          className={`sticky-resize sticky-resize-${handle}`}
          aria-hidden="true"
          title="Drag to resize · double-click to reset"
          onPointerDown={(event) => start(event, handle)}
          onDoubleClick={() => reset(handle)}
        />
      ))}
    </>
  );
}
