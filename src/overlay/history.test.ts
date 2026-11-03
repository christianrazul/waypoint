import { expect, it } from "vitest";
import type { Annotation } from "../shared/types";
import { AnnotationHistory } from "./history";
const object = (id: string): Annotation => ({
  id,
  type: "rectangle",
  color: "#F0509A",
  size: 5,
  from: [0, 0],
  to: [20, 20],
});

it("restores erased objects at their original stacking positions in one undo", () => {
  const history = new AnnotationHistory();
  ["a", "b", "c", "d"].forEach((id) => history.add(object(id)));
  history.remove(new Set(["a", "c"]));
  expect(history.annotations.map(({ id }) => id)).toEqual(["b", "d"]);
  history.undo();
  expect(history.annotations.map(({ id }) => id)).toEqual(["a", "b", "c", "d"]);
  history.redo();
  expect(history.annotations.map(({ id }) => id)).toEqual(["b", "d"]);
});

it("undoes and redoes clear without losing pen samples, text, or colors", () => {
  const history = new AnnotationHistory();
  const pen: Annotation = {
    id: "pen",
    type: "pen",
    size: 5,
    color: "#4FA3F7",
    points: [
      [1, 2, 0.3],
      [3, 4, 0.8],
    ],
    simulatePressure: false,
  };
  const text: Annotation = {
    id: "text",
    type: "text",
    size: 5,
    color: "#5BE36A",
    text: "Auth happens here",
    position: [20, 30],
    width: 200,
    height: 29,
  };
  history.add(pen);
  history.add(text);
  history.clear();
  expect(history.annotations).toEqual([]);
  history.undo();
  expect(history.annotations).toEqual([pen, text]);
  expect(history.annotations[0]).toBe(pen);
  history.redo();
  expect(history.annotations).toEqual([]);
});

it("drops redo only after a real edit and treats empty actions as no-ops", () => {
  const history = new AnnotationHistory();
  history.add(object("a"));
  history.undo();
  history.clear();
  history.remove(new Set(["missing"]));
  expect(history.canRedo).toBe(true);
  history.add(object("b"));
  expect(history.canRedo).toBe(false);
  history.redo();
  expect(history.annotations.map(({ id }) => id)).toEqual(["b"]);
  history.undo();
  history.undo();
  expect(history.annotations).toEqual([]);
});
