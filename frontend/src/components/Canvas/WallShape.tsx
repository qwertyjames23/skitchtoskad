import { Line, Group } from "react-konva";
import type { Transform } from "../../utils/coordTransform";

interface Props {
  coordinates: number[][][] | number[][][][];
  transform: Transform;
  geometryType: string;
}

/**
 * Renders a wall polygon from GeoJSON coordinates.
 * Handles both Polygon and MultiPolygon geometry types.
 */
export function WallShape({ coordinates, transform, geometryType }: Props) {
  if (geometryType === "MultiPolygon") {
    // coordinates is number[][][][]
    return (
      <Group>
        {(coordinates as number[][][][]).map((polygon, pi) =>
          polygon.map((ring, ri) => {
            const points = ring.flatMap(([x, y]) => transform.toScreen(x, y));
            return (
              <Line
                key={`mp-${pi}-${ri}`}
                points={points}
                closed
                fill={ri === 0 ? "#c0c0c0" : "#ffffff"}
                stroke="#333333"
                strokeWidth={1}
              />
            );
          })
        )}
      </Group>
    );
  }

  // Polygon: coordinates is number[][][]
  const rings = coordinates as number[][][];
  return (
    <Group>
      {rings.map((ring, ri) => {
        const points = ring.flatMap(([x, y]) => transform.toScreen(x, y));
        return (
          <Line
            key={`p-${ri}`}
            points={points}
            closed
            fill={ri === 0 ? "#c0c0c0" : "#ffffff"}
            stroke="#333333"
            strokeWidth={1}
          />
        );
      })}
    </Group>
  );
}
