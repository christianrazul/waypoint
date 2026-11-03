import { expect, it } from "vitest";
import type { Annotation, Position, ShapeAnnotation } from "../shared/types";
import {
  annotationOutline,
  arrowHead,
  constrainEndpoint,
  hitTestSweep,
} from "./geometry";

it.each(["rectangle", "ellipse"] as const)(
  "constrains %s in all four drag directions",
  (type) => {
    for (const [x, y] of [
      [20, 40],
      [-20, 40],
      [20, -40],
      [-20, -40],
    ] as Position[]) {
      const [sx, sy] = constrainEndpoint(
        type,
        [10, 10],
        [10 + x, 10 + y],
        true,
      );
      expect(Math.abs(sx - 10)).toBe(Math.abs(sy - 10));
      expect(Math.sign(sx - 10)).toBe(Math.sign(x));
      expect(Math.sign(sy - 10)).toBe(Math.sign(y));
    }
  },
);
it("snaps arrows to 45 degree steps without changing their length", () => {
  const end = constrainEndpoint("arrow", [10, 10], [70, 50], true);
  expect(end[0] - 10).toBeCloseTo(end[1] - 10);
  expect(Math.hypot(end[0] - 10, end[1] - 10)).toBeCloseTo(Math.hypot(60, 40));
  expect(constrainEndpoint("arrow", [10, 10], [70, 50], false)).toEqual([
    70, 50,
  ]);
});

const shape = (type: ShapeAnnotation["type"]): ShapeAnnotation => ({
  id: type,
  type,
  color: "#F0509A",
  size: 5,
  from: [20, 20],
  to: [120, 100],
});
const hit = (object: Annotation, from: Position, to = from) =>
  hitTestSweep(object, annotationOutline(object), from, to);

it.each(["rectangle", "ellipse"] as const)(
  "erases the %s outline but leaves its empty interior alone",
  (type) => {
    const object = shape(type);
    expect(hit(object, [70, 60])).toBe(false);
    expect(hit(object, [70, 0], [70, 120])).toBe(true);
    expect(hit(object, [200, 200], [300, 300])).toBe(false);
  },
);
it("hit-tests the arrowhead as well as the shaft", () => {
  const object = shape("arrow");
  expect(hit(object, [70, 60])).toBe(true);
  const [tip] = arrowHead(object);
  expect(hit(object, tip)).toBe(true);
});
it("detects fast eraser sweeps across text even if both samples are outside", () => {
  const text: Annotation = {
    id: "text",
    type: "text",
    color: "#4FA3F7",
    size: 5,
    position: [50, 50],
    text: "Hello",
    width: 100,
    height: 29,
  };
  expect(hit(text, [0, 65], [200, 65])).toBe(true);
  expect(hit(text, [100, 65])).toBe(true);
  expect(hit(text, [0, 100], [200, 100])).toBe(false);
});
it("handles a pen dot and a pen sweep without false hits far away", () => {
  const pen: Annotation = {
    id: "dot",
    type: "pen",
    color: "#4FA3F7",
    size: 5,
    points: [[80, 80, 0.5]],
    simulatePressure: true,
  };
  expect(hit(pen, [80, 80])).toBe(true);
  expect(hit(pen, [0, 80], [160, 80])).toBe(true);
  expect(hit(pen, [0, 0])).toBe(false);
});
