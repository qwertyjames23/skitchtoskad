import { useMemo } from "react";
import type {
  PlanModeState,
  SelectedElement,
  ElementId,
  WallItem,
  DoorItem,
  WindowItem,
  LabelItem,
} from "../../types/planMode";

interface Props {
  planState: PlanModeState;
  selectedElement: SelectedElement;
  onUpdateWall: (id: ElementId, patch: Partial<WallItem>) => void;
  onUpdateDoor: (id: ElementId, patch: Partial<DoorItem>) => void;
  onUpdateWindow: (id: ElementId, patch: Partial<WindowItem>) => void;
  onUpdateLabel: (id: ElementId, patch: Partial<LabelItem>) => void;
  onDeleteElement: (type: string, id: ElementId) => void;
  onDeselect: () => void;
}

// ── Shared sub-components ──────────────────────────────────────────────────
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td style={{ padding: "3px 0", color: "#666", fontSize: 12, width: "50%" }}>{label}</td>
      <td style={{ padding: "3px 0 3px 6px" }}>{children}</td>
    </tr>
  );
}

const numInput: React.CSSProperties = {
  width: "100%",
  padding: "2px 4px",
  fontSize: 12,
  border: "1px solid #ccc",
  borderRadius: 3,
  boxSizing: "border-box",
};

const readVal: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: "#222" };

const deleteBtn: React.CSSProperties = {
  marginTop: 12,
  width: "100%",
  padding: "6px",
  fontSize: 12,
  fontWeight: 600,
  background: "#fde8e8",
  border: "1px solid #e57373",
  borderRadius: 4,
  color: "#c0392b",
  cursor: "pointer",
};

// ── Wall inspector ─────────────────────────────────────────────────────────
function WallInspector({
  wall,
  onUpdate,
  onDelete,
}: {
  wall: WallItem;
  onUpdate: (patch: Partial<WallItem>) => void;
  onDelete: () => void;
}) {
  const len = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Wall</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <FieldRow label="Start X">
            <input aria-label="Start X" type="number" style={numInput}
              defaultValue={wall.start[0]} step={100}
              onBlur={(e) => onUpdate({ start: [Number(e.target.value), wall.start[1]] })} />
          </FieldRow>
          <FieldRow label="Start Y">
            <input aria-label="Start Y" type="number" style={numInput}
              defaultValue={wall.start[1]} step={100}
              onBlur={(e) => onUpdate({ start: [wall.start[0], Number(e.target.value)] })} />
          </FieldRow>
          <FieldRow label="End X">
            <input aria-label="End X" type="number" style={numInput}
              defaultValue={wall.end[0]} step={100}
              onBlur={(e) => onUpdate({ end: [Number(e.target.value), wall.end[1]] })} />
          </FieldRow>
          <FieldRow label="End Y">
            <input aria-label="End Y" type="number" style={numInput}
              defaultValue={wall.end[1]} step={100}
              onBlur={(e) => onUpdate({ end: [wall.end[0], Number(e.target.value)] })} />
          </FieldRow>
          <FieldRow label="Thickness (mm)">
            <input aria-label="Wall thickness in mm" type="number" style={numInput}
              defaultValue={wall.thickness} step={50} min={50}
              onBlur={(e) => onUpdate({ thickness: Number(e.target.value) })} />
          </FieldRow>
          <FieldRow label="Length">
            <span style={readVal}>{(len / 1000).toFixed(2)} m</span>
          </FieldRow>
        </tbody>
      </table>
      <button type="button" style={deleteBtn} onClick={onDelete}>Delete Wall</button>
    </div>
  );
}

// ── Door inspector ─────────────────────────────────────────────────────────
function DoorInspector({
  door,
  onUpdate,
  onDelete,
}: {
  door: DoorItem;
  onUpdate: (patch: Partial<DoorItem>) => void;
  onDelete: () => void;
}) {
  const width = Math.hypot(door.end[0] - door.start[0], door.end[1] - door.start[1]);
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Door</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <FieldRow label="Start X">
            <input aria-label="Start X" type="number" style={numInput}
              defaultValue={door.start[0]} step={100}
              onBlur={(e) => onUpdate({ start: [Number(e.target.value), door.start[1]] })} />
          </FieldRow>
          <FieldRow label="Start Y">
            <input aria-label="Start Y" type="number" style={numInput}
              defaultValue={door.start[1]} step={100}
              onBlur={(e) => onUpdate({ start: [door.start[0], Number(e.target.value)] })} />
          </FieldRow>
          <FieldRow label="End X">
            <input aria-label="End X" type="number" style={numInput}
              defaultValue={door.end[0]} step={100}
              onBlur={(e) => onUpdate({ end: [Number(e.target.value), door.end[1]] })} />
          </FieldRow>
          <FieldRow label="End Y">
            <input aria-label="End Y" type="number" style={numInput}
              defaultValue={door.end[1]} step={100}
              onBlur={(e) => onUpdate({ end: [door.end[0], Number(e.target.value)] })} />
          </FieldRow>
          <FieldRow label="Swing">
            <select aria-label="Door swing direction" style={{ ...numInput }}
              defaultValue={door.swing}
              onChange={(e) => onUpdate({ swing: e.target.value as DoorItem["swing"] })}
            >
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="double">Double</option>
            </select>
          </FieldRow>
          <FieldRow label="Width">
            <span style={readVal}>{(width / 1000).toFixed(2)} m</span>
          </FieldRow>
        </tbody>
      </table>
      <button type="button" style={deleteBtn} onClick={onDelete}>Delete Door</button>
    </div>
  );
}

// ── Window inspector ───────────────────────────────────────────────────────
function WindowInspector({
  win,
  onUpdate,
  onDelete,
}: {
  win: WindowItem;
  onUpdate: (patch: Partial<WindowItem>) => void;
  onDelete: () => void;
}) {
  const width = Math.hypot(win.end[0] - win.start[0], win.end[1] - win.start[1]);
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Window</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <FieldRow label="Start X">
            <input aria-label="Start X" type="number" style={numInput}
              defaultValue={win.start[0]} step={100}
              onBlur={(e) => onUpdate({ start: [Number(e.target.value), win.start[1]] })} />
          </FieldRow>
          <FieldRow label="Start Y">
            <input aria-label="Start Y" type="number" style={numInput}
              defaultValue={win.start[1]} step={100}
              onBlur={(e) => onUpdate({ start: [win.start[0], Number(e.target.value)] })} />
          </FieldRow>
          <FieldRow label="End X">
            <input aria-label="End X" type="number" style={numInput}
              defaultValue={win.end[0]} step={100}
              onBlur={(e) => onUpdate({ end: [Number(e.target.value), win.end[1]] })} />
          </FieldRow>
          <FieldRow label="End Y">
            <input aria-label="End Y" type="number" style={numInput}
              defaultValue={win.end[1]} step={100}
              onBlur={(e) => onUpdate({ end: [win.end[0], Number(e.target.value)] })} />
          </FieldRow>
          <FieldRow label="Height (mm)">
            <input aria-label="Window height in mm" type="number" style={numInput}
              defaultValue={win.height} step={100} min={300}
              onBlur={(e) => onUpdate({ height: Number(e.target.value) })} />
          </FieldRow>
          <FieldRow label="Width">
            <span style={readVal}>{(width / 1000).toFixed(2)} m</span>
          </FieldRow>
        </tbody>
      </table>
      <button type="button" style={deleteBtn} onClick={onDelete}>Delete Window</button>
    </div>
  );
}

// ── Label inspector ────────────────────────────────────────────────────────
function LabelInspector({
  lbl,
  onUpdate,
  onDelete,
}: {
  lbl: LabelItem;
  onUpdate: (patch: Partial<LabelItem>) => void;
  onDelete: () => void;
}) {
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Label</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <FieldRow label="Text">
            <input aria-label="Label text" type="text" style={numInput}
              defaultValue={lbl.text} placeholder="Room name"
              onBlur={(e) => onUpdate({ text: e.target.value })} />
          </FieldRow>
          <FieldRow label="Font Size">
            <input
              aria-label="Label font size"
              type="number"
              style={numInput}
              defaultValue={lbl.fontSize ?? 6}
              min={6}
              max={36}
              step={1}
              onBlur={(e) => onUpdate({ fontSize: Number(e.target.value) })}
            />
          </FieldRow>
          <FieldRow label="X">
            <input aria-label="Label X position" type="number" style={numInput}
              defaultValue={lbl.x} step={100}
              onBlur={(e) => onUpdate({ x: Number(e.target.value) })} />
          </FieldRow>
          <FieldRow label="Y">
            <input aria-label="Label Y position" type="number" style={numInput}
              defaultValue={lbl.y} step={100}
              onBlur={(e) => onUpdate({ y: Number(e.target.value) })} />
          </FieldRow>
        </tbody>
      </table>
      <button type="button" style={deleteBtn} onClick={onDelete}>Delete Label</button>
    </div>
  );
}

// ── Summary (nothing selected) ─────────────────────────────────────────────
function PlanSummary({ planState }: { planState: PlanModeState }) {
  const lotArea = planState.lot
    ? ((planState.lot.width / 1000) * (planState.lot.height / 1000)).toFixed(1)
    : null;

  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Plan Summary</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {planState.lot ? (
            <>
              <tr>
                <td style={{ padding: "3px 0", color: "#666", fontSize: 12 }}>Lot</td>
                <td style={{ padding: "3px 0", fontSize: 12, fontWeight: 500, textAlign: "right" }}>
                  {(planState.lot.width / 1000).toFixed(1)} × {(planState.lot.height / 1000).toFixed(1)} m
                </td>
              </tr>
              <tr>
                <td style={{ padding: "3px 0", color: "#666", fontSize: 12 }}>Lot Area</td>
                <td style={{ padding: "3px 0", fontSize: 12, fontWeight: 500, textAlign: "right" }}>
                  {lotArea} m²
                </td>
              </tr>
            </>
          ) : (
            <tr>
              <td colSpan={2} style={{ padding: "4px 0", fontSize: 12, color: "#999", fontStyle: "italic" }}>
                No lot defined
              </td>
            </tr>
          )}
          <tr>
            <td style={{ padding: "3px 0", color: "#666", fontSize: 12 }}>Walls</td>
            <td style={{ padding: "3px 0", fontSize: 12, fontWeight: 500, textAlign: "right" }}>
              {planState.walls.length}
            </td>
          </tr>
          <tr>
            <td style={{ padding: "3px 0", color: "#666", fontSize: 12 }}>Doors</td>
            <td style={{ padding: "3px 0", fontSize: 12, fontWeight: 500, textAlign: "right" }}>
              {planState.doors.length}
            </td>
          </tr>
          <tr>
            <td style={{ padding: "3px 0", color: "#666", fontSize: 12 }}>Windows</td>
            <td style={{ padding: "3px 0", fontSize: 12, fontWeight: 500, textAlign: "right" }}>
              {planState.windows.length}
            </td>
          </tr>
          <tr>
            <td style={{ padding: "3px 0", color: "#666", fontSize: 12 }}>Labels</td>
            <td style={{ padding: "3px 0", fontSize: 12, fontWeight: 500, textAlign: "right" }}>
              {planState.labels.length}
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ marginTop: 12, fontSize: 11, color: "#aaa", lineHeight: 1.5 }}>
        Click an element on the canvas to inspect and edit its properties.
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export function PlanModeInspector({
  planState,
  selectedElement,
  onUpdateWall,
  onUpdateDoor,
  onUpdateWindow,
  onUpdateLabel,
  onDeleteElement,
  onDeselect,
}: Props) {
  const selected = useMemo(() => {
    if (!selectedElement) return null;
    const { type, id } = selectedElement;
    if (type === "wall")   return planState.walls.find((e) => e.id === id) ?? null;
    if (type === "door")   return planState.doors.find((e) => e.id === id) ?? null;
    if (type === "window") return planState.windows.find((e) => e.id === id) ?? null;
    if (type === "label")  return planState.labels.find((e) => e.id === id) ?? null;
    return null;
  }, [selectedElement, planState]);

  const handleDelete = () => {
    if (selectedElement) {
      onDeleteElement(selectedElement.type, selectedElement.id);
      onDeselect();
    }
  };

  const handleCommitOnEnter: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      e.preventDefault();
      target.blur();
    }
  };

  return (
    <div
      style={{ padding: 12, fontSize: 13, color: "#333", overflowY: "auto" }}
      onKeyDownCapture={handleCommitOnEnter}
    >
      <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#222" }}>
        {selectedElement ? "Properties" : "Plan Properties"}
      </h3>

      {!selectedElement || !selected ? (
        <PlanSummary planState={planState} />
      ) : selectedElement.type === "wall" ? (
        <WallInspector
          key={selectedElement.id}
          wall={selected as WallItem}
          onUpdate={(patch) => onUpdateWall(selectedElement.id, patch)}
          onDelete={handleDelete}
        />
      ) : selectedElement.type === "door" ? (
        <DoorInspector
          key={selectedElement.id}
          door={selected as DoorItem}
          onUpdate={(patch) => onUpdateDoor(selectedElement.id, patch)}
          onDelete={handleDelete}
        />
      ) : selectedElement.type === "window" ? (
        <WindowInspector
          key={selectedElement.id}
          win={selected as WindowItem}
          onUpdate={(patch) => onUpdateWindow(selectedElement.id, patch)}
          onDelete={handleDelete}
        />
      ) : selectedElement.type === "label" ? (
        <LabelInspector
          key={selectedElement.id}
          lbl={selected as LabelItem}
          onUpdate={(patch) => onUpdateLabel(selectedElement.id, patch)}
          onDelete={handleDelete}
        />
      ) : null}
    </div>
  );
}
