import type {
  Annotation,
  Position,
  ShapeAnnotation,
  ShapeTool,
} from "../shared/types";
import { strokeOutline } from "./strokes";

export function constrainEndpoint(
  tool: ShapeTool,
  from: Position,
  to: Position,
  shift: boolean,
): Position {
  if (!shift) return to;
  const dx = to[0] - from[0],
    dy = to[1] - from[1];
  if (tool === "arrow") {
    const angle =
      (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI) / 4;
    const length = Math.hypot(dx, dy);
    return [
      from[0] + Math.cos(angle) * length,
      from[1] + Math.sin(angle) * length,
    ];
  }
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return [from[0] + (dx < 0 ? -size : size), from[1] + (dy < 0 ? -size : size)];
}

export function arrowHead({
  from,
  to,
  size,
}: ShapeAnnotation): [Position, Position] {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const length = Math.min(
    size * 3,
    Math.hypot(to[0] - from[0], to[1] - from[1]) * 0.6,
  );
  return [-Math.PI / 6, Math.PI / 6].map(
    (offset) =>
      [
        to[0] - length * Math.cos(angle + offset),
        to[1] - length * Math.sin(angle + offset),
      ] as Position,
  ) as [Position, Position];
}

export function distanceToSegment(
  point: Position,
  from: Position,
  to: Position,
): number {
  const dx = to[0] - from[0],
    dy = to[1] - from[1];
  const length2 = dx * dx + dy * dy;
  const t =
    length2 === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point[0] - from[0]) * dx + (point[1] - from[1]) * dy) / length2,
          ),
        );
  return Math.hypot(point[0] - from[0] - t * dx, point[1] - from[1] - t * dy);
}

function cross(a: Position, b: Position, c: Position): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
function segmentDistance(
  a: Position,
  b: Position,
  c: Position,
  d: Position,
): number {
  if (
    cross(a, b, c) * cross(a, b, d) < 0 &&
    cross(c, d, a) * cross(c, d, b) < 0
  )
    return 0;
  return Math.min(
    distanceToSegment(a, c, d),
    distanceToSegment(b, c, d),
    distanceToSegment(c, a, b),
    distanceToSegment(d, a, b),
  );
}
function inside(point: Position, polygon: Position[]): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
}

export function annotationOutline(object: Annotation): Position[] {
  if (object.type === "pen") return strokeOutline(object, true) as Position[];
  if (object.type === "text") {
    const [x, y] = object.position;
    return [
      [x, y],
      [x + object.width, y],
      [x + object.width, y + object.height],
      [x, y + object.height],
      [x, y],
    ];
  }
  const [x1, y1] = object.from,
    [x2, y2] = object.to;
  if (object.type === "arrow") {
    const [left, right] = arrowHead(object);
    return [object.from, object.to, left, object.to, right];
  }
  if (object.type === "rectangle")
    return [
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
      [x1, y1],
    ];
  const rx = Math.abs(x2 - x1) / 2,
    ry = Math.abs(y2 - y1) / 2;
  return Array.from({ length: 129 }, (_, i) => {
    const angle = (i / 128) * Math.PI * 2;
    return [
      (x1 + x2) / 2 + Math.cos(angle) * rx,
      (y1 + y2) / 2 + Math.sin(angle) * ry,
    ];
  });
}

export function hitTestSweep(
  object: Annotation,
  outline: Position[],
  from: Position,
  to: Position,
  tolerance = 6,
): boolean {
  if (
    (object.type === "pen" || object.type === "text") &&
    (inside(from, outline) || inside(to, outline))
  )
    return true;
  const radius =
    tolerance +
    (object.type === "pen" || object.type === "text" ? 0 : object.size / 2);
  for (let i = 1; i < outline.length; i++) {
    if (segmentDistance(from, to, outline[i - 1], outline[i]) <= radius)
      return true;
  }
  if (object.type === "pen" && outline.length > 1)
    return (
      segmentDistance(from, to, outline[outline.length - 1], outline[0]) <=
      radius
    );
  return false;
}
