import { useState, useCallback, useReducer } from "react";
import { AxiosError } from "axios";
import type {
  PlanModeState,
  WallItem,
  DoorItem,
  WindowItem,
  LabelItem,
  LotConfig,
  SetbackConfig,
  ElementId,
} from "../types/planMode";
import type { FloorPlanResponse, ParseError } from "../types/plan";
import { generateFromScript, exportDxfFromScript, downloadBlob } from "../api/client";

const DEFAULT_LABEL_FONT_SIZE = 6;

// ── Script parser (Script → Plan) ──────────────────────────────────────────
function extractCoords(line: string): [number, number][] {
  const coords: [number, number][] = [];
  const re = /\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    coords.push([parseFloat(m[1]), parseFloat(m[2])]);
  }
  return coords;
}

export function parseScriptToPlanState(script: string): PlanModeState {
  const lines = script.split("\n").map((l) => l.trim());
  let lot: LotConfig | null = null;
  let northAngle = 90;
  const setbacks: SetbackConfig = { front: 3000, rear: 2000, left: 1500, right: 1500 };
  const walls: WallItem[] = [];
  const doors: DoorItem[] = [];
  const windows: WindowItem[] = [];
  const labels: LabelItem[] = [];

  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const upper = line.toUpperCase();

    if (upper.startsWith("WALL")) {
      const coords = extractCoords(line);
      if (coords.length >= 2) {
        const thickMatch = upper.match(/THICK\s+(\d+(?:\.\d+)?)/);
        const thickness = thickMatch ? parseFloat(thickMatch[1]) : 200;
        walls.push({ id: crypto.randomUUID(), start: coords[0], end: coords[1], thickness });
      }

    } else if (upper.startsWith("DOOR")) {
      const coords = extractCoords(line);
      if (coords.length >= 2) {
        const swingMatch = upper.match(/SWING\s+(LEFT|RIGHT|DOUBLE)/);
        const swing = swingMatch
          ? (swingMatch[1].toLowerCase() as "left" | "right" | "double")
          : "left";
        const width = Math.hypot(
          coords[1][0] - coords[0][0],
          coords[1][1] - coords[0][1]
        );
        doors.push({ id: crypto.randomUUID(), start: coords[0], end: coords[1], width, swing });
      }

    } else if (upper.startsWith("WINDOW")) {
      const coords = extractCoords(line);
      if (coords.length >= 2) {
        const width = Math.hypot(
          coords[1][0] - coords[0][0],
          coords[1][1] - coords[0][1]
        );
        windows.push({ id: crypto.randomUUID(), start: coords[0], end: coords[1], width, height: 1200 });
      }

    } else if (upper.startsWith("LABEL")) {
      const coords = extractCoords(line);
      if (coords.length >= 1) {
        const textMatch = line.match(/"([^"]*)"/);
        const text = textMatch ? textMatch[1] : "Room";
        labels.push({
          id: crypto.randomUUID(),
          x: coords[0][0],
          y: coords[0][1],
          text,
          fontSize: DEFAULT_LABEL_FONT_SIZE,
        });
      }

    } else if (upper.startsWith("LOT")) {
      const coords = extractCoords(line);
      if (coords.length >= 2) {
        const xs = coords.map((c) => c[0]);
        const ys = coords.map((c) => c[1]);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs);
        const maxY = Math.max(...ys);
        lot = { x: minX, y: minY, width: maxX - minX, height: maxY - minY, northAngle };
      }

    } else if (upper.startsWith("SETBACK")) {
      const frontMatch  = upper.match(/FRONT\s+(\d+(?:\.\d+)?)/);
      const rearMatch   = upper.match(/REAR\s+(\d+(?:\.\d+)?)/);
      const leftMatch   = upper.match(/LEFT\s+(\d+(?:\.\d+)?)/);
      const rightMatch  = upper.match(/RIGHT\s+(\d+(?:\.\d+)?)/);
      const sideMatch   = upper.match(/SIDE\s+(\d+(?:\.\d+)?)/);
      if (frontMatch)  setbacks.front = parseFloat(frontMatch[1]);
      if (rearMatch)   setbacks.rear  = parseFloat(rearMatch[1]);
      if (leftMatch)   setbacks.left  = parseFloat(leftMatch[1]);
      if (rightMatch)  setbacks.right = parseFloat(rightMatch[1]);
      if (sideMatch) {
        const side = parseFloat(sideMatch[1]);
        if (!leftMatch)  setbacks.left  = side;
        if (!rightMatch) setbacks.right = side;
      }

    } else if (upper.startsWith("NORTH")) {
      const angleMatch = upper.match(/NORTH\s+(\d+(?:\.\d+)?)/);
      if (angleMatch) northAngle = parseFloat(angleMatch[1]);
    }
  }

  // Apply collected northAngle to lot (handles NORTH appearing after LOT in script)
  if (lot) lot = { ...lot, northAngle };

  return { lot, setbacks, walls, doors, windows, labels };
}

// ── Script serializer ──────────────────────────────────────────────────────
export function planStateToScript(state: PlanModeState): string {
  const lines: string[] = ["UNIT mm"];

  if (state.lot) {
    const { x, y, width, height, northAngle } = state.lot;
    lines.push(
      `LOT (${x},${y}) -> (${x + width},${y}) -> (${x + width},${y + height}) -> (${x},${y + height})`
    );
    const { front, rear, left, right } = state.setbacks;
    lines.push(`SETBACK front ${front} rear ${rear} left ${left} right ${right}`);
    lines.push(`NORTH ${northAngle}`);
    lines.push("");
  }

  for (const w of state.walls)
    lines.push(
      `WALL (${w.start[0]},${w.start[1]}) -> (${w.end[0]},${w.end[1]}) THICK ${w.thickness}`
    );
  for (const d of state.doors)
    lines.push(
      `DOOR (${d.start[0]},${d.start[1]}) -> (${d.end[0]},${d.end[1]}) SWING ${d.swing}`
    );
  for (const win of state.windows)
    lines.push(`WINDOW (${win.start[0]},${win.start[1]}) -> (${win.end[0]},${win.end[1]})`);
  for (const lbl of state.labels)
    lines.push(`LABEL (${lbl.x},${lbl.y}) "${lbl.text}"`);

  return lines.join("\n");
}

// ── Initial state ──────────────────────────────────────────────────────────
const DEFAULT_SETBACKS: SetbackConfig = {
  front: 3000,
  rear: 2000,
  left: 1500,
  right: 1500,
};

const INITIAL_STATE: PlanModeState = {
  lot: null,
  setbacks: DEFAULT_SETBACKS,
  walls: [],
  doors: [],
  windows: [],
  labels: [],
};

// ── History types & reducer ────────────────────────────────────────────────
const MAX_HISTORY = 50;

interface HistoryState {
  past: PlanModeState[];
  present: PlanModeState;
  future: PlanModeState[];
}

type HistoryAction =
  | { type: "MUTATE"; updater: (s: PlanModeState) => PlanModeState }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "RESET"; payload: PlanModeState };

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "MUTATE": {
      const next = action.updater(state.present);
      // No-op if state didn't actually change (avoids polluting history)
      if (next === state.present) return state;
      return {
        past: [...state.past.slice(-(MAX_HISTORY - 1)), state.present],
        present: next,
        future: [],
      };
    }
    case "UNDO": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future.slice(0, MAX_HISTORY - 1)],
      };
    }
    case "REDO": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        past: [...state.past.slice(-(MAX_HISTORY - 1)), state.present],
        present: next,
        future: state.future.slice(1),
      };
    }
    case "RESET":
      return { past: [], present: action.payload, future: [] };
  }
}

const INITIAL_HISTORY: HistoryState = {
  past: [],
  present: INITIAL_STATE,
  future: [],
};

// ── Hook ───────────────────────────────────────────────────────────────────
export function usePlanModeState() {
  const [historyState, dispatch] = useReducer(historyReducer, INITIAL_HISTORY);
  const planState = historyState.present;
  const [plan, setPlan] = useState<FloorPlanResponse | null>(null);
  const [generatedScript, setGeneratedScript] = useState<string>("");
  const [errors, setErrors] = useState<ParseError[]>([]);
  const [loading, setLoading] = useState(false);

  // Lot / setbacks
  const setLot = useCallback(
    (lot: LotConfig) => dispatch({ type: "MUTATE", updater: (s) => ({ ...s, lot }) }),
    []
  );
  const setSetbacks = useCallback(
    (setbacks: SetbackConfig) => dispatch({ type: "MUTATE", updater: (s) => ({ ...s, setbacks }) }),
    []
  );

  // Add elements
  const addWall = useCallback(
    (wall: WallItem) => dispatch({ type: "MUTATE", updater: (s) => ({ ...s, walls: [...s.walls, wall] }) }),
    []
  );
  const addWalls = useCallback(
    (newWalls: WallItem[]) =>
      dispatch({ type: "MUTATE", updater: (s) => ({ ...s, walls: [...s.walls, ...newWalls] }) }),
    []
  );
  const addDoor = useCallback(
    (door: DoorItem) => dispatch({ type: "MUTATE", updater: (s) => ({ ...s, doors: [...s.doors, door] }) }),
    []
  );
  const addWindow = useCallback(
    (win: WindowItem) =>
      dispatch({ type: "MUTATE", updater: (s) => ({ ...s, windows: [...s.windows, win] }) }),
    []
  );
  const addLabel = useCallback(
    (label: LabelItem) =>
      dispatch({ type: "MUTATE", updater: (s) => ({ ...s, labels: [...s.labels, label] }) }),
    []
  );

  // Delete
  const deleteElement = useCallback((type: string, id: ElementId) => {
    dispatch({
      type: "MUTATE",
      updater: (s) => {
        switch (type) {
          case "wall":
            return { ...s, walls: s.walls.filter((e) => e.id !== id) };
          case "door":
            return { ...s, doors: s.doors.filter((e) => e.id !== id) };
          case "window":
            return { ...s, windows: s.windows.filter((e) => e.id !== id) };
          case "label":
            return { ...s, labels: s.labels.filter((e) => e.id !== id) };
          default:
            return s;
        }
      },
    });
  }, []);

  // Update
  const updateWall = useCallback(
    (id: ElementId, patch: Partial<WallItem>) =>
      dispatch({
        type: "MUTATE",
        updater: (s) => ({
          ...s,
          walls: s.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)),
        }),
      }),
    []
  );
  const updateDoor = useCallback(
    (id: ElementId, patch: Partial<DoorItem>) =>
      dispatch({
        type: "MUTATE",
        updater: (s) => ({
          ...s,
          doors: s.doors.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        }),
      }),
    []
  );
  const updateWindow = useCallback(
    (id: ElementId, patch: Partial<WindowItem>) =>
      dispatch({
        type: "MUTATE",
        updater: (s) => ({
          ...s,
          windows: s.windows.map((w) => (w.id === id ? { ...w, ...patch } : w)),
        }),
      }),
    []
  );
  const updateLabel = useCallback(
    (id: ElementId, patch: Partial<LabelItem>) =>
      dispatch({
        type: "MUTATE",
        updater: (s) => ({
          ...s,
          labels: s.labels.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        }),
      }),
    []
  );

  // Init from parsed script (RESET clears history)
  const initFromScript = useCallback((parsed: PlanModeState) => {
    dispatch({ type: "RESET", payload: parsed });
    setPlan(null);
    setErrors([]);
    setGeneratedScript("");
  }, []);

  // Generate
  const generate = useCallback(async (): Promise<{ plan: FloorPlanResponse; script: string } | null> => {
    const script = planStateToScript(planState);
    setGeneratedScript(script);
    setLoading(true);
    setErrors([]);
    try {
      const result = await generateFromScript(script);
      setPlan(result);
      return { plan: result, script };
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 422) {
        setErrors(err.response.data.detail || []);
      } else {
        setErrors([{ message: "Failed to generate plan", line: 0 }]);
      }
      setPlan(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [planState]);

  const syncGenerated = useCallback((nextScript: string, nextPlan: FloorPlanResponse) => {
    setGeneratedScript(nextScript);
    setPlan(nextPlan);
    setErrors([]);
  }, []);

  // Export DXF
  const exportDxf = useCallback(async () => {
    const script = planStateToScript(planState);
    try {
      const blob = await exportDxfFromScript(script);
      downloadBlob(blob, "floorplan.dxf");
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 422) {
        setErrors(err.response.data.detail || []);
      } else {
        setErrors([{ message: "Failed to export DXF", line: 0 }]);
      }
    }
  }, [planState]);

  // Undo / Redo
  const canUndo = historyState.past.length > 0;
  const canRedo = historyState.future.length > 0;
  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => dispatch({ type: "REDO" }), []);

  return {
    planState,
    plan,
    generatedScript,
    errors,
    loading,
    setLot,
    setSetbacks,
    addWall,
    addWalls,
    addDoor,
    addWindow,
    addLabel,
    deleteElement,
    updateWall,
    updateDoor,
    updateWindow,
    updateLabel,
    initFromScript,
    generate,
    syncGenerated,
    exportDxf,
    canUndo,
    canRedo,
    undo,
    redo,
  };
}
