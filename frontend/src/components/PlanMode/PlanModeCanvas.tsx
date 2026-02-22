import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Stage, Layer, Line, Circle, Text, Rect } from "react-konva";
import { GridLayer } from "../Canvas/GridLayer";
import { DimensionLabel } from "../Canvas/DimensionLabel";
import { useCanvasControls } from "../../hooks/useCanvasControls";
import { createTransform } from "../../utils/coordTransform";
import type { Transform } from "../../utils/coordTransform";
import type {
  PlanModeState,
  WallItem,
  DoorItem,
  WindowItem,
  LabelItem,
  ToolType,
  SelectedElement,
  DrawPhase,
  ElementId,
  GridSnapMm,
} from "../../types/planMode";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";

// ── Snap ───────────────────────────────────────────────────────────────────
function applySnap(
  wx: number,
  wy: number,
  walls: WallItem[],
  transform: Transform,
  panScale: number,
  gridMm: number
): { point: [number, number]; isEndpoint: boolean } {
  const thresholdWorld = 20 / (transform.scale * panScale);
  for (const wall of walls) {
    for (const pt of [wall.start, wall.end] as [number, number][]) {
      if (Math.hypot(pt[0] - wx, pt[1] - wy) < thresholdWorld) {
        return { point: pt, isEndpoint: true };
      }
    }
  }
  const gx = Math.round(wx / gridMm) * gridMm;
  const gy = Math.round(wy / gridMm) * gridMm;
  return { point: [gx, gy], isEndpoint: false };
}

function projectOpeningToNearestWall(
  start: [number, number],
  end: [number, number],
  walls: WallItem[],
): { start: [number, number]; end: [number, number] } {
  if (!walls.length) return { start, end };

  const rawLength = Math.hypot(end[0] - start[0], end[1] - start[1]);
  if (rawLength < 1) return { start, end };

  let best: { start: [number, number]; end: [number, number]; score: number } | null = null;

  for (const wall of walls) {
    const dx = wall.end[0] - wall.start[0];
    const dy = wall.end[1] - wall.start[1];
    const wallLength = Math.hypot(dx, dy);
    if (wallLength < 1) continue;

    const ux = dx / wallLength;
    const uy = dy / wallLength;
    const odx = end[0] - start[0];
    const ody = end[1] - start[1];
    const alignment = Math.abs((odx * ux + ody * uy) / rawLength);
    if (alignment < 0.84) continue;

    const rsx = start[0] - wall.start[0];
    const rsy = start[1] - wall.start[1];
    const rex = end[0] - wall.start[0];
    const rey = end[1] - wall.start[1];

    const projStartRaw = rsx * ux + rsy * uy;
    const projEndRaw = rex * ux + rey * uy;
    const distStart = Math.abs(rsx * -uy + rsy * ux);
    const distEnd = Math.abs(rex * -uy + rey * ux);
    const maxDistance = Math.max(wall.thickness * 0.75, 140);
    if (Math.max(distStart, distEnd) > maxDistance) continue;

    const startMm = Math.max(0, Math.min(wallLength, Math.min(projStartRaw, projEndRaw)));
    const endMm = Math.max(0, Math.min(wallLength, Math.max(projStartRaw, projEndRaw)));
    const projectedLength = endMm - startMm;
    if (projectedLength < 120) continue;

    const projectedStart: [number, number] = [
      wall.start[0] + ux * startMm,
      wall.start[1] + uy * startMm,
    ];
    const projectedEnd: [number, number] = [
      wall.start[0] + ux * endMm,
      wall.start[1] + uy * endMm,
    ];

    const trimPenalty = Math.max(0, rawLength - projectedLength);
    const distancePenalty = (distStart + distEnd) / 2;
    const alignmentPenalty = (1 - alignment) * 250;
    const score = distancePenalty + trimPenalty * 0.35 + alignmentPenalty;

    if (!best || score < best.score) {
      best = { start: projectedStart, end: projectedEnd, score };
    }
  }

  if (!best) return { start, end };
  return { start: best.start, end: best.end };
}

// ── Status text ────────────────────────────────────────────────────────────
function getStatusText(tool: ToolType, phase: DrawPhase): string {
  if (tool === "select") return "Click an element to select it • Scroll to zoom • Drag to pan";
  const names: Partial<Record<ToolType, string>> = {
    draw_wall: "wall",
    draw_door: "door",
    draw_window: "window",
  };
  if (tool === "draw_rect") {
    return phase.phase === "rect_first"
      ? "Click opposite corner — ESC to cancel"
      : "Click first corner of rectangle";
  }
  if (tool === "draw_label") {
    return "Click to place label — ESC to cancel";
  }
  const name = names[tool] ?? tool;
  return phase.phase === "drawing"
    ? `Click to place end of ${name} — ESC to cancel`
    : `Click to place start of ${name}`;
}

// ── Props ──────────────────────────────────────────────────────────────────
interface Props {
  planState: PlanModeState;
  activeTool: ToolType;
  gridSnap: GridSnapMm;
  selectedElement: SelectedElement;
  defaultWallThickness: number;
  defaultDoorSwing: "left" | "right" | "double";
  defaultWindowHeight: number;
  defaultLabelText: string;
  width: number;
  height: number;
  onAddWall: (wall: WallItem) => void;
  onAddWalls: (walls: WallItem[]) => void;
  onAddDoor: (door: DoorItem) => void;
  onAddWindow: (win: WindowItem) => void;
  onAddLabel: (label: LabelItem) => void;
  onSelectElement: (sel: SelectedElement) => void;
  onDeleteElement: (type: string, id: ElementId) => void;
  onToolComplete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  showDimensions?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────
export function PlanModeCanvas({
  planState,
  activeTool,
  gridSnap,
  selectedElement,
  defaultWallThickness,
  defaultDoorSwing,
  defaultWindowHeight,
  defaultLabelText,
  width,
  height,
  onAddWall,
  onAddWalls,
  onAddDoor,
  onAddWindow,
  onAddLabel,
  onSelectElement,
  onDeleteElement,
  onToolComplete,
  onUndo,
  onRedo,
  showDimensions,
}: Props) {
  const { scale: panScale, position: panPos, onWheel, onDragEnd } = useCanvasControls();
  const stageRef = useRef<Konva.Stage>(null);

  const [drawPhase, setDrawPhase] = useState<DrawPhase>({ phase: "idle" });
  const [snapResult, setSnapResult] = useState<{
    point: [number, number];
    isEndpoint: boolean;
  } | null>(null);

  // ── Transform from lot bbox or default ──────────────────────────────────
  const bbox = useMemo((): [number, number, number, number] => {
    if (planState.lot) {
      const { x, y, width: lw, height: lh } = planState.lot;
      const margin = 2000;
      return [x - margin, y - margin, x + lw + margin, y + lh + margin];
    }
    return [0, 0, 15000, 20000];
  }, [planState.lot]);

  const transform = useMemo(
    () => createTransform(bbox, width, height),
    [bbox, width, height]
  );

  // ── Reset draw phase when tool changes ───────────────────────────────────
  useEffect(() => {
    setDrawPhase(activeTool === "select" ? { phase: "idle" } : { phase: "awaiting_start" });
  }, [activeTool]);

  // ── Keyboard handler ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTypingTarget =
        !!target &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          target.isContentEditable);

      if (e.key === "Escape") {
        setDrawPhase({ phase: "awaiting_start" });
      }
      if (!isTypingTarget && (e.key === "Delete" || e.key === "Backspace") && selectedElement) {
        onDeleteElement(selectedElement.type, selectedElement.id);
        onSelectElement(null);
      }
      if (!isTypingTarget && e.ctrlKey && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        onUndo();
      }
      if (!isTypingTarget && e.ctrlKey && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
        e.preventDefault();
        onRedo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedElement, onDeleteElement, onSelectElement, onUndo, onRedo]);

  // ── World coords from stage pointer ─────────────────────────────────────
  const getWorldPos = useCallback((): [number, number] | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const ptr = stage.getPointerPosition();
    if (!ptr) return null;
    const canvasX = (ptr.x - panPos.x) / panScale;
    const canvasY = (ptr.y - panPos.y) / panScale;
    return transform.toWorld(canvasX, canvasY);
  }, [panPos, panScale, transform]);

  // ── Mouse move — update snap ─────────────────────────────────────────────
  const onMouseMove = useCallback(() => {
    if (activeTool === "select") { setSnapResult(null); return; }
    const wp = getWorldPos();
    if (!wp) return;
    const [wx, wy] = wp;
    const snapped = applySnap(wx, wy, planState.walls, transform, panScale, gridSnap);
    setSnapResult(snapped);
  }, [activeTool, getWorldPos, planState.walls, transform, panScale, gridSnap]);

  // ── Click on stage ────────────────────────────────────────────────────────
  const onStageClick = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (activeTool === "select") {
        // In select mode, shape onClick handlers set cancelBubble=true so this
        // only fires when clicking empty canvas — deselect the current element.
        onSelectElement(null);
        return;
      }

      // In draw modes, always place an element at the snap point regardless of
      // whether a shape was also under the cursor (don't guard on e.target).


      const snap = snapResult;
      if (!snap) return;
      const pt = snap.point;

      if (
        activeTool === "draw_wall" ||
        activeTool === "draw_door" ||
        activeTool === "draw_window"
      ) {
        if (drawPhase.phase !== "drawing") {
          setDrawPhase({ phase: "drawing", startPoint: pt });
        } else {
          const start = drawPhase.startPoint;
          const end = pt;
          if (Math.hypot(end[0] - start[0], end[1] - start[1]) < 1) return;

          const projectedOpening =
            activeTool === "draw_door" || activeTool === "draw_window"
              ? projectOpeningToNearestWall(start, end, planState.walls)
              : { start, end };
          const shapeStart = projectedOpening.start;
          const shapeEnd = projectedOpening.end;

          if (activeTool === "draw_wall") {
            onAddWall({
              id: crypto.randomUUID(),
              start: shapeStart,
              end: shapeEnd,
              thickness: defaultWallThickness,
            });
          } else if (activeTool === "draw_door") {
            onAddDoor({
              id: crypto.randomUUID(),
              start: shapeStart,
              end: shapeEnd,
              width: Math.hypot(shapeEnd[0] - shapeStart[0], shapeEnd[1] - shapeStart[1]),
              swing: defaultDoorSwing,
            });
          } else if (activeTool === "draw_window") {
            onAddWindow({
              id: crypto.randomUUID(),
              start: shapeStart,
              end: shapeEnd,
              width: Math.hypot(shapeEnd[0] - shapeStart[0], shapeEnd[1] - shapeStart[1]),
              height: defaultWindowHeight,
            });
          }
          setDrawPhase({ phase: "awaiting_start" });
          onToolComplete();
        }
      } else if (activeTool === "draw_rect") {
        if (drawPhase.phase !== "rect_first") {
          setDrawPhase({ phase: "rect_first", firstCorner: pt });
        } else {
          const [x1, y1] = drawPhase.firstCorner;
          const [x2, y2] = pt;
          const t = defaultWallThickness;
          const id = () => crypto.randomUUID();
          onAddWalls([
            { id: id(), start: [x1, y1], end: [x2, y1], thickness: t },
            { id: id(), start: [x2, y1], end: [x2, y2], thickness: t },
            { id: id(), start: [x2, y2], end: [x1, y2], thickness: t },
            { id: id(), start: [x1, y2], end: [x1, y1], thickness: t },
          ]);
          setDrawPhase({ phase: "awaiting_start" });
          onToolComplete();
        }
      } else if (activeTool === "draw_label") {
        onAddLabel({
          id: crypto.randomUUID(),
          x: pt[0],
          y: pt[1],
          text: defaultLabelText,
          fontSize: 6,
        });
        setDrawPhase({ phase: "awaiting_start" });
        onToolComplete();
      }
    },
    [
      activeTool,
      drawPhase,
      snapResult,
      defaultWallThickness,
      defaultDoorSwing,
      defaultWindowHeight,
      defaultLabelText,
      planState.walls,
      onAddWall,
      onAddWalls,
      onAddDoor,
      onAddWindow,
      onAddLabel,
      onSelectElement,
      onToolComplete,
    ]
  );

  // ── Lot boundary points ──────────────────────────────────────────────────
  const lotPoints = useMemo(() => {
    if (!planState.lot) return null;
    const { x, y, width: lw, height: lh } = planState.lot;
    return [
      [x, y],
      [x + lw, y],
      [x + lw, y + lh],
      [x, y + lh],
    ].flatMap(([px, py]) => transform.toScreen(px, py));
  }, [planState.lot, transform]);

  // ── Setback polygon ──────────────────────────────────────────────────────
  const setbackPoints = useMemo(() => {
    if (!planState.lot) return null;
    const { x, y, width: lw, height: lh } = planState.lot;
    const { front, rear, left, right } = planState.setbacks;
    // Skip if setback makes polygon invalid
    if (left + right >= lw || front + rear >= lh) return null;
    return [
      [x + left, y + front],
      [x + lw - right, y + front],
      [x + lw - right, y + lh - rear],
      [x + left, y + lh - rear],
    ].flatMap(([px, py]) => transform.toScreen(px, py));
  }, [planState.lot, planState.setbacks, transform]);

  // ── Drawing preview ──────────────────────────────────────────────────────
  const preview = useMemo(() => {
    if (!snapResult) return null;
    const endPt = snapResult.point;

    if (drawPhase.phase === "drawing") {
      const [sx, sy] = transform.toScreen(...drawPhase.startPoint);
      const [ex, ey] = transform.toScreen(...endPt);
      const dist = Math.hypot(endPt[0] - drawPhase.startPoint[0], endPt[1] - drawPhase.startPoint[1]);
      const mx = (sx + ex) / 2;
      const my = (sy + ey) / 2;
      return { type: "line" as const, sx, sy, ex, ey, mx, my, dist };
    }
    if (drawPhase.phase === "rect_first") {
      const [x1, y1] = transform.toScreen(...drawPhase.firstCorner);
      const [x2, y2] = transform.toScreen(...endPt);
      return { type: "rect" as const, x1, y1, x2, y2 };
    }
    return null;
  }, [drawPhase, snapResult, transform]);

  // ── Snap indicator screen position ──────────────────────────────────────
  const snapScreen = useMemo(() => {
    if (!snapResult) return null;
    const [sx, sy] = transform.toScreen(...snapResult.point);
    return { sx, sy, isEndpoint: snapResult.isEndpoint };
  }, [snapResult, transform]);

  // ── Element click handler factory ─────────────────────────────────────────
  const makeElementClickHandler = (type: NonNullable<SelectedElement>["type"], id: ElementId) =>
    (e: KonvaEventObject<MouseEvent>) => {
      if (activeTool === "select") {
        e.cancelBubble = true;
        onSelectElement({ type, id });
      }
    };

  const isSelected = (type: string, id: string) =>
    selectedElement?.type === type && selectedElement.id === id;

  const cursor = activeTool === "select" ? "default" : "crosshair";

  return (
    <div style={{ position: "relative", width, height, userSelect: "none" }}>
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        scaleX={panScale}
        scaleY={panScale}
        x={panPos.x}
        y={panPos.y}
        draggable={activeTool === "select"}
        onWheel={onWheel}
        onDragEnd={onDragEnd}
        onMouseMove={onMouseMove}
        onClick={onStageClick}
        style={{ background: "#fafafa", cursor }}
      >
        {/* Grid — world-aligned */}
        <GridLayer
          width={width * 3}
          height={height * 3}
          gridSize={Math.max(4, gridSnap * transform.scale)}
        />

        <Layer>
          {/* Lot boundary */}
          {lotPoints && (
            <Line
              points={lotPoints}
              closed
              stroke="#0044aa"
              strokeWidth={1.5}
              dash={[12, 6]}
              fill="rgba(0,68,170,0.04)"
              listening={false}
            />
          )}

          {/* Setback polygon */}
          {setbackPoints && (
            <Line
              points={setbackPoints}
              closed
              stroke="#006600"
              strokeWidth={1}
              dash={[8, 4]}
              fill="rgba(0,128,0,0.09)"
              listening={false}
            />
          )}

          {/* Walls */}
          {planState.walls.map((wall) => {
            const [sx, sy] = transform.toScreen(...wall.start);
            const [ex, ey] = transform.toScreen(...wall.end);
            const sel = isSelected("wall", wall.id);
            // Render walls with their actual mm thickness so the canvas visually
            // matches the THICK value written in the script (e.g. THICK 200 ≈ 5px).
            const baseWidth = Math.max(2, wall.thickness * transform.scale);
            return (
              <Line
                key={wall.id}
                points={[sx, sy, ex, ey]}
                stroke={sel ? "#ff6600" : "#333333"}
                strokeWidth={sel ? baseWidth + 1 : baseWidth}
                hitStrokeWidth={20}
                onClick={makeElementClickHandler("wall", wall.id)}
              />
            );
          })}

          {/* Doors */}
          {planState.doors.map((door) => {
            const [sx, sy] = transform.toScreen(...door.start);
            const [ex, ey] = transform.toScreen(...door.end);
            const sel = isSelected("door", door.id);
            return (
              <Line
                key={door.id}
                points={[sx, sy, ex, ey]}
                stroke={sel ? "#ff0000" : "#cc0000"}
                strokeWidth={sel ? 3 : 2}
                dash={[6, 4]}
                hitStrokeWidth={20}
                onClick={makeElementClickHandler("door", door.id)}
              />
            );
          })}

          {/* Windows */}
          {planState.windows.map((win) => {
            const [sx, sy] = transform.toScreen(...win.start);
            const [ex, ey] = transform.toScreen(...win.end);
            const sel = isSelected("window", win.id);
            return (
              <Line
                key={win.id}
                points={[sx, sy, ex, ey]}
                stroke={sel ? "#0033ff" : "#0066cc"}
                strokeWidth={sel ? 3 : 2}
                hitStrokeWidth={20}
                onClick={makeElementClickHandler("window", win.id)}
              />
            );
          })}

          {/* Labels — centered at placed coordinate, matches generated-view style */}
          {planState.labels.map((lbl) => {
            const [sx, sy] = transform.toScreen(lbl.x, lbl.y);
            const sel = isSelected("label", lbl.id);
            const fontSize = Math.max(6, Math.min(36, Number.isFinite(lbl.fontSize) ? lbl.fontSize : 6));
            // Keep editor labels strictly compact so they stay inside small rooms.
            const textW = Math.min(220, Math.max(40, lbl.text.length * (fontSize * 0.62) + 12));
            const textH = Math.max(fontSize + 8, Math.min(72, fontSize * 2.2));
            return (
              <Text
                key={lbl.id}
                x={sx - textW / 2}
                y={sy - textH / 2}
                text={lbl.text}
                fontSize={fontSize}
                fontStyle="bold"
                fill={sel ? "#ff6600" : "#444"}
                align="center"
                width={textW}
                height={textH}
                verticalAlign="middle"
                wrap="word"
                ellipsis
                lineHeight={1.05}
                hitStrokeWidth={20}
                onClick={makeElementClickHandler("label", lbl.id)}
              />
            );
          })}

          {/* Wall dimension annotations */}
          {showDimensions && planState.walls.map((w) => (
            <DimensionLabel key={`dim-${w.id}`} start={w.start} end={w.end} transform={transform} />
          ))}

          {/* Selected element endpoint dots */}
          {selectedElement && (() => {
            const el =
              selectedElement.type === "wall"
                ? planState.walls.find((w) => w.id === selectedElement.id)
                : selectedElement.type === "door"
                ? planState.doors.find((d) => d.id === selectedElement.id)
                : selectedElement.type === "window"
                ? planState.windows.find((w) => w.id === selectedElement.id)
                : null;

            if (!el || !("start" in el)) return null;
            const [sx, sy] = transform.toScreen(...el.start);
            const [ex, ey] = transform.toScreen(...el.end);
            return (
              <>
                <Circle x={sx} y={sy} radius={5} fill="#ff6600" listening={false} />
                <Circle x={ex} y={ey} radius={5} fill="#ff6600" listening={false} />
              </>
            );
          })()}

          {/* Drawing preview */}
          {preview?.type === "line" && (
            <>
              <Line
                points={[preview.sx, preview.sy, preview.ex, preview.ey]}
                stroke="#0078d4"
                strokeWidth={1.5}
                dash={[6, 3]}
                opacity={0.7}
                listening={false}
              />
              {/* Start point dot */}
              <Circle
                x={preview.sx}
                y={preview.sy}
                radius={4}
                fill="#0078d4"
                listening={false}
              />
              {/* Dimension label */}
              <Rect
                x={preview.mx - 28}
                y={preview.my - 10}
                width={56}
                height={18}
                fill="rgba(0,120,212,0.85)"
                cornerRadius={3}
                listening={false}
              />
              <Text
                x={preview.mx - 28}
                y={preview.my - 9}
                width={56}
                text={`${(preview.dist / 1000).toFixed(2)} m`}
                fontSize={11}
                fill="#fff"
                align="center"
                listening={false}
              />
            </>
          )}

          {preview?.type === "rect" && (() => {
            const x = Math.min(preview.x1, preview.x2);
            const y = Math.min(preview.y1, preview.y2);
            const rw = Math.abs(preview.x2 - preview.x1);
            const rh = Math.abs(preview.y2 - preview.y1);
            return (
              <Rect
                x={x}
                y={y}
                width={rw}
                height={rh}
                stroke="#0078d4"
                strokeWidth={1.5}
                dash={[6, 3]}
                fill="rgba(0,120,212,0.06)"
                listening={false}
              />
            );
          })()}

          {/* Snap indicator */}
          {snapScreen && activeTool !== "select" && (
            <Circle
              x={snapScreen.sx}
              y={snapScreen.sy}
              radius={6}
              fill={snapScreen.isEndpoint ? "#ff6600" : "#0066cc"}
              opacity={0.85}
              listening={false}
            />
          )}
        </Layer>
      </Stage>

      {/* Status bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "4px 10px",
          background: "rgba(0,0,0,0.55)",
          color: "#eee",
          fontSize: 11,
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {getStatusText(activeTool, drawPhase)}
        {snapResult && activeTool !== "select" && (
          <span style={{ marginLeft: 12, color: "#aaa" }}>
            ({Math.round(snapResult.point[0])}, {Math.round(snapResult.point[1])} mm)
          </span>
        )}
      </div>
    </div>
  );
}
