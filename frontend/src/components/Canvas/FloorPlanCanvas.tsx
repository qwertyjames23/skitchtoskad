import { useRef } from "react";
import type { RefObject } from "react";
import { Stage, Layer, Line, Arc } from "react-konva";
import type Konva from "konva";
import { WallShape } from "./WallShape";
import { RoomLabel } from "./RoomLabel";
import { DimensionLabel } from "./DimensionLabel";
import { GridLayer } from "./GridLayer";
import { ScaleRuler } from "./ScaleRuler";
import { FurnitureShape } from "./FurnitureShape";
import { FloorSelector } from "./FloorSelector";
import { useCanvasControls } from "../../hooks/useCanvasControls";
import { createTransform } from "../../utils/coordTransform";
import type { FloorPlanResponse, FloorEntry } from "../../types/plan";

interface Props {
  plan: FloorPlanResponse | null;
  width: number;
  height: number;
  showDimensions?: boolean;
  stageRef?: RefObject<Konva.Stage | null>;
  floors?: FloorEntry[];
  activeFloor?: number;
  onFloorChange?: (floor: number) => void;
}

function NorthArrow({ angle }: { angle: number }) {
  // angle: 90 = up, 0 = right (mathematical convention)
  // CSS rotate: 0 = up, positive = clockwise
  // Convert: cssAngle = 90 - angle
  const cssAngle = 90 - angle;
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: 44,
        height: 44,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(255,255,255,0.88)",
        border: "1.5px solid #aaa",
        borderRadius: 6,
        zIndex: 10,
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <div
        style={{
          transform: `rotate(${cssAngle}deg)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          lineHeight: 1,
        }}
      >
        <svg width="18" height="24" viewBox="0 0 18 24">
          {/* North half — filled dark */}
          <polygon points="9,2 16,22 9,17" fill="#222" />
          {/* South half — outline only */}
          <polygon points="9,2 2,22 9,17" fill="#ccc" stroke="#444" strokeWidth="0.5" />
        </svg>
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, color: "#222", marginTop: 1 }}>N</span>
    </div>
  );
}

export function FloorPlanCanvas({ plan, width, height, showDimensions, stageRef, floors, activeFloor, onFloorChange }: Props) {
  const internalRef = useRef<Konva.Stage>(null);
  const resolvedRef = stageRef ?? internalRef;
  const { scale, position, onWheel, onDragEnd } = useCanvasControls();

  const transform = plan
    ? createTransform(plan.bounding_box, width, height)
    : createTransform([0, 0, 1000, 1000], width, height);

  const wallFeatures =
    plan?.walls_geojson.features.filter((f) => f.properties.type === "wall") ??
    [];

  // Lot boundary — flat array of screen points for Konva Line (closed)
  const lotPoints =
    plan?.lot?.boundary.flatMap(([x, y]) => {
      const [sx, sy] = transform.toScreen(x, y);
      return [sx, sy];
    }) ?? null;

  // Setback polygon — same
  const setbackPoints =
    plan?.lot?.setback_polygon?.flatMap(([x, y]) => {
      const [sx, sy] = transform.toScreen(x, y);
      return [sx, sy];
    }) ?? null;

  return (
    <div style={{ position: "relative", width, height }}>
      {plan?.lot && <NorthArrow angle={plan.lot.north_angle} />}
      <ScaleRuler scaleMmToPx={transform.scale} stageZoom={scale} />
      {floors && floors.length > 1 && onFloorChange && (
        <FloorSelector
          floors={floors.map((f) => f.floor)}
          activeFloor={activeFloor ?? 1}
          onSelect={onFloorChange}
        />
      )}
      <Stage
        ref={resolvedRef}
        width={width}
        height={height}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        draggable
        onWheel={onWheel}
        onDragEnd={onDragEnd}
        style={{ background: "#fafafa", cursor: "grab" }}
      >
        <GridLayer width={width * 2} height={height * 2} />
        <Layer>
          {/* Lot boundary — thin blue dashed outline (lowest hierarchy) */}
          {lotPoints && (
            <Line
              points={lotPoints}
              closed
              stroke="#0044aa"
              strokeWidth={1.5}
              dash={[12, 6]}
              fill="rgba(0,68,170,0.04)"
            />
          )}

          {/* Setback polygon — green dashed + faint green fill (buildable envelope) */}
          {setbackPoints && (
            <Line
              points={setbackPoints}
              closed
              stroke="#006600"
              strokeWidth={1}
              dash={[8, 4]}
              fill="rgba(0,128,0,0.09)"
            />
          )}

          {/* Walls */}
          {wallFeatures.map((feature, i) => (
            <WallShape
              key={`wall-${i}`}
              coordinates={feature.geometry.coordinates}
              geometryType={feature.geometry.type}
              transform={transform}
            />
          ))}

          {/* Doors */}
          {plan?.doors.map((door, i) => {
            const [sx, sy] = transform.toScreen(door.start[0], door.start[1]);
            const [ex, ey] = transform.toScreen(door.end[0], door.end[1]);
            return (
              <Line
                key={`door-${i}`}
                points={[sx, sy, ex, ey]}
                stroke="#cc0000"
                strokeWidth={2}
                dash={[6, 4]}
              />
            );
          })}

          {/* Windows */}
          {plan?.windows.map((win, i) =>
            win.glass_lines.map((line, li) => {
              const [sx, sy] = transform.toScreen(line[0][0], line[0][1]);
              const [ex, ey] = transform.toScreen(line[1][0], line[1][1]);
              return (
                <Line
                  key={`win-${i}-${li}`}
                  points={[sx, sy, ex, ey]}
                  stroke="#0066cc"
                  strokeWidth={1.5}
                />
              );
            })
          )}

          {/* Room labels */}
          {plan?.rooms.map((room, i) => (
            <RoomLabel key={`room-${i}`} room={room} transform={transform} />
          ))}

          {/* Furniture */}
          {plan?.furniture?.map((furn, i) => (
            <FurnitureShape
              key={`furn-${i}`}
              x={furn.x}
              y={furn.y}
              fixtureType={furn.fixture_type}
              rotation={furn.rotation}
              transform={transform}
            />
          ))}

          {/* Wall dimension annotations */}
          {showDimensions && plan?.wall_segments?.map((ws, i) => (
            <DimensionLabel key={`dim-${i}`} start={ws.start} end={ws.end} transform={transform} />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}
