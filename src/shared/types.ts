export type Tool =
  "pen" | "arrow" | "rectangle" | "ellipse" | "text" | "eraser";
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

export interface AgendaItem {
  id: string;
  text: string;
  optional: boolean;
  details: string[];
  done: boolean;
}
export interface Section {
  id: string;
  title: string;
  items: AgendaItem[];
}
export interface Agenda {
  id: string;
  name: string;
  sections: Section[];
  currentIndex: number;
}
export interface StickySettings {
  enabled: boolean;
  style: "frosted" | "clear" | "paper";
  opacity: number;
  corner: "tl" | "tr" | "bl" | "br";
  accent: string;
  compact: boolean;
  display: "primary" | "cursor";
}
export interface AgendaState {
  agenda: Agenda;
  settings: StickySettings;
  revision: number;
}
export type AgendaDirection = "previous" | "next";

export type AgendaEdit =
  | { type: "addSection"; id: string }
  | { type: "renameSection"; sectionId: string; title: string }
  | { type: "deleteSection"; sectionId: string }
  | { type: "moveSection"; sectionId: string; beforeId: string | null }
  | { type: "selectSection"; sectionId: string }
  | { type: "addItem"; sectionId: string; id: string }
  | {
      type: "editItem";
      sectionId: string;
      itemId: string;
      text?: string;
      optional?: boolean;
      details?: string[];
    }
  | { type: "deleteItem"; sectionId: string; itemId: string }
  | { type: "resetChecklist" }
  | { type: "style"; style: StickySettings["style"] }
  | { type: "opacity"; opacity: number }
  | { type: "corner"; corner: StickySettings["corner"] }
  | { type: "compact"; compact: boolean };
