export type Tool = "pen";

export interface DrawingState {
  tool: Tool;
  armed: boolean;
  color: string;
  revision: number;
}

export type Point = [x: number, y: number, pressure: number];

export interface PenStroke {
  id: string;
  type: "pen";
  points: Point[];
  color: string;
  size: number;
  simulatePressure: boolean;
}
