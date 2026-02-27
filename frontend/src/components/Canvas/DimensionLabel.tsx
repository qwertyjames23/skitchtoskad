import { Group, Line, Text } from "react-konva";
import type { Transform } from "../../utils/coordTransform";

interface Props {
  start: [number, number];
  end: [number, number];
  transform: Transform;
}

function formatLength(mm: number): string {
  return mm < 1000
    ? `${Math.round(mm)} mm`
    : `${(mm / 1000).toFixed(2)} m`;
}

// Screen-space constants (pixels) — independent of world scale
const OFFSET_PX = 22;       // how far the dimension line sits from the wall centerline
const EXT_OVERSHOOT = 4;    // extension line extends this far past the dimension line
const TICK_HALF = 5;        // half-length of the 45° tick mark
const FONT_SIZE = 10;
const COLOR = "#0055aa";

export function DimensionLabel({ start, end, transform }: Props) {
  const [sx, sy] = transform.toScreen(start[0], start[1]);
  const [ex, ey] = transform.toScreen(end[0], end[1]);

  // Skip degenerate zero-length walls
  const screenLen = Math.hypot(ex - sx, ey - sy);
  if (screenLen < 4) return null;

  // Wall angle and perpendicular direction (always offset to the "left" of travel)
  const angleRad = Math.atan2(ey - sy, ex - sx);
  const perpRad = angleRad - Math.PI / 2;
  const px = Math.cos(perpRad) * OFFSET_PX;
  const py = Math.sin(perpRad) * OFFSET_PX;

  // Endpoints of the dimension line (parallel to wall, offset by OFFSET_PX)
  const dlx1 = sx + px;
  const dly1 = sy + py;
  const dlx2 = ex + px;
  const dly2 = ey + py;

  // Extension lines: from wall endpoint toward dimension line + small overshoot
  const extScale = (OFFSET_PX + EXT_OVERSHOOT) / OFFSET_PX;
  const ext1x2 = sx + px * extScale;
  const ext1y2 = sy + py * extScale;
  const ext2x2 = ex + px * extScale;
  const ext2y2 = ey + py * extScale;
  // Start the extension line a few px from the wall face (don't overlap wall stroke)
  const startGap = 3 / OFFSET_PX;
  const ext1x1 = sx + px * startGap;
  const ext1y1 = sy + py * startGap;
  const ext2x1 = ex + px * startGap;
  const ext2y1 = ey + py * startGap;

  // Tick marks at each end of the dimension line (45° slash, architectural style)
  const tickAngle = angleRad + Math.PI / 4; // 45° to the dimension line
  const tx = Math.cos(tickAngle) * TICK_HALF;
  const ty = Math.sin(tickAngle) * TICK_HALF;

  // Text label — centred on the dimension line, rotated to match wall
  const mx = (dlx1 + dlx2) / 2;
  const my = (dly1 + dly2) / 2;
  let textAngle = angleRad * (180 / Math.PI);
  if (textAngle > 90 || textAngle < -90) textAngle += 180;

  const lengthMm = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const label = formatLength(lengthMm);

  return (
    <Group listening={false}>
      {/* Extension line — start endpoint */}
      <Line
        points={[ext1x1, ext1y1, ext1x2, ext1y2]}
        stroke={COLOR}
        strokeWidth={0.8}
      />
      {/* Extension line — end endpoint */}
      <Line
        points={[ext2x1, ext2y1, ext2x2, ext2y2]}
        stroke={COLOR}
        strokeWidth={0.8}
      />
      {/* Dimension line */}
      <Line
        points={[dlx1, dly1, dlx2, dly2]}
        stroke={COLOR}
        strokeWidth={0.8}
      />
      {/* Tick mark at start */}
      <Line
        points={[dlx1 - tx, dly1 - ty, dlx1 + tx, dly1 + ty]}
        stroke={COLOR}
        strokeWidth={1.2}
      />
      {/* Tick mark at end */}
      <Line
        points={[dlx2 - tx, dly2 - ty, dlx2 + tx, dly2 + ty]}
        stroke={COLOR}
        strokeWidth={1.2}
      />
      {/* Measurement text */}
      <Text
        x={mx}
        y={my}
        text={label}
        fontSize={FONT_SIZE}
        fill={COLOR}
        rotation={textAngle}
        offsetX={label.length * 3}
        offsetY={FONT_SIZE + 2}
        listening={false}
      />
    </Group>
  );
}
