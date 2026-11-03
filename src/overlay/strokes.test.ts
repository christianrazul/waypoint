import { expect, it } from "vitest";
import type { PenStroke } from "../shared/types";
import { strokeOutline } from "./strokes";

const stroke = (simulatePressure: boolean, pressure: number): PenStroke => ({
  id: "test",
  type: "pen",
  color: "#F0509A",
  size: 5,
  simulatePressure,
  points: Array.from({ length: 30 }, (_, i) => [i * 4, 50, pressure]),
});
const height = (outline: number[][]) =>
  Math.max(...outline.map((p) => p[1])) - Math.min(...outline.map((p) => p[1]));

it("renders a click without movement as a visible dot", () => {
  const dot = stroke(true, 0.5);
  dot.points = [[20, 20, 0.5]];
  const outline = strokeOutline(dot, true);
  expect(outline.length).toBeGreaterThan(3);
  expect(height(outline)).toBeGreaterThan(0);
});

it("uses tablet pressure to vary width, while mouse width ignores hardware pressure", () => {
  expect(height(strokeOutline(stroke(false, 0.9), true))).toBeGreaterThan(
    height(strokeOutline(stroke(false, 0.1), true)),
  );
  expect(strokeOutline(stroke(true, 0.9), true)).toEqual(
    strokeOutline(stroke(true, 0.1), true),
  );
});
