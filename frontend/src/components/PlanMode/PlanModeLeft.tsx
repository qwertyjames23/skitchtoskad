import { useState } from "react";
import type { ToolType, SetbackConfig, LotConfig, GridSnapMm } from "../../types/planMode";

interface Props {
  activeTool: ToolType;
  wallThickness: number;
  doorSwing: "left" | "right" | "double";
  windowHeight: number;
  labelText: string;
  gridSnap: GridSnapMm;
  lotWidth: number;
  lotHeight: number;
  northAngle: number;
  setbacks: SetbackConfig;
  lotCreated: boolean;
  onSetLot: (lot: LotConfig) => void;
  onSetSetbacks: (setbacks: SetbackConfig) => void;
  onSetWallThickness: (v: number) => void;
  onSetDoorSwing: (v: "left" | "right" | "double") => void;
  onSetWindowHeight: (v: number) => void;
  onSetLabelText: (v: string) => void;
  onSetGridSnap: (v: GridSnapMm) => void;
  onActivateTool: (tool: ToolType) => void;
}

// ── Shared styles ──────────────────────────────────────────────────────────
const sectionStyle: React.CSSProperties = {
  borderBottom: "1px solid #e8e8e8",
  padding: "10px 12px",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#666",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 8,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#555",
  marginBottom: 2,
  marginTop: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "4px 6px",
  fontSize: 12,
  border: "1px solid #ccc",
  borderRadius: 3,
  boxSizing: "border-box",
};

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 6,
};

function toolBtn(active: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "6px 8px",
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid",
    borderColor: active ? "#0078d4" : "#ccc",
    borderRadius: 4,
    background: active ? "#0078d4" : "#f5f5f5",
    color: active ? "#fff" : "#333",
    cursor: "pointer",
    marginTop: 6,
  };
}

function actionBtn(): React.CSSProperties {
  return {
    width: "100%",
    padding: "6px 8px",
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid #0078d4",
    borderRadius: 4,
    background: "#e8f3ff",
    color: "#0078d4",
    cursor: "pointer",
    marginTop: 6,
  };
}

// ── Component ──────────────────────────────────────────────────────────────
export function PlanModeLeft({
  activeTool,
  wallThickness,
  doorSwing,
  windowHeight,
  labelText,
  gridSnap,
  lotWidth,
  lotHeight,
  northAngle,
  setbacks,
  lotCreated,
  onSetLot,
  onSetSetbacks,
  onSetWallThickness,
  onSetDoorSwing,
  onSetWindowHeight,
  onSetLabelText,
  onSetGridSnap,
  onActivateTool,
}: Props) {
  // Local form state for lot inputs (committed on button click)
  const [localLotWidth, setLocalLotWidth] = useState(lotWidth);
  const [localLotHeight, setLocalLotHeight] = useState(lotHeight);
  const [localNorth, setLocalNorth] = useState(northAngle);

  // Local setback state (applied immediately on change)
  const [localSetbacks, setLocalSetbacks] = useState<SetbackConfig>(setbacks);

  const handleCreateLot = () => {
    onSetLot({ x: 0, y: 0, width: localLotWidth, height: localLotHeight, northAngle: localNorth });
  };

  const handleSetbackChange = (key: keyof SetbackConfig, value: number) => {
    const next = { ...localSetbacks, [key]: value };
    setLocalSetbacks(next);
    if (lotCreated) onSetSetbacks(next);
  };

  return (
    <div style={{ overflowY: "auto", height: "100%", background: "#fafafa", fontSize: 13 }}>

      {/* ── Lot ── */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>📐 Lot</div>

        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Width (mm)</label>
            <input
              type="number"
              style={inputStyle}
              value={localLotWidth}
              min={1000}
              step={500}
              onChange={(e) => setLocalLotWidth(Number(e.target.value))}
            />
          </div>
          <div>
            <label style={labelStyle}>Height (mm)</label>
            <input
              type="number"
              style={inputStyle}
              value={localLotHeight}
              min={1000}
              step={500}
              onChange={(e) => setLocalLotHeight(Number(e.target.value))}
            />
          </div>
        </div>

        <label style={labelStyle}>North angle (°)</label>
        <input
          type="number"
          style={inputStyle}
          value={localNorth}
          min={0}
          max={360}
          step={5}
          onChange={(e) => setLocalNorth(Number(e.target.value))}
        />

        <button type="button" style={actionBtn()} onClick={handleCreateLot}>
          {lotCreated ? "Update Lot" : "Create Lot"}
        </button>
      </div>

      {/* ── Setbacks ── */}
      <div
        style={{
          ...sectionStyle,
          opacity: lotCreated ? 1 : 0.4,
          pointerEvents: lotCreated ? "auto" : "none",
        }}
      >
        <div style={sectionTitle}>📏 Setbacks (mm)</div>

        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Front</label>
            <input
              type="number"
              style={inputStyle}
              value={localSetbacks.front}
              min={0}
              step={100}
              onChange={(e) => handleSetbackChange("front", Number(e.target.value))}
            />
          </div>
          <div>
            <label style={labelStyle}>Rear</label>
            <input
              type="number"
              style={inputStyle}
              value={localSetbacks.rear}
              min={0}
              step={100}
              onChange={(e) => handleSetbackChange("rear", Number(e.target.value))}
            />
          </div>
          <div>
            <label style={labelStyle}>Left</label>
            <input
              type="number"
              style={inputStyle}
              value={localSetbacks.left}
              min={0}
              step={100}
              onChange={(e) => handleSetbackChange("left", Number(e.target.value))}
            />
          </div>
          <div>
            <label style={labelStyle}>Right</label>
            <input
              type="number"
              style={inputStyle}
              value={localSetbacks.right}
              min={0}
              step={100}
              onChange={(e) => handleSetbackChange("right", Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* ── Walls ── */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>🧱 Walls</div>

        <label style={labelStyle}>Thickness (mm)</label>
        <input
          type="number"
          style={inputStyle}
          value={wallThickness}
          min={100}
          step={50}
          onChange={(e) => onSetWallThickness(Number(e.target.value))}
        />

        <button
          type="button"
          style={toolBtn(activeTool === "draw_wall")}
          onClick={() => onActivateTool(activeTool === "draw_wall" ? "select" : "draw_wall")}
        >
          {activeTool === "draw_wall" ? "✏ Drawing Wall…" : "✏ Draw Wall"}
        </button>

        <button
          type="button"
          style={toolBtn(activeTool === "draw_rect")}
          onClick={() => onActivateTool(activeTool === "draw_rect" ? "select" : "draw_rect")}
        >
          {activeTool === "draw_rect" ? "▭ Drawing Rectangle…" : "▭ Add Rectangle"}
        </button>
      </div>

      {/* ── Doors ── */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>🚪 Doors</div>

        <label style={labelStyle}>Swing direction</label>
        <select
          style={{ ...inputStyle, padding: "4px 6px" }}
          value={doorSwing}
          onChange={(e) => onSetDoorSwing(e.target.value as "left" | "right" | "double")}
        >
          <option value="left">Left</option>
          <option value="right">Right</option>
          <option value="double">Double</option>
        </select>

        <button
          type="button"
          style={toolBtn(activeTool === "draw_door")}
          onClick={() => onActivateTool(activeTool === "draw_door" ? "select" : "draw_door")}
        >
          {activeTool === "draw_door" ? "✏ Drawing Door…" : "✏ Draw Door"}
        </button>
      </div>

      {/* ── Windows ── */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>🪟 Windows</div>

        <label style={labelStyle}>Height (mm)</label>
        <input
          type="number"
          style={inputStyle}
          value={windowHeight}
          min={300}
          step={100}
          onChange={(e) => onSetWindowHeight(Number(e.target.value))}
        />

        <button
          type="button"
          style={toolBtn(activeTool === "draw_window")}
          onClick={() => onActivateTool(activeTool === "draw_window" ? "select" : "draw_window")}
        >
          {activeTool === "draw_window" ? "✏ Drawing Window…" : "✏ Draw Window"}
        </button>
      </div>

      {/* ── Labels ── */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>🏷 Labels</div>

        <label style={labelStyle}>Text</label>
        <input
          type="text"
          style={inputStyle}
          value={labelText}
          onChange={(e) => onSetLabelText(e.target.value)}
          placeholder="Room name"
        />

        <button
          type="button"
          style={toolBtn(activeTool === "draw_label")}
          onClick={() => onActivateTool(activeTool === "draw_label" ? "select" : "draw_label")}
        >
          {activeTool === "draw_label" ? "✏ Placing Label…" : "✏ Place Label"}
        </button>
      </div>

      {/* ── Grid Snap ── */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Grid Snap</div>
        <select
          style={{ ...inputStyle, padding: "4px 6px" }}
          value={gridSnap}
          onChange={(e) => onSetGridSnap(Number(e.target.value) as GridSnapMm)}
        >
          <option value={100}>100 mm</option>
          <option value={500}>500 mm</option>
          <option value={1000}>1000 mm</option>
        </select>
      </div>

    </div>
  );
}
