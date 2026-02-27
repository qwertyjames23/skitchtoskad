interface Props {
  scaleMmToPx: number; // transform.scale: how many canvas-px = 1 mm at zoom=1
  stageZoom: number;   // current Konva stage zoom (1 = default)
}

const NICE_MM = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];

function formatMm(mm: number): string {
  return mm < 1000 ? `${mm} mm` : `${mm / 1000} m`;
}

export function ScaleRuler({ scaleMmToPx, stageZoom }: Props) {
  const pxPerMm = scaleMmToPx * stageZoom;

  // Pick the largest nice value whose pixel length is between 60–160px
  let niceMm = NICE_MM[0];
  for (const v of NICE_MM) {
    if (v * pxPerMm <= 160) niceMm = v;
    else break;
  }

  const barPx = niceMm * pxPerMm;
  if (barPx < 4) return null; // too small to show

  const label = formatMm(niceMm);
  const half = barPx / 2;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: 16,
        pointerEvents: "none",
        userSelect: "none",
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
      }}
    >
      {/* Bar: two alternating segments */}
      <div style={{ display: "flex", height: 8, border: "1px solid #555" }}>
        <div style={{ width: half, background: "#333" }} />
        <div style={{ width: half, background: "#fff" }} />
      </div>
      {/* Tick marks at ends and midpoint */}
      <div
        style={{
          width: barPx,
          display: "flex",
          justifyContent: "space-between",
          paddingInline: 0,
        }}
      >
        <span style={{ fontSize: 9, color: "#333" }}>0</span>
        <span style={{ fontSize: 9, color: "#333", fontWeight: 600 }}>{label}</span>
      </div>
    </div>
  );
}
