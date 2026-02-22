export interface RoomInfo {
  name: string;
  area_sq_m: number;
  area_sq_ft: number;
  centroid: [number, number];
  dimensions_mm: { width: number; height: number };
  perimeter_mm: number;
  polygon: number[][];
}

export interface DoorInfo {
  type: "door";
  start: [number, number];
  end: [number, number];
  swing: string;
  width: number;
  arc: {
    center: [number, number];
    radius: number;
    start_angle: number;
    end_angle: number;
  };
}

export interface WindowInfo {
  type: "window";
  start: [number, number];
  end: [number, number];
  width: number;
  height: number;
  glass_lines: [[number, number], [number, number]][];
}

export interface GeoJSONFeature {
  type: "Feature";
  properties: {
    type: string;
    name?: string;
    area_sq_m?: number;
  };
  geometry: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
}

export interface SetbackInfo {
  front: number;
  rear: number;
  left: number;
  right: number;
}

export interface LotInfo {
  boundary: [number, number][];
  setback_polygon: [number, number][] | null;
  north_angle: number;
  area_sq_m: number;
  setbacks: SetbackInfo;
}

export interface WallSegment {
  start: [number, number];
  end: [number, number];
  thickness: number;
}

export interface FloorPlanResponse {
  walls_geojson: {
    type: "FeatureCollection";
    features: GeoJSONFeature[];
  };
  rooms: RoomInfo[];
  doors: DoorInfo[];
  windows: WindowInfo[];
  bounding_box: [number, number, number, number];
  lot?: LotInfo;
  building_footprint_sq_m: number;
  compliance: "ok" | "violation" | null;
  wall_segments: WallSegment[];
}

export interface ParseError {
  message: string;
  line: number;
  col?: number;
}
