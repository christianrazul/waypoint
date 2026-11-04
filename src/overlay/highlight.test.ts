import { expect, it } from "vitest";
import { trimTrail, type TimedPoint } from "./highlight";

it("keeps a trail that has not started to expire", () => {
  const points: TimedPoint[] = [[0, 0, 100], [10, 0, 200]];
  trimTrail(points, 50);
  expect(points).toEqual([[0, 0, 100], [10, 0, 200]]);
});

it("recedes from where the stroke started, interpolating the new tail", () => {
  const points: TimedPoint[] = [[0, 0, 0], [10, 0, 100], [20, 0, 200], [30, 0, 300]];
  trimTrail(points, 150);
  expect(points).toEqual([[15, 0, 150], [20, 0, 200], [30, 0, 300]]);
});

it("empties a trail once every point has expired", () => {
  const points: TimedPoint[] = [[0, 0, 0], [10, 0, 100]];
  trimTrail(points, 100);
  expect(points).toEqual([]);
});
