import { Text } from "react-konva";
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

export function DimensionLabel({ start, end, transform }: Props) {
  const [sx, sy] = transform.toScreen(start[0], start[1]);
  const [ex, ey] = transform.toScreen(end[0], end[1]);

  // Skip degenerate zero-length walls
  if (Math.hypot(ex - sx, ey - sy) < 2) return null;

  // Midpoint in screen coords
  const mx = (sx + ex) / 2;
  const my = (sy + ey) / 2;

  // Wall angle in degrees — flip so text is never upside-down
  let angle = Math.atan2(ey - sy, ex - sx) * (180 / Math.PI);
  if (angle > 90 || angle < -90) angle += 180;

  // Perpendicular offset: 14 screen-px above/left of the wall
  const perpRad = (angle - 90) * (Math.PI / 180);
  const perpX = Math.cos(perpRad) * 14;
  const perpY = Math.sin(perpRad) * 14;

  // Length from world coordinates (mm), independent of screen scale
  const lengthMm = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const label = formatLength(lengthMm);

  return (
    <Text
      x={mx + perpX}
      y={my + perpY}
      text={label}
      fontSize={10}
      fill="#0055aa"
      rotation={angle}
      offsetX={label.length * 3}
      listening={false}
    />
  );
}
