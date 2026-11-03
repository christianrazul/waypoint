import type { Annotation, ShapeAnnotation } from "../shared/types";
import { arrowHead } from "./geometry";
import { strokePath } from "./strokes";

export const TEXT_SIZE = 22;
export const TEXT_HEIGHT = 29;
export const TEXT_FONT = `600 ${TEXT_SIZE}px Inter, system-ui, sans-serif`;

export function shapePath(object: ShapeAnnotation): Path2D {
  const path = new Path2D();
  const [x1, y1] = object.from,
    [x2, y2] = object.to;
  if (object.type === "arrow") {
    const [left, right] = arrowHead(object);
    path.moveTo(x1, y1);
    path.lineTo(x2, y2);
    path.moveTo(...left);
    path.lineTo(x2, y2);
    path.lineTo(...right);
  } else if (object.type === "rectangle")
    path.rect(
      Math.min(x1, x2),
      Math.min(y1, y2),
      Math.abs(x2 - x1),
      Math.abs(y2 - y1),
    );
  else {
    const rx = Math.abs(x2 - x1) / 2,
      ry = Math.abs(y2 - y1) / 2;
    if (rx && ry)
      path.ellipse((x1 + x2) / 2, (y1 + y2) / 2, rx, ry, 0, 0, Math.PI * 2);
    else {
      path.moveTo(x1, y1);
      path.lineTo(x2, y2);
    }
  }
  return path;
}

export class AnnotationRenderer {
  private paths = new WeakMap<Annotation, Path2D>();
  draw(
    ctx: CanvasRenderingContext2D,
    object: Annotation,
    complete = true,
  ): void {
    ctx.fillStyle = object.color;
    ctx.strokeStyle = object.color;
    ctx.lineWidth = object.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (object.type === "text") {
      ctx.font = TEXT_FONT;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(
        object.text,
        object.position[0],
        object.position[1] + TEXT_SIZE,
      );
      return;
    }
    let path = complete ? this.paths.get(object) : undefined;
    if (!path) {
      path =
        object.type === "pen"
          ? strokePath(object, complete)
          : shapePath(object);
      if (complete) this.paths.set(object, path);
    }
    if (object.type === "pen") ctx.fill(path);
    else ctx.stroke(path);
  }
}
