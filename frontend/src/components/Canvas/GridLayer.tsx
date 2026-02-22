import { Layer, Line } from "react-konva";

interface Props {
  width: number;
  height: number;
  gridSize?: number;
}

export function GridLayer({ width, height, gridSize = 50 }: Props) {
  const lines = [];

  // Vertical lines
  for (let x = 0; x < width; x += gridSize) {
    lines.push(
      <Line
        key={`v-${x}`}
        points={[x, 0, x, height]}
        stroke="#f0f0f0"
        strokeWidth={1}
      />
    );
  }

  // Horizontal lines
  for (let y = 0; y < height; y += gridSize) {
    lines.push(
      <Line
        key={`h-${y}`}
        points={[0, y, width, y]}
        stroke="#f0f0f0"
        strokeWidth={1}
      />
    );
  }

  return <Layer listening={false}>{lines}</Layer>;
}
