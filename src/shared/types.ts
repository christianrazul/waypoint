export type Tool =
  | "pen"
  | "arrow"
  | "rectangle"
  | "ellipse"
  | "text"
  | "eraser";
export type ShapeTool = "arrow" | "rectangle" | "ellipse";
export type Position = [x: number, y: number];
export type Point = [x: number, y: number, pressure: number];

export interface DrawingState {
  tool: Tool;
  armed: boolean;
  editing: boolean;
  sampling: boolean;
  color: string;
  revision: number;
}

interface BaseAnnotation {
  id: string;
  color: string;
  size: number;
}
export interface PenStroke extends BaseAnnotation {
  type: "pen";
  points: Point[];
  simulatePressure: boolean;
}
export interface ShapeAnnotation extends BaseAnnotation {
  type: ShapeTool;
  from: Position;
  to: Position;
}
export interface TextAnnotation extends BaseAnnotation {
  type: "text";
  position: Position;
  text: string;
  width: number;
  height: number;
}
export type Annotation = PenStroke | ShapeAnnotation | TextAnnotation;
export interface Features {
  nativeEyedropper: boolean;
  webEyedropper: boolean;
}
