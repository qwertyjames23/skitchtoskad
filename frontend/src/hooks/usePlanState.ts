import { useState, useCallback } from "react";
import type { FloorPlanResponse, ParseError } from "../types/plan";
import { generateFromScript, exportDxfFromScript, downloadBlob } from "../api/client";
import { AxiosError } from "axios";

const DEFAULT_SCRIPT = `# Single-Story 2-Bedroom Filipino House
# Lot: 10m x 16m  |  Floor area: ~77 sqm
# Rooms: Sala, Dining/Kitchen, Hallway, CR, Bedroom 1 & 2
UNIT mm

# ── Lot & Setbacks ─────────────────────────────────────────────────────
LOT (0,0) -> (10000,0) -> (10000,16000) -> (0,16000)
SETBACK front 3000 rear 2000 side 1500
NORTH 90

# ── Exterior Walls (200mm) ──────────────────────────────────────────────
WALL (1500,3000) -> (8500,3000) THICK 200
WALL (8500,3000) -> (8500,14000) THICK 200
WALL (8500,14000) -> (1500,14000) THICK 200
WALL (1500,14000) -> (1500,3000) THICK 200

# ── Interior Partitions (150mm) ─────────────────────────────────────────
WALL (5000,3000) -> (5000,7500) THICK 150
WALL (1500,7500) -> (8500,7500) THICK 150
WALL (6500,7500) -> (6500,9500) THICK 150
WALL (1500,9500) -> (8500,9500) THICK 150
WALL (5000,9500) -> (5000,14000) THICK 150

# ── Doors ───────────────────────────────────────────────────────────────
DOOR (2800,3000) -> (3600,3000) SWING left
DOOR (5000,5000) -> (5000,5800) SWING right
DOOR (2800,7500) -> (3600,7500) SWING right
DOOR (6500,7800) -> (6500,8600) SWING right
DOOR (2800,9500) -> (3600,9500) SWING right
DOOR (5300,9500) -> (6100,9500) SWING left

# ── Windows ─────────────────────────────────────────────────────────────
WINDOW (1700,3000) -> (2600,3000)
WINDOW (5200,3000) -> (7500,3000)
WINDOW (1500,5000) -> (1500,6500)
WINDOW (8500,4500) -> (8500,6500)
WINDOW (8500,7800) -> (8500,8800)
WINDOW (1500,10500) -> (1500,12000)
WINDOW (8500,10500) -> (8500,12500)
WINDOW (2000,14000) -> (4500,14000)
WINDOW (5500,14000) -> (7500,14000)

# ── Room Labels ─────────────────────────────────────────────────────────
LABEL (3000,5000) "Sala"
LABEL (6500,5000) "Dining / Kitchen"
LABEL (3500,8300) "Hallway"
LABEL (7200,8300) "CR / Toilet"
LABEL (3000,11500) "Bedroom 1"
LABEL (6500,11500) "Bedroom 2"
`;

export function usePlanState() {
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [plan, setPlan] = useState<FloorPlanResponse | null>(null);
  const [errors, setErrors] = useState<ParseError[]>([]);
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async (): Promise<FloorPlanResponse | null> => {
    setLoading(true);
    setErrors([]);
    try {
      const result = await generateFromScript(script);
      setPlan(result);
      return result;
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
  }, [script]);

  const syncGenerated = useCallback((nextScript: string, nextPlan: FloorPlanResponse) => {
    setScript(nextScript);
    setPlan(nextPlan);
    setErrors([]);
  }, []);

  const exportDxf = useCallback(async () => {
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
  }, [script]);

  return { script, setScript, plan, errors, loading, generate, syncGenerated, exportDxf };
}
