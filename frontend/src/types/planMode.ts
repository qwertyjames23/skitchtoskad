export type ElementId = string;

export type ToolType =
  | "select"
  | "draw_wall"
  | "draw_door"
  | "draw_window"
  | "draw_rect"
  | "draw_label";

export interface WallItem {
  id: ElementId;
  start: [number, number];
  end: [number, number];
  thickness: number;
}

export interface DoorItem {
  id: ElementId;
  start: [number, number];
  end: [number, number];
  width: number;
  swing: "left" | "right" | "double";
}

export interface WindowItem {
  id: ElementId;
  start: [number, number];
  end: [number, number];
  width: number;
  height: number;
}

export interface LabelItem {
  id: ElementId;
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export interface LotConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  northAngle: number;
}

export interface SetbackConfig {
  front: number;
  rear: number;
  left: number;
  right: number;
}

export interface PlanModeState {
  lot: LotConfig | null;
  setbacks: SetbackConfig;
  walls: WallItem[];
  doors: DoorItem[];
  windows: WindowItem[];
  labels: LabelItem[];
}

export type SelectedElement =
  | { type: "wall" | "door" | "window" | "label"; id: ElementId }
  | null;

export type GridSnapMm = 100 | 500 | 1000;

export type DrawPhase =
  | { phase: "idle" }
  | { phase: "awaiting_start" }
  | { phase: "drawing"; startPoint: [number, number] }
  | { phase: "rect_first"; firstCorner: [number, number] };
