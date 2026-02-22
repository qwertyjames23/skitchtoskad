/**
 * Coordinate transforms between world space (mm, Y-up) and
 * screen/canvas space (px, Y-down).
 */

const PX_PER_MM = 0.15; // 1mm = 0.15px at scale=1

export interface Transform {
  toScreen: (x: number, y: number) => [number, number];
  toWorld: (sx: number, sy: number) => [number, number];
  scale: number;
}

export function createTransform(
  bbox: [number, number, number, number],
  canvasWidth: number,
  canvasHeight: number,
  padding = 60
): Transform {
  const [minX, minY, maxX, maxY] = bbox;
  const worldW = maxX - minX;
  const worldH = maxY - minY;

  if (worldW === 0 || worldH === 0) {
    return {
      toScreen: (x, y) => [x * PX_PER_MM + padding, canvasHeight - y * PX_PER_MM - padding],
      toWorld: (sx, sy) => [(sx - padding) / PX_PER_MM, (canvasHeight - sy - padding) / PX_PER_MM],
      scale: PX_PER_MM,
    };
  }

  // Fit the plan into the canvas with padding
  const scaleX = (canvasWidth - padding * 2) / worldW;
  const scaleY = (canvasHeight - padding * 2) / worldH;
  const scale = Math.min(scaleX, scaleY);

  // Center offset
  const offsetX = (canvasWidth - worldW * scale) / 2;
  const offsetY = (canvasHeight - worldH * scale) / 2;

  return {
    toScreen: (x: number, y: number): [number, number] => [
      (x - minX) * scale + offsetX,
      canvasHeight - ((y - minY) * scale + offsetY), // flip Y
    ],
    toWorld: (sx: number, sy: number): [number, number] => [
      (sx - offsetX) / scale + minX,
      (canvasHeight - sy - offsetY) / scale + minY,
    ],
    scale,
  };
}
