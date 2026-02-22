import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { FloorPlanResponse, DoorInfo, WindowInfo, WallSegment } from "../../types/plan";
import type { View3DSettings } from "../../types/view3d";

interface Props {
  plan: FloorPlanResponse | null;
  width: number;
  height: number;
  settings: View3DSettings;
  onSettingsChange: (patch: Partial<View3DSettings>) => void;
}

interface NumberSettingInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onCommit: (next: number) => void;
}

interface WallOpening {
  startMm: number;
  endMm: number;
  bottomMm: number;
  topMm: number;
}

interface OpeningProjection {
  startMm: number;
  endMm: number;
  startPoint: [number, number];
  endPoint: [number, number];
  distStartMm: number;
  distEndMm: number;
  alignment: number;
  wallAngleRad: number;
}

type Interval = [number, number];

const MM_TO_M = 0.001;

const ROOM_COLORS = [
  "#f5e6d3",
  "#d3e8f5",
  "#d3f5e6",
  "#f5d3e8",
  "#e8f5d3",
  "#e8d3f5",
  "#f5f0d3",
  "#d3f5f5",
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function subtractInterval(source: Interval[], cut: Interval): Interval[] {
  const [cutStart, cutEnd] = cut;
  if (cutEnd <= cutStart) return source;

  const next: Interval[] = [];
  for (const [start, end] of source) {
    if (cutEnd <= start || cutStart >= end) {
      next.push([start, end]);
      continue;
    }
    if (cutStart > start) {
      next.push([start, cutStart]);
    }
    if (cutEnd < end) {
      next.push([cutEnd, end]);
    }
  }
  return next;
}

function linePose(start: [number, number], end: [number, number], cx: number, cz: number) {
  const widthMm = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
  const midX = ((start[0] + end[0]) / 2) * MM_TO_M - cx;
  const midZ = ((start[1] + end[1]) / 2) * MM_TO_M - cz;

  return { widthMm, angle, midX, midZ };
}

function projectOpeningToWall(
  wall: WallSegment,
  start: [number, number],
  end: [number, number],
  minAlignment = 0.9,
): OpeningProjection | null {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const wallLengthMm = Math.hypot(dx, dz);
  if (wallLengthMm < 1) return null;

  const ux = dx / wallLengthMm;
  const uz = dz / wallLengthMm;

  const odx = end[0] - start[0];
  const odz = end[1] - start[1];
  const openingLengthMm = Math.hypot(odx, odz);
  if (openingLengthMm < 20) return null;

  const alignment = Math.abs((odx * ux + odz * uz) / openingLengthMm);
  if (alignment < minAlignment) return null;

  const rsx = start[0] - wall.start[0];
  const rsz = start[1] - wall.start[1];
  const rex = end[0] - wall.start[0];
  const rez = end[1] - wall.start[1];

  const projStartRaw = rsx * ux + rsz * uz;
  const projEndRaw = rex * ux + rez * uz;
  const distStart = Math.abs(rsx * -uz + rsz * ux);
  const distEnd = Math.abs(rex * -uz + rez * ux);
  const maxDistanceFromWall = Math.max(wall.thickness * 0.75, 120);
  if (Math.max(distStart, distEnd) > maxDistanceFromWall) return null;

  const startMm = clamp(Math.min(projStartRaw, projEndRaw), 0, wallLengthMm);
  const endMm = clamp(Math.max(projStartRaw, projEndRaw), 0, wallLengthMm);
  if (endMm - startMm < 120) return null;

  return {
    startMm,
    endMm,
    startPoint: [wall.start[0] + ux * startMm, wall.start[1] + uz * startMm],
    endPoint: [wall.start[0] + ux * endMm, wall.start[1] + uz * endMm],
    distStartMm: distStart,
    distEndMm: distEnd,
    alignment,
    wallAngleRad: Math.atan2(dz, dx),
  };
}

function anchorOpeningPose(
  walls: WallSegment[],
  start: [number, number],
  end: [number, number],
  cx: number,
  cz: number,
) {
  if (walls.length === 0) return null;

  const rawLength = Math.hypot(end[0] - start[0], end[1] - start[1]);
  let best: { projection: OpeningProjection; score: number } | null = null;

  for (const wall of walls) {
    const projection = projectOpeningToWall(wall, start, end, 0.84);
    if (!projection) continue;

    const projectedLength = projection.endMm - projection.startMm;
    const trimPenalty = Math.max(0, rawLength - projectedLength);
    const distancePenalty = (projection.distStartMm + projection.distEndMm) / 2;
    const alignmentPenalty = (1 - projection.alignment) * 400;
    const score = distancePenalty + trimPenalty * 0.35 + alignmentPenalty;

    if (!best || score < best.score) {
      best = { projection, score };
    }
  }

  if (!best) return null;
  const p = best.projection;
  return linePose(p.startPoint, p.endPoint, cx, cz);
}

function NumberSettingInput({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onCommit,
}: NumberSettingInputProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = clamp(parsed, min, max);
    onCommit(next);
    setDraft(String(next));
  };

  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 11, color: "#d8d8d8" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="number"
          value={draft}
          min={min}
          max={max}
          step={step}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit();
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          style={{
            width: 86,
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.25)",
            color: "#fff",
            borderRadius: 4,
            padding: "4px 6px",
            fontSize: 12,
            outline: "none",
          }}
        />
        {unit && <span style={{ fontSize: 11, color: "#d0d0d0" }}>{unit}</span>}
      </div>
    </label>
  );
}

function buildOpeningsForWall(
  wall: WallSegment,
  doors: DoorInfo[],
  windows: WindowInfo[],
  wallHeightMm: number,
  doorHeightMm: number,
  windowSillMm: number,
): WallOpening[] {
  const openings: WallOpening[] = [];

  const maybeAddOpening = (
    start: [number, number],
    end: [number, number],
    bottomMm: number,
    heightMm: number,
  ) => {
    const projected = projectOpeningToWall(wall, start, end);
    if (!projected) return;
    const { startMm, endMm } = projected;

    const normalizedBottom = clamp(bottomMm, 0, wallHeightMm - 1);
    const normalizedTop = clamp(bottomMm + heightMm, normalizedBottom + 1, wallHeightMm);
    openings.push({
      startMm,
      endMm,
      bottomMm: normalizedBottom,
      topMm: normalizedTop,
    });
  };

  const safeDoorHeight = clamp(doorHeightMm, 1000, wallHeightMm - 40);
  for (const door of doors) {
    maybeAddOpening(door.start, door.end, 0, safeDoorHeight);
  }

  const safeSill = clamp(windowSillMm, 0, wallHeightMm - 200);
  for (const win of windows) {
    const heightMm = clamp(win.height || 1200, 300, wallHeightMm);
    const usableHeight = Math.min(heightMm, wallHeightMm - safeSill - 50);
    if (usableHeight <= 120) continue;
    maybeAddOpening(win.start, win.end, safeSill, usableHeight);
  }

  return openings;
}

const panelStyle: CSSProperties = {
  position: "absolute",
  left: 12,
  bottom: 12,
  width: 292,
  background: "rgba(16, 16, 16, 0.68)",
  color: "#fff",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.15)",
  padding: "10px 12px",
  fontSize: 12,
  display: "grid",
  gap: 10,
  backdropFilter: "blur(4px)",
};

export function ThreeDView({ plan, width, height, settings, onSettingsChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rafIdRef = useRef(0);

  const widthRef = useRef(width);
  const heightRef = useRef(height);
  widthRef.current = width;
  heightRef.current = height;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(widthRef.current, heightRef.current);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    rendererRef.current = renderer;

    const camera = new THREE.PerspectiveCamera(
      50,
      widthRef.current / heightRef.current,
      0.1,
      220,
    );
    camera.position.set(10, 6, 10);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2;
    controls.maxDistance = 120;
    controls.minPolarAngle = 0.2;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controlsRef.current = controls;

    const animate = () => {
      rafIdRef.current = requestAnimationFrame(animate);
      controls.update();
      if (sceneRef.current) {
        renderer.render(sceneRef.current, camera);
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(rafIdRef.current);
      controls.dispose();
      renderer.dispose();
      rendererRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (rendererRef.current) rendererRef.current.setSize(width, height);
    if (cameraRef.current) {
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
    }
  }, [width, height]);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.traverse((obj) => {
        const withGeometry = obj as THREE.Object3D & { geometry?: THREE.BufferGeometry };
        const withMaterial = obj as THREE.Object3D & { material?: THREE.Material | THREE.Material[] };
        if (withGeometry.geometry) {
          withGeometry.geometry.dispose();
        }
        if (withMaterial.material) {
          if (Array.isArray(withMaterial.material)) {
            withMaterial.material.forEach((m) => m.dispose());
          } else {
            withMaterial.material.dispose();
          }
        }
      });
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd7ddd8);
    scene.fog = new THREE.Fog(0xd7ddd8, 24, 74);
    sceneRef.current = scene;

    scene.add(new THREE.AmbientLight(0xffffff, 0.38));
    scene.add(new THREE.HemisphereLight(0xf5fbff, 0xa29483, 0.62));

    const sun = new THREE.DirectionalLight(0xfff6dd, 1.22);
    sun.position.set(12, 22, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -24;
    sun.shadow.camera.right = 24;
    sun.shadow.camera.top = 24;
    sun.shadow.camera.bottom = -24;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0xcde3ff, 0.45);
    fill.position.set(-10, 9, -12);
    scene.add(fill);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshLambertMaterial({ color: 0xb9baaf }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    if (!plan) return;

    const wallHeightMm = clamp(settings.wallHeightMm, 1800, 6000);
    const wallHeightM = wallHeightMm * MM_TO_M;
    const bb = plan.bounding_box;
    const cx = ((bb[0] + bb[2]) / 2) * MM_TO_M;
    const cz = ((bb[1] + bb[3]) / 2) * MM_TO_M;
    const planW = (bb[2] - bb[0]) * MM_TO_M;
    const planD = (bb[3] - bb[1]) * MM_TO_M;

    for (let idx = 0; idx < plan.rooms.length; idx++) {
      const room = plan.rooms[idx];
      if (room.polygon.length < 3) continue;

      const shape = new THREE.Shape();
      const first = room.polygon[0];
      shape.moveTo(first[0] * MM_TO_M - cx, first[1] * MM_TO_M - cz);
      for (let i = 1; i < room.polygon.length; i++) {
        const pt = room.polygon[i];
        shape.lineTo(pt[0] * MM_TO_M - cx, pt[1] * MM_TO_M - cz);
      }
      shape.closePath();

      const mesh = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshLambertMaterial({
          color: new THREE.Color(ROOM_COLORS[idx % ROOM_COLORS.length]),
          side: THREE.DoubleSide,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.002;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x7f6950,
      roughness: 0.84,
      metalness: 0.03,
    });
    const wallEdgeMat = new THREE.LineBasicMaterial({
      color: 0x4a3a2a,
      transparent: true,
      opacity: 0.42,
    });

    const wallSegments = plan.wall_segments ?? [];
    if (wallSegments.length > 0) {
      for (const ws of wallSegments) {
        const dx = ws.end[0] - ws.start[0];
        const dz = ws.end[1] - ws.start[1];
        const lengthMm = Math.hypot(dx, dz);
        if (lengthMm < 1) continue;

        const ux = dx / lengthMm;
        const uz = dz / lengthMm;
        const angle = Math.atan2(dz, dx);
        const thickM = Math.max(ws.thickness * MM_TO_M, 0.1);

        const openings = buildOpeningsForWall(
          ws,
          plan.doors ?? [],
          plan.windows ?? [],
          wallHeightMm,
          settings.doorHeightMm,
          settings.windowSillMm,
        );

        const splitPoints = [0, lengthMm];
        for (const opening of openings) {
          splitPoints.push(Math.round(opening.startMm), Math.round(opening.endMm));
        }
        splitPoints.sort((a, b) => a - b);

        const dedupedSplitPoints: number[] = [];
        for (const point of splitPoints) {
          if (dedupedSplitPoints.length === 0) {
            dedupedSplitPoints.push(point);
            continue;
          }
          const prev = dedupedSplitPoints[dedupedSplitPoints.length - 1];
          if (Math.abs(prev - point) >= 1) {
            dedupedSplitPoints.push(point);
          }
        }

        for (let i = 0; i < dedupedSplitPoints.length - 1; i++) {
          const startMm = dedupedSplitPoints[i];
          const endMm = dedupedSplitPoints[i + 1];
          const pieceLengthMm = endMm - startMm;
          if (pieceLengthMm < 60) continue;

          const overlappingOpenings = openings.filter(
            (opening) => opening.startMm < endMm - 1 && opening.endMm > startMm + 1,
          );

          let spans: Interval[] = [[0, wallHeightMm]];
          for (const opening of overlappingOpenings) {
            spans = subtractInterval(spans, [opening.bottomMm, opening.topMm]);
          }

          for (const [spanBottomMm, spanTopMm] of spans) {
            const pieceHeightMm = spanTopMm - spanBottomMm;
            if (pieceHeightMm < 60) continue;

            const midMm = (startMm + endMm) / 2;
            const midWorldX = ws.start[0] + ux * midMm;
            const midWorldZ = ws.start[1] + uz * midMm;
            const pieceGeom = new THREE.BoxGeometry(
              pieceLengthMm * MM_TO_M,
              pieceHeightMm * MM_TO_M,
              thickM,
            );
            const pieceMesh = new THREE.Mesh(pieceGeom, wallMat);
            pieceMesh.position.set(
              midWorldX * MM_TO_M - cx,
              ((spanBottomMm + spanTopMm) / 2) * MM_TO_M,
              midWorldZ * MM_TO_M - cz,
            );
            pieceMesh.rotation.y = -angle;
            pieceMesh.castShadow = true;
            pieceMesh.receiveShadow = true;
            scene.add(pieceMesh);

            const pieceEdges = new THREE.LineSegments(
              new THREE.EdgesGeometry(pieceGeom, 28),
              wallEdgeMat,
            );
            pieceEdges.position.copy(pieceMesh.position);
            pieceEdges.rotation.copy(pieceMesh.rotation);
            scene.add(pieceEdges);
          }
        }
      }
    } else {
      const wallFeatures =
        plan.walls_geojson?.features?.filter((f) => f.properties?.type === "wall") ?? [];
      for (const feature of wallFeatures) {
        const polygons =
          feature.geometry.type === "Polygon"
            ? [feature.geometry.coordinates as number[][][]]
            : (feature.geometry.coordinates as number[][][][]);

        for (const rings of polygons) {
          if (!rings.length || rings[0].length < 3) continue;
          const shape = new THREE.Shape();
          const outer = rings[0];
          shape.moveTo(outer[0][0] * MM_TO_M - cx, outer[0][1] * MM_TO_M - cz);
          for (let i = 1; i < outer.length; i++) {
            const point = outer[i];
            shape.lineTo(point[0] * MM_TO_M - cx, point[1] * MM_TO_M - cz);
          }
          shape.closePath();

          for (let h = 1; h < rings.length; h++) {
            const hole = rings[h];
            if (hole.length < 3) continue;
            const path = new THREE.Path();
            path.moveTo(hole[0][0] * MM_TO_M - cx, hole[0][1] * MM_TO_M - cz);
            for (let i = 1; i < hole.length; i++) {
              const point = hole[i];
              path.lineTo(point[0] * MM_TO_M - cx, point[1] * MM_TO_M - cz);
            }
            path.closePath();
            shape.holes.push(path);
          }

          try {
            const geom = new THREE.ExtrudeGeometry(shape, {
              depth: wallHeightM,
              bevelEnabled: false,
              steps: 1,
              curveSegments: 1,
            });
            const mesh = new THREE.Mesh(geom, wallMat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.y = 0.001;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            scene.add(mesh);

            const edges = new THREE.LineSegments(
              new THREE.EdgesGeometry(geom, 28),
              wallEdgeMat,
            );
            edges.rotation.copy(mesh.rotation);
            edges.position.copy(mesh.position);
            scene.add(edges);
          } catch {
            // Skip malformed polygon rings and continue rendering the rest.
          }
        }
      }
    }

    const doorFrameMat = new THREE.MeshStandardMaterial({
      color: 0xc5b79f,
      roughness: 0.72,
      metalness: 0.05,
    });
    const doorLeafMat = new THREE.MeshStandardMaterial({
      color: 0x8a5d3b,
      roughness: 0.63,
      metalness: 0.05,
    });
    const windowFrameMat = new THREE.MeshStandardMaterial({
      color: 0xe9ecef,
      roughness: 0.45,
      metalness: 0.1,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x9ec5e6,
      roughness: 0.08,
      metalness: 0.02,
      transparent: true,
      opacity: clamp(settings.glassOpacity, 0.15, 0.9),
    });

    const safeDoorHeightMm = clamp(settings.doorHeightMm, 1200, wallHeightMm - 30);
    const safeDoorHeightM = safeDoorHeightMm * MM_TO_M;
    const safeDoorDepthM = Math.max(settings.doorThicknessMm * MM_TO_M, 0.03);
    for (const door of plan.doors ?? []) {
      const pose =
        anchorOpeningPose(wallSegments, door.start, door.end, cx, cz) ??
        linePose(door.start, door.end, cx, cz);
      if (pose.widthMm < 120) continue;
      const widthM = pose.widthMm * MM_TO_M;

      const group = new THREE.Group();
      group.position.set(pose.midX, safeDoorHeightM / 2, pose.midZ);
      group.rotation.y = -pose.angle;

      const jambW = clamp(Math.min(widthM * 0.08, 0.07), 0.04, 0.07);
      const lintelH = 0.08;

      const leftJamb = new THREE.Mesh(
        new THREE.BoxGeometry(jambW, safeDoorHeightM, safeDoorDepthM),
        doorFrameMat,
      );
      leftJamb.position.x = -widthM / 2 + jambW / 2;
      leftJamb.castShadow = true;
      leftJamb.receiveShadow = true;
      group.add(leftJamb);

      const rightJamb = new THREE.Mesh(
        new THREE.BoxGeometry(jambW, safeDoorHeightM, safeDoorDepthM),
        doorFrameMat,
      );
      rightJamb.position.x = widthM / 2 - jambW / 2;
      rightJamb.castShadow = true;
      rightJamb.receiveShadow = true;
      group.add(rightJamb);

      const lintel = new THREE.Mesh(
        new THREE.BoxGeometry(widthM, lintelH, safeDoorDepthM),
        doorFrameMat,
      );
      lintel.position.y = safeDoorHeightM / 2 - lintelH / 2;
      lintel.castShadow = true;
      lintel.receiveShadow = true;
      group.add(lintel);

      if (door.swing === "double") {
        const halfLeafWidth = Math.max(widthM / 2 - jambW * 1.3, 0.12);
        const leftLeaf = new THREE.Mesh(
          new THREE.BoxGeometry(halfLeafWidth, safeDoorHeightM - lintelH, safeDoorDepthM * 0.62),
          doorLeafMat,
        );
        leftLeaf.position.x = -widthM / 4;
        leftLeaf.position.z = safeDoorDepthM * 0.12;
        leftLeaf.castShadow = true;
        leftLeaf.receiveShadow = true;
        group.add(leftLeaf);

        const rightLeaf = new THREE.Mesh(
          new THREE.BoxGeometry(halfLeafWidth, safeDoorHeightM - lintelH, safeDoorDepthM * 0.62),
          doorLeafMat,
        );
        rightLeaf.position.x = widthM / 4;
        rightLeaf.position.z = safeDoorDepthM * 0.12;
        rightLeaf.castShadow = true;
        rightLeaf.receiveShadow = true;
        group.add(rightLeaf);
      } else {
        const leaf = new THREE.Mesh(
          new THREE.BoxGeometry(
            Math.max(widthM - jambW * 2.1, 0.18),
            safeDoorHeightM - lintelH,
            safeDoorDepthM * 0.62,
          ),
          doorLeafMat,
        );
        leaf.position.z = safeDoorDepthM * 0.12;
        leaf.castShadow = true;
        leaf.receiveShadow = true;
        group.add(leaf);
      }

      scene.add(group);
    }

    const safeWindowSillMm = clamp(settings.windowSillMm, 0, wallHeightMm - 180);
    const safeWindowDepthM = Math.max(settings.windowFrameDepthMm * MM_TO_M, 0.03);
    for (const win of plan.windows ?? []) {
      const pose =
        anchorOpeningPose(wallSegments, win.start, win.end, cx, cz) ??
        linePose(win.start, win.end, cx, cz);
      if (pose.widthMm < 120) continue;

      const winHeightMm = clamp(win.height || 1200, 300, wallHeightMm);
      const usableHeightMm = Math.min(winHeightMm, wallHeightMm - safeWindowSillMm - 40);
      if (usableHeightMm <= 100) continue;

      const widthM = pose.widthMm * MM_TO_M;
      const heightM = usableHeightMm * MM_TO_M;
      const sillM = safeWindowSillMm * MM_TO_M;

      const group = new THREE.Group();
      group.position.set(pose.midX, sillM + heightM / 2, pose.midZ);
      group.rotation.y = -pose.angle;

      const bar = clamp(Math.min(widthM, heightM) * 0.12, 0.035, 0.08);
      const leftFrame = new THREE.Mesh(
        new THREE.BoxGeometry(bar, heightM, safeWindowDepthM),
        windowFrameMat,
      );
      leftFrame.position.x = -widthM / 2 + bar / 2;
      leftFrame.castShadow = true;
      leftFrame.receiveShadow = true;
      group.add(leftFrame);

      const rightFrame = new THREE.Mesh(
        new THREE.BoxGeometry(bar, heightM, safeWindowDepthM),
        windowFrameMat,
      );
      rightFrame.position.x = widthM / 2 - bar / 2;
      rightFrame.castShadow = true;
      rightFrame.receiveShadow = true;
      group.add(rightFrame);

      const topFrame = new THREE.Mesh(
        new THREE.BoxGeometry(widthM, bar, safeWindowDepthM),
        windowFrameMat,
      );
      topFrame.position.y = heightM / 2 - bar / 2;
      topFrame.castShadow = true;
      topFrame.receiveShadow = true;
      group.add(topFrame);

      const bottomFrame = new THREE.Mesh(
        new THREE.BoxGeometry(widthM, bar, safeWindowDepthM),
        windowFrameMat,
      );
      bottomFrame.position.y = -heightM / 2 + bar / 2;
      bottomFrame.castShadow = true;
      bottomFrame.receiveShadow = true;
      group.add(bottomFrame);

      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(
          Math.max(widthM - bar * 2.2, 0.08),
          Math.max(heightM - bar * 2.2, 0.08),
          Math.max(safeWindowDepthM * 0.4, 0.012),
        ),
        glassMat,
      );
      group.add(glass);

      scene.add(group);
    }

    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (camera && controls) {
      const diagonal = Math.max(Math.hypot(planW, planD), 2);
      const radius = Math.max(diagonal * 0.95, 4.2);
      camera.position.set(radius * 0.95, Math.max(wallHeightM * 1.12, radius * 0.54), radius * 1.08);
      controls.target.set(0, wallHeightM * 0.45, 0);
      controls.minDistance = Math.max(diagonal * 0.22, 2);
      controls.maxDistance = Math.max(diagonal * 6, 80);
      controls.update();
    }
  }, [plan, settings]);

  return (
    <div style={{ position: "relative", width, height }}>
      <canvas ref={canvasRef} style={{ display: "block" }} />

      {!plan && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#1d1d1d",
            color: "#c8c8c8",
            fontSize: 15,
          }}
        >
          Generate a plan first to see the 3D preview.
        </div>
      )}

      {plan && (
        <>
          <div style={panelStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 13 }}>3D Details</strong>
              <span style={{ fontSize: 11, color: "#cfcfcf" }}>
                {plan.doors.length} doors / {plan.windows.length} windows
              </span>
            </div>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: "#d8d8d8" }}>Wall height</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="range"
                  min={1800}
                  max={6000}
                  step={50}
                  value={settings.wallHeightMm}
                  onChange={(e) => onSettingsChange({ wallHeightMm: Number(e.target.value) })}
                  style={{ flex: 1, cursor: "pointer" }}
                />
                <span style={{ minWidth: 48, textAlign: "right", fontWeight: 600 }}>
                  {(settings.wallHeightMm / 1000).toFixed(2)} m
                </span>
              </div>
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <NumberSettingInput
                label="Door height"
                value={settings.doorHeightMm}
                min={1000}
                max={4000}
                step={50}
                unit="mm"
                onCommit={(next) => onSettingsChange({ doorHeightMm: next })}
              />
              <NumberSettingInput
                label="Door thickness"
                value={settings.doorThicknessMm}
                min={20}
                max={180}
                step={5}
                unit="mm"
                onCommit={(next) => onSettingsChange({ doorThicknessMm: next })}
              />
              <NumberSettingInput
                label="Window sill"
                value={settings.windowSillMm}
                min={0}
                max={2600}
                step={50}
                unit="mm"
                onCommit={(next) => onSettingsChange({ windowSillMm: next })}
              />
              <NumberSettingInput
                label="Window depth"
                value={settings.windowFrameDepthMm}
                min={20}
                max={180}
                step={5}
                unit="mm"
                onCommit={(next) => onSettingsChange({ windowFrameDepthMm: next })}
              />
            </div>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: "#d8d8d8" }}>Glass opacity</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="range"
                  min={0.15}
                  max={0.9}
                  step={0.05}
                  value={settings.glassOpacity}
                  onChange={(e) => onSettingsChange({ glassOpacity: Number(e.target.value) })}
                  style={{ flex: 1, cursor: "pointer" }}
                />
                <span style={{ minWidth: 40, textAlign: "right", fontWeight: 600 }}>
                  {Math.round(settings.glassOpacity * 100)}%
                </span>
              </div>
            </label>
          </div>

          <div
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              background: "rgba(0,0,0,0.45)",
              color: "#d8d8d8",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 11,
              lineHeight: 1.4,
              pointerEvents: "none",
              backdropFilter: "blur(4px)",
            }}
          >
            Drag to orbit - Scroll to zoom - Right-drag to pan
          </div>
        </>
      )}
    </div>
  );
}
