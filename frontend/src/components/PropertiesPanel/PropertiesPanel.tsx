import type { FloorPlanResponse } from "../../types/plan";

interface Props {
  plan: FloorPlanResponse | null;
}

export function PropertiesPanel({ plan }: Props) {
  if (!plan) {
    return (
      <div style={{ padding: 16, color: "#888", fontSize: 13 }}>
        Write a script and click Generate to see the floor plan.
      </div>
    );
  }

  const totalArea = plan.rooms.reduce((sum, r) => sum + r.area_sq_m, 0);
  const coveragePct = plan.lot && plan.building_footprint_sq_m > 0
    ? (plan.building_footprint_sq_m / plan.lot.area_sq_m) * 100
    : null;

  return (
    <div style={{ padding: 12, fontSize: 13, color: "#333", overflowY: "auto" }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#222", paddingRight: 28 }}>
        Plan Properties
      </h3>

      {/* Compliance badge */}
      {plan.compliance !== null && (
        <div style={{
          marginBottom: 12,
          padding: "6px 10px",
          borderRadius: 6,
          background: plan.compliance === "ok" ? "#e6f9ec" : "#fde8e8",
          border: `1px solid ${plan.compliance === "ok" ? "#6fcf97" : "#e57373"}`,
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontWeight: 600,
          fontSize: 12,
          color: plan.compliance === "ok" ? "#1a7a3c" : "#c0392b",
        }}>
          <span style={{ fontSize: 14 }}>{plan.compliance === "ok" ? "🟢" : "🔴"}</span>
          {plan.compliance === "ok" ? "Within Setback" : "Setback Violation"}
        </div>
      )}

      {plan.lot && (
        <div style={{ marginBottom: 16, padding: 8, background: "#eef3ff", borderRadius: 4, border: "1px solid #b0c4f0" }}>
          <div style={{ fontWeight: 600, marginBottom: 4, color: "#0044aa" }}>Lot Information</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <Row label="Lot Area" value={`${plan.lot.area_sq_m.toFixed(1)} m\u00b2`} />
              <Row label="Building Area" value={`${plan.building_footprint_sq_m.toFixed(1)} m\u00b2`} />
              {coveragePct !== null && (
                <Row
                  label="Coverage"
                  value={`${coveragePct.toFixed(1)}%`}
                  highlight={coveragePct > 60}
                />
              )}
              <Row label="Front Setback" value={`${(plan.lot.setbacks.front / 1000).toFixed(1)} m`} />
              <Row label="Rear Setback" value={`${(plan.lot.setbacks.rear / 1000).toFixed(1)} m`} />
              <Row label="Left Setback" value={`${(plan.lot.setbacks.left / 1000).toFixed(1)} m`} />
              <Row label="Right Setback" value={`${(plan.lot.setbacks.right / 1000).toFixed(1)} m`} />
              <Row label="North Angle" value={`${plan.lot.north_angle}\u00b0`} />
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Summary</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <Row label="Rooms" value={String(plan.rooms.length)} />
            <Row label="Doors" value={String(plan.doors.length)} />
            <Row label="Windows" value={String(plan.windows.length)} />
            <Row label="Total Area" value={`${totalArea.toFixed(1)} m\u00b2`} />
          </tbody>
        </table>
      </div>

      {plan.rooms.map((room, i) => (
        <div
          key={i}
          style={{
            marginBottom: 12,
            padding: 8,
            background: "#f5f5f5",
            borderRadius: 4,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{room.name}</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <Row label="Area" value={`${room.area_sq_m} m\u00b2 (${room.area_sq_ft} ft\u00b2)`} />
              <Row
                label="Size"
                value={`${(room.dimensions_mm.width / 1000).toFixed(1)} x ${(room.dimensions_mm.height / 1000).toFixed(1)} m`}
              />
              <Row
                label="Perimeter"
                value={`${(room.perimeter_mm / 1000).toFixed(1)} m`}
              />
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <tr>
      <td style={{ padding: "2px 0", color: "#666" }}>{label}</td>
      <td style={{ padding: "2px 0", textAlign: "right", fontWeight: 500, color: highlight ? "#c0392b" : undefined }}>
        {value}
      </td>
    </tr>
  );
}
