import { getStroke } from "perfect-freehand";
import type { PenStroke } from "../shared/types";

export function strokeOutline(
  stroke: PenStroke,
  complete: boolean,
): number[][] {
  const points = stroke.simulatePressure
    ? stroke.points.map(([x, y]) => [x, y])
    : stroke.points;
  return getStroke(points, {
    size: stroke.size,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.25,
    simulatePressure: stroke.simulatePressure,
    start: { cap: true },
    end: { cap: true },
    last: complete,
  });
}

export function strokePath(stroke: PenStroke, complete: boolean): Path2D {
  const outline = strokeOutline(stroke, complete);
  const path = new Path2D();
  if (outline.length === 0) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 0; i < outline.length; i++) {
    const [x, y] = outline[i];
    const [nextX, nextY] = outline[(i + 1) % outline.length];
    path.quadraticCurveTo(x, y, (x + nextX) / 2, (y + nextY) / 2);
  }
  path.closePath();
  return path;
}
