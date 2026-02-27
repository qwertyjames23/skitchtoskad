import React, { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import type { FloorPlanResponse, DoorInfo, WindowInfo, WallSegment } from "../../types/plan";
import type { View3DSettings } from "../../types/view3d";
import { createPlan3DMapper } from "../../utils/plan3dMapping";

export interface ThreeDCaptureHandle {
  capture: () => string;
}

interface Props {
  plan: FloorPlanResponse | null;
  width: number;
  height: number;
  settings: View3DSettings;
  onSettingsChange: (patch: Partial<View3DSettings>) => void;
  captureRef?: React.RefObject<ThreeDCaptureHandle | null>;
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

function projectOpeningToWall(
  wall: WallSegment,
  start: [number, number],
  end: [number, number],
  minAlignment = 0.9,
): OpeningProjection | null {
  // All arithmetic below is in 2D plan space (mm).  Variable suffix conventions:
  //   x  → plan X axis   dy/uy → plan Y axis (maps to scene Z — NOT a 3D-Z value)
  const dx = wall.end[0] - wall.start[0];
  const dy = wall.end[1] - wall.start[1];
  const wallLengthMm = Math.hypot(dx, dy);
  if (wallLengthMm < 1) return null;

  const ux = dx / wallLengthMm;
  const uy = dy / wallLengthMm;

  const odx = end[0] - start[0];
  const ody = end[1] - start[1];
  const openingLengthMm = Math.hypot(odx, ody);
  if (openingLengthMm < 20) return null;

  const alignment = Math.abs((odx * ux + ody * uy) / openingLengthMm);
  if (alignment < minAlignment) return null;

  const rsx = start[0] - wall.start[0];
  const rsy = start[1] - wall.start[1];
  const rex = end[0] - wall.start[0];
  const rey = end[1] - wall.start[1];

  const projStartRaw = rsx * ux + rsy * uy;
  const projEndRaw = rex * ux + rey * uy;
  const distStart = Math.abs(rsx * -uy + rsy * ux);
  const distEnd = Math.abs(rex * -uy + rey * ux);
  const maxDistanceFromWall = Math.max(wall.thickness * 0.75, 120);
  if (Math.max(distStart, distEnd) > maxDistanceFromWall) return null;

  const startMm = clamp(Math.min(projStartRaw, projEndRaw), 0, wallLengthMm);
  const endMm = clamp(Math.max(projStartRaw, projEndRaw), 0, wallLengthMm);
  if (endMm - startMm < 120) return null;

  return {
    startMm,
    endMm,
    startPoint: [wall.start[0] + ux * startMm, wall.start[1] + uy * startMm],
    endPoint: [wall.start[0] + ux * endMm, wall.start[1] + uy * endMm],
    distStartMm: distStart,
    distEndMm: distEnd,
    alignment,
    wallAngleRad: Math.atan2(dy, dx),
  };
}

function anchorOpeningPose(
  walls: WallSegment[],
  start: [number, number],
  end: [number, number],
  mapper: ReturnType<typeof createPlan3DMapper>,
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
  return mapper.linePose(p.startPoint, p.endPoint);
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

const ROOF_COLOR_PRESETS = [
  { color: "#b04030", name: "Terracotta" },
  { color: "#9ea8a0", name: "Galvanized" },
  { color: "#4a7c59", name: "Forest Green" },
  { color: "#3a3a3a", name: "Charcoal" },
  { color: "#8b7355", name: "Sandstone" },
];

const WALL_COLOR_PRESETS = [
  { color: "#f5efe0", name: "Cream" },
  { color: "#c8b89a", name: "Sand" },
  { color: "#a8a8a0", name: "Gray" },
  { color: "#f4f4f0", name: "White" },
];

const SKY_CONFIGS = {
  day:      { bg: 0x5ba3d4, fog: 0xbde0f5, ground: 0xb9baaf },
  dusk:     { bg: 0x180820, fog: 0xd07030, ground: 0x7a5830 },
  overcast: { bg: 0x7c8490, fog: 0xbcc0c4, ground: 0x8a8c90 },
} as const;

// Poly Haven CDN — CC0 HDRIs (1k .hdr) and PBR diffuse textures (1k .jpg)
const HDRI_URLS: Record<View3DSettings["skyStyle"], string> = {
  day:      "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloppenheim_02_1k.hdr",
  dusk:     "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/evening_road_01_puresky_1k.hdr",
  overcast: "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/overcast_soil_puresky_1k.hdr",
};

const PH_FLOOR_URLS: Record<"tile" | "wood" | "concrete", string> = {
  tile:     "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/tiles_0021/tiles_0021_diff_1k.jpg",
  wood:     "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/wood_floor_deck_01/wood_floor_deck_01_diff_1k.jpg",
  concrete: "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_floor_worn_001/concrete_floor_worn_001_diff_1k.jpg",
};

// Poly Haven PBR maps — roughness + OpenGL normal per floor type (linear colorspace)
const PH_PBR_URLS: Record<"tile" | "wood" | "concrete", { rough: string; nor: string }> = {
  tile: {
    rough: "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/tiles_0021/tiles_0021_rough_1k.jpg",
    nor:   "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/tiles_0021/tiles_0021_nor_gl_1k.jpg",
  },
  wood: {
    rough: "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/wood_floor_deck_01/wood_floor_deck_01_rough_1k.jpg",
    nor:   "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/wood_floor_deck_01/wood_floor_deck_01_nor_gl_1k.jpg",
  },
  concrete: {
    rough: "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_floor_worn_001/concrete_floor_worn_001_rough_1k.jpg",
    nor:   "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_floor_worn_001/concrete_floor_worn_001_nor_gl_1k.jpg",
  },
};

function ColorSwatches({
  label,
  value,
  swatches,
  onChange,
}: {
  label: string;
  value: string;
  swatches: { color: string; name: string }[];
  onChange: (color: string) => void;
}) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 11, color: "#d8d8d8" }}>{label}</span>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {swatches.map(({ color, name }) => (
          <button
            key={color}
            title={name}
            onClick={() => onChange(color)}
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              background: color,
              border:
                value.toLowerCase() === color.toLowerCase()
                  ? "2px solid #fff"
                  : "2px solid rgba(255,255,255,0.25)",
              cursor: "pointer",
              padding: 0,
              flexShrink: 0,
            }}
          />
        ))}
      </div>
    </label>
  );
}

function makeFloorTexture(type: "tile" | "wood" | "concrete"): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;

  if (type === "tile") {
    c.width = 64; c.height = 64;
    ctx.fillStyle = "#e4dfd2";
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = "#c8c4b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(32, 0); ctx.lineTo(32, 64);
    ctx.moveTo(0, 32); ctx.lineTo(64, 32);
    ctx.stroke();
  } else if (type === "wood") {
    c.width = 32; c.height = 128;
    const planks = ["#9b6b3f", "#a37040", "#8c5d38", "#a97848"];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = planks[i];
      ctx.fillRect(0, i * 32, 32, 32);
      ctx.strokeStyle = "rgba(0,0,0,0.07)";
      ctx.lineWidth = 1;
      for (let g = 5; g < 28; g += 7) {
        ctx.beginPath();
        ctx.moveTo(0, i * 32 + g);
        ctx.bezierCurveTo(8, i * 32 + g + 1, 24, i * 32 + g - 1, 32, i * 32 + g);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(0, i * 32 + 31, 32, 2);
    }
  } else {
    c.width = 128; c.height = 128;
    ctx.fillStyle = "#b8b8b2";
    ctx.fillRect(0, 0, 128, 128);
    const img = ctx.getImageData(0, 0, 128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 14;
      img.data[i]   = Math.min(255, Math.max(0, img.data[i]   + n));
      img.data[i+1] = Math.min(255, Math.max(0, img.data[i+1] + n));
      img.data[i+2] = Math.min(255, Math.max(0, img.data[i+2] + n));
    }
    ctx.putImageData(img, 0, 0);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function buildRoomLabel(
  scene: THREE.Scene,
  name: string,
  areaSqM: number,
  x: number,
  y: number,
  z: number,
) {
  const W = 256, H = 88;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.beginPath();
  ctx.roundRect(6, 6, W - 12, H - 12, 8);
  ctx.fill();

  ctx.fillStyle = "#1a1a1a";
  ctx.font = "bold 26px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(name, W / 2, H / 2 + 2);

  ctx.font = "17px sans-serif";
  ctx.fillStyle = "#555";
  ctx.fillText(`${areaSqM.toFixed(1)} m²`, W / 2, H / 2 + 22);

  const tex = new THREE.CanvasTexture(canvas);
  const labelW = 1.8;
  const labelH = labelW / (W / H);

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(labelW, labelH),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.renderOrder = 1;
  scene.add(mesh);
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

function buildRoof(
  scene: THREE.Scene,
  bb: [number, number, number, number],
  wallHeightM: number,
  settings: View3DSettings,
  mapper: ReturnType<typeof createPlan3DMapper>,
) {
  const style = settings.roofStyle;
  if (style === "none") return;

  const overhangM = mapper.toMeters(clamp(settings.roofOverhangMm, 0, 1500));
  const pitchRad = clamp(settings.roofPitchDeg, 5, 60) * (Math.PI / 180);

  // Wall face bounding box (no overhang) — used for soffit inner edge
  const c0 = mapper.toScenePoint([bb[0], bb[1]]);
  const c1 = mapper.toScenePoint([bb[2], bb[3]]);
  const wallXMin = Math.min(c0.x, c1.x);
  const wallXMax = Math.max(c0.x, c1.x);
  const wallZMin = Math.min(c0.z, c1.z);
  const wallZMax = Math.max(c0.z, c1.z);

  // Eave bounding box (with overhang)
  const xMin = wallXMin - overhangM;
  const xMax = wallXMax + overhangM;
  const zMin = wallZMin - overhangM;
  const zMax = wallZMax + overhangM;
  const planW = xMax - xMin;
  const planD = zMax - zMin;
  const cx = (xMin + xMax) / 2;
  const cz = (zMin + zMax) / 2;
  const y = wallHeightM;

  const roofColor = new THREE.Color(settings.roofColor);
  const roofMat = new THREE.MeshStandardMaterial({
    color: roofColor,
    roughness: 0.85,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const soffitMat = new THREE.MeshStandardMaterial({
    color: roofColor.clone().multiplyScalar(0.72),
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const fasciaMat = new THREE.MeshStandardMaterial({
    color: roofColor.clone().multiplyScalar(0.68),
    roughness: 0.85,
  });
  const flatMat = new THREE.MeshStandardMaterial({
    color: 0xc0bdb5,
    roughness: 0.9,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });

  const addMesh = (geom: THREE.BufferGeometry, mat: THREE.Material) => {
    geom.computeVertexNormals();
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };

  // Fascia: thin vertical board along an eave edge
  const fasciaH = 0.18;
  const fasciaD = 0.025;
  const addFascia = (x0: number, z0: number, x1: number, z1: number) => {
    if (overhangM < 0.05) return;
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.05) return;
    const geom = new THREE.BoxGeometry(len, fasciaH, fasciaD);
    geom.computeVertexNormals();
    const mesh = new THREE.Mesh(geom, fasciaMat);
    mesh.position.set((x0 + x1) / 2, y - fasciaH / 2, (z0 + z1) / 2);
    mesh.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    mesh.castShadow = true;
    scene.add(mesh);
  };

  // Soffit: horizontal ring filling the overhang area under the eave
  const addSoffit = () => {
    if (overhangM < 0.05) return;
    // ShapeGeometry is in XY plane; after rotation.x = -PI/2 → world XZ
    // shape.y = -scene.z  (same convention as toShapePoint)
    const outer = new THREE.Shape();
    outer.moveTo(xMin, -zMax);
    outer.lineTo(xMax, -zMax);
    outer.lineTo(xMax, -zMin);
    outer.lineTo(xMin, -zMin);
    outer.closePath();
    const hole = new THREE.Path();
    hole.moveTo(wallXMin, -wallZMin);
    hole.lineTo(wallXMax, -wallZMin);
    hole.lineTo(wallXMax, -wallZMax);
    hole.lineTo(wallXMin, -wallZMax);
    hole.closePath();
    outer.holes.push(hole);
    const geom = new THREE.ShapeGeometry(outer);
    const mesh = new THREE.Mesh(geom, soffitMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y - 0.02;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };

  if (style === "flat") {
    const geom = new THREE.PlaneGeometry(planW, planD);
    const mesh = new THREE.Mesh(geom, flatMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cx, y + 0.06, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    addFascia(xMin, zMin, xMax, zMin);
    addFascia(xMin, zMax, xMax, zMax);
    addFascia(xMin, zMin, xMin, zMax);
    addFascia(xMax, zMin, xMax, zMax);
    addSoffit();
    return;
  }

  if (style === "shed") {
    // Single slope: front (zMin, near camera) is low, back (zMax) is high
    const ridgeH = planD * Math.tan(pitchRad);
    const v = [
      xMin, y,          zMin, // 0 front-left (low eave)
      xMax, y,          zMin, // 1 front-right (low eave)
      xMax, y + ridgeH, zMax, // 2 back-right (high)
      xMin, y + ridgeH, zMax, // 3 back-left (high)
    ];
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    geom.setIndex([0, 1, 2, 0, 2, 3]);
    addMesh(geom, roofMat);
    addFascia(xMin, zMin, xMax, zMin); // front eave only
    addSoffit();
    return;
  }

  if (style === "gable") {
    const ridgeAlongZ = planW >= planD;
    const halfSpan = ridgeAlongZ ? planW / 2 : planD / 2;
    const ridgeH = halfSpan * Math.tan(pitchRad);
    const ridgeY = y + ridgeH;
    let v: number[];
    let indices: number[];
    let eaveSides: [number, number, number, number][];

    if (ridgeAlongZ) {
      v = [
        xMin, y,      zMin,  // 0 left-front eave
        xMax, y,      zMin,  // 1 right-front eave
        xMax, y,      zMax,  // 2 right-back eave
        xMin, y,      zMax,  // 3 left-back eave
        cx,   ridgeY, zMin,  // 4 ridge front
        cx,   ridgeY, zMax,  // 5 ridge back
      ];
      indices = [0, 3, 5, 0, 5, 4, 1, 4, 5, 1, 5, 2, 0, 4, 1, 3, 2, 5];
      eaveSides = [[xMin, zMin, xMax, zMin], [xMin, zMax, xMax, zMax]];
    } else {
      const rH = (planD / 2) * Math.tan(pitchRad);
      const rY = y + rH;
      v = [
        xMin, y,  zMin, // 0
        xMax, y,  zMin, // 1
        xMax, y,  zMax, // 2
        xMin, y,  zMax, // 3
        xMin, rY, cz,   // 4 ridge left
        xMax, rY, cz,   // 5 ridge right
      ];
      indices = [0, 1, 5, 0, 5, 4, 3, 4, 5, 3, 5, 2, 0, 4, 3, 1, 2, 5];
      eaveSides = [[xMin, zMin, xMin, zMax], [xMax, zMin, xMax, zMax]];
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    geom.setIndex(indices);
    addMesh(geom, roofMat);
    for (const [x0, z0, x1, z1] of eaveSides) addFascia(x0, z0, x1, z1);
    addSoffit();
    return;
  }

  if (style === "hip") {
    const ridgeAlongZ = planW >= planD;
    const longSpan = ridgeAlongZ ? planW : planD;
    const shortSpan = ridgeAlongZ ? planD : planW;
    const ridgeH = (shortSpan / 2) * Math.tan(pitchRad);
    const ridgeY = y + ridgeH;
    const ridgeLen = Math.max(longSpan - shortSpan, 0);
    let v: number[];
    let indices: number[];

    if (ridgeAlongZ) {
      const rz0 = cz - ridgeLen / 2;
      const rz1 = cz + ridgeLen / 2;
      v = [
        xMin, y,      zMin, // 0
        xMax, y,      zMin, // 1
        xMax, y,      zMax, // 2
        xMin, y,      zMax, // 3
        cx,   ridgeY, rz0,  // 4
        cx,   ridgeY, rz1,  // 5
      ];
      indices = [0, 3, 5, 0, 5, 4, 1, 4, 5, 1, 5, 2, 0, 4, 1, 3, 2, 5];
    } else {
      const rx0 = cx - ridgeLen / 2;
      const rx1 = cx + ridgeLen / 2;
      v = [
        xMin, y,      zMin, // 0
        xMax, y,      zMin, // 1
        xMax, y,      zMax, // 2
        xMin, y,      zMax, // 3
        rx0,  ridgeY, cz,   // 4
        rx1,  ridgeY, cz,   // 5
      ];
      indices = [0, 1, 5, 0, 5, 4, 3, 4, 5, 3, 5, 2, 0, 4, 3, 1, 2, 5];
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    geom.setIndex(indices);
    addMesh(geom, roofMat);
    addFascia(xMin, zMin, xMax, zMin);
    addFascia(xMin, zMax, xMax, zMax);
    addFascia(xMin, zMin, xMin, zMax);
    addFascia(xMax, zMin, xMax, zMax);
    addSoffit();
  }
}

// ── Furniture placement ────────────────────────────────────────────────────

type RoomType = "sala" | "bedroom" | "kitchen_dining" | "bathroom" | "hallway" | "unknown";

function detectRoomType(name: string): RoomType {
  const n = name.toLowerCase();
  if (/sala|living|lounge/.test(n)) return "sala";
  if (/bedroom|kwarto/.test(n) || /room\s*\d/.test(n)) return "bedroom";
  if (/kitchen|dining|kusina/.test(n)) return "kitchen_dining";
  if (/cr\b|comfort\s*room|toilet|bath|banyo/.test(n)) return "bathroom";
  if (/hall|corridor|lobby|foyer/.test(n)) return "hallway";
  return "unknown";
}

function furnitureMat(hex: number, roughness = 0.75) {
  return new THREE.MeshStandardMaterial({ color: hex, roughness, metalness: 0.04 });
}

function addBox(
  group: THREE.Group,
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  mat: THREE.Material,
  rotY = 0,
) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
}

function buildBedroom(
  group: THREE.Group,
  roomWm: number, roomDm: number,
  backZ: number,
  centroid: { x: number; z: number },
) {
  const bedW = clamp(roomWm * 0.55, 0.9, 1.8);
  const bedL = 1.95;
  // Bed placed against back wall, centered on X
  const bedX = centroid.x;
  const bedZ = backZ + bedL / 2 + 0.15; // slight gap from wall

  const darkWood = furnitureMat(0x6b4f3a);
  const cream    = furnitureMat(0xf2ede0, 0.85);
  const white    = furnitureMat(0xfafafa, 0.9);

  // Frame
  addBox(group, bedW, 0.35, bedL, bedX, 0.175, bedZ, darkWood);
  // Mattress
  addBox(group, bedW - 0.06, 0.14, bedL - 0.25, bedX, 0.245 + 0.07, bedZ + 0.06, cream);
  // Two pillows (at head = near backZ)
  const pilW = bedW / 2.2 - 0.04;
  addBox(group, pilW, 0.08, 0.35, bedX - bedW / 4 + 0.02, 0.34 + 0.04, bedZ - bedL / 2 + 0.25, white);
  addBox(group, pilW, 0.08, 0.35, bedX + bedW / 4 - 0.02, 0.34 + 0.04, bedZ - bedL / 2 + 0.25, white);
  // Headboard against back wall
  addBox(group, bedW, 0.65, 0.08, bedX, 0.475, backZ + 0.05, darkWood);

  // Wardrobe against left wall (minimum X side)
  const wardW = Math.min(roomWm * 0.3, 1.2);
  const leftX = centroid.x - roomWm / 2 + wardW / 2 + 0.04;
  addBox(group, wardW, 2.0, 0.55, leftX, 1.0, backZ + 0.3, furnitureMat(0x8a6545));
}

function buildSala(
  group: THREE.Group,
  roomWm: number,
  backZ: number,
  centroid: { x: number; z: number },
) {
  const sofaW = clamp(roomWm * 0.55, 1.5, 2.4);
  // Sofa at back 1/3 of room
  const sofaZ = backZ + 0.55;
  const sofaX = centroid.x;

  const caramel = furnitureMat(0x7a5c3a);
  const leg     = furnitureMat(0x4a3520, 0.6);

  // Sofa base
  addBox(group, sofaW, 0.42, 0.85, sofaX, 0.21, sofaZ, caramel);
  // Sofa back rest
  addBox(group, sofaW, 0.5, 0.18, sofaX, 0.21 + 0.42 / 2 + 0.25, sofaZ - 0.85 / 2 + 0.09, caramel);
  // Left armrest
  addBox(group, 0.18, 0.52, 0.85, sofaX - sofaW / 2 + 0.09, 0.21 + 0.05, sofaZ, caramel);
  // Right armrest
  addBox(group, 0.18, 0.52, 0.85, sofaX + sofaW / 2 - 0.09, 0.21 + 0.05, sofaZ, caramel);

  // Coffee table in front of sofa
  const tableW = sofaW * 0.5;
  const tableZ = sofaZ + 0.75;
  const oak = furnitureMat(0xb8915a);
  addBox(group, tableW, 0.05, 0.5, sofaX, 0.38, tableZ, oak);
  // Table legs
  addBox(group, 0.04, 0.36, 0.04, sofaX - tableW / 2 + 0.06, 0.18, tableZ - 0.21, leg);
  addBox(group, 0.04, 0.36, 0.04, sofaX + tableW / 2 - 0.06, 0.18, tableZ - 0.21, leg);
  addBox(group, 0.04, 0.36, 0.04, sofaX - tableW / 2 + 0.06, 0.18, tableZ + 0.21, leg);
  addBox(group, 0.04, 0.36, 0.04, sofaX + tableW / 2 - 0.06, 0.18, tableZ + 0.21, leg);
}

function buildDining(
  group: THREE.Group,
  centroid: { x: number; z: number },
) {
  const wood  = furnitureMat(0x8b5e3c);
  const dark  = furnitureMat(0x4a2e1a, 0.6);
  const seat  = furnitureMat(0xc8a87a);

  // Table top
  addBox(group, 1.4, 0.075, 0.8, centroid.x, 0.7, centroid.z, wood);
  // Table legs
  const lx = 0.6, lz = 0.32;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.68, 8), dark);
    leg.position.set(centroid.x + sx * lx, 0.34, centroid.z + sz * lz);
    leg.castShadow = true;
    group.add(leg);
  }
  // 4 chairs at N/E/S/W
  const chairOffsets: [number, number, number][] = [
    [0, -0.7, 0], [0, 0.7, Math.PI],
    [-0.95, 0, Math.PI / 2], [0.95, 0, -Math.PI / 2],
  ];
  for (const [ox, oz, ry] of chairOffsets) {
    const cx = centroid.x + ox;
    const cz = centroid.z + oz;
    // Seat
    addBox(group, 0.45, 0.06, 0.45, cx, 0.45, cz, seat);
    // Back
    addBox(group, 0.45, 0.4, 0.05, cx, 0.45 + 0.23, cz - 0.2, seat, ry);
    // Legs
    for (const [lox, loz] of [[-0.18, -0.18], [0.18, -0.18], [0.18, 0.18], [-0.18, 0.18]]) {
      const cl = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 6), dark);
      cl.position.set(cx + lox, 0.225, cz + loz);
      group.add(cl);
    }
  }
}

function buildBathroom(
  group: THREE.Group,
  leftX: number, rightX: number,
  backZ: number,
  centroid: { x: number; z: number },
) {
  const white   = furnitureMat(0xf4f4f4, 0.25);
  const ceramic = furnitureMat(0xe8e8e8, 0.2);

  // Toilet near back-right corner
  const toiletX = rightX - 0.28;
  const toiletZ = backZ + 0.3;
  // Bowl
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.38, 12), white);
  bowl.position.set(toiletX, 0.19, toiletZ);
  bowl.castShadow = true;
  group.add(bowl);
  // Tank
  addBox(group, 0.36, 0.35, 0.18, toiletX, 0.175 + 0.38 / 2 - 0.01, toiletZ - 0.25, ceramic);

  // Sink near back-left corner
  const sinkX = leftX + 0.35;
  const sinkZ = backZ + 0.3;
  addBox(group, 0.55, 0.2, 0.45, sinkX, 0.82, sinkZ, white);
  // Pedestal
  addBox(group, 0.14, 0.72, 0.14, sinkX, 0.36, sinkZ - 0.08, ceramic);
}

function buildRoomFurniture(
  scene: THREE.Scene,
  room: { name: string; centroid: [number, number]; polygon: number[][]; dimensions_mm: { width: number; height: number } },
  mapper: ReturnType<typeof createPlan3DMapper>,
) {
  const type = detectRoomType(room.name);
  if (type === "unknown" || type === "hallway") return;

  const xs = room.polygon.map(p => p[0]);
  const ys = room.polygon.map(p => p[1]);
  const pMaxY = Math.max(...ys);
  const pMinY = Math.min(...ys);
  const pMinX = Math.min(...xs);
  const pMaxX = Math.max(...xs);

  const centroid  = mapper.toScenePoint(room.centroid as [number, number]);
  const backZ  = mapper.toScenePoint([room.centroid[0], pMaxY]).z;
  const frontZ = mapper.toScenePoint([room.centroid[0], pMinY]).z;
  const leftX  = mapper.toScenePoint([pMinX, room.centroid[1]]).x;
  const rightX = mapper.toScenePoint([pMaxX, room.centroid[1]]).x;
  const roomWm = room.dimensions_mm.width  * mapper.mmToM;
  const roomDm = room.dimensions_mm.height * mapper.mmToM;

  // Skip tiny rooms (less than 1.5m × 1.5m)
  if (roomWm < 1.5 || roomDm < 1.5) return;

  const group = new THREE.Group();
  if (type === "bedroom")        buildBedroom(group, roomWm, roomDm, backZ, centroid);
  if (type === "sala")           buildSala(group, roomWm, backZ, centroid);
  if (type === "kitchen_dining") buildDining(group, centroid);
  if (type === "bathroom")       buildBathroom(group, leftX, rightX, backZ, centroid);
  scene.add(group);
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

export function ThreeDView({ plan, width, height, settings, onSettingsChange, captureRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rafIdRef = useRef(0);
  // Caches survive scene rebuilds; keyed by URL
  const hdriCacheRef = useRef<Map<string, THREE.Texture>>(new Map());
  const phTexCacheRef = useRef<Map<string, THREE.Texture>>(new Map());
  // Bumped when an async asset loads → triggers scene rebuild
  const [phVersion, setPhVersion] = useState(0);
  const [rendererReady, setRendererReady] = useState(false);

  const widthRef = useRef(width);
  const heightRef = useRef(height);
  widthRef.current = width;
  heightRef.current = height;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
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
    setRendererReady(true);

    return () => {
      cancelAnimationFrame(rafIdRef.current);
      controls.dispose();
      renderer.dispose();
      rendererRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      // Dispose all cached PH assets
      hdriCacheRef.current.forEach((t) => t.dispose());
      hdriCacheRef.current.clear();
      phTexCacheRef.current.forEach((t) => t.dispose());
      phTexCacheRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (rendererRef.current) rendererRef.current.setSize(width, height);
    if (cameraRef.current) {
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
    }
  }, [width, height]);

  // ── Expose capture handle to parent ───────────────────────────────────────
  useEffect(() => {
    if (!captureRef) return;
    captureRef.current = {
      capture: () => rendererRef.current?.domElement.toDataURL("image/png") ?? "",
    };
    return () => { captureRef.current = null; };
  }, [captureRef]);

  // ── Poly Haven HDRI loading ────────────────────────────────────────────────
  useEffect(() => {
    if (!rendererReady || !rendererRef.current) return;
    const url = HDRI_URLS[settings.skyStyle];
    if (hdriCacheRef.current.has(url)) return; // already cached

    const renderer = rendererRef.current;
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    let cancelled = false;

    new RGBELoader().load(
      url,
      (hdrTex) => {
        if (cancelled) { hdrTex.dispose(); pmrem.dispose(); return; }
        const rt = pmrem.fromEquirectangular(hdrTex);
        hdrTex.dispose();
        pmrem.dispose();
        hdriCacheRef.current.set(url, rt.texture);
        setPhVersion((v) => v + 1);
      },
      undefined,
      () => pmrem.dispose(), // fail silently — solid-color sky used as fallback
    );

    return () => { cancelled = true; };
  }, [rendererReady, settings.skyStyle]);

  // ── Poly Haven PBR floor texture loading (diffuse + roughness + normal) ──
  useEffect(() => {
    if (settings.floorTexture === "none") return;
    const type = settings.floorTexture as "tile" | "wood" | "concrete";
    let cancelled = false;

    const loadTex = (url: string, srgb: boolean) => {
      if (!url || phTexCacheRef.current.has(url)) return;
      new THREE.TextureLoader().load(url, (tex) => {
        if (cancelled) { tex.dispose(); return; }
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        phTexCacheRef.current.set(url, tex);
        setPhVersion((v) => v + 1);
      }, undefined, () => {}); // fail silently
    };

    loadTex(PH_FLOOR_URLS[type], true);          // diffuse  — sRGB
    loadTex(PH_PBR_URLS[type].rough, false);     // roughness — linear
    loadTex(PH_PBR_URLS[type].nor,   false);     // normal    — linear

    return () => { cancelled = true; };
  }, [settings.floorTexture]);

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
    const sky = SKY_CONFIGS[settings.skyStyle] ?? SKY_CONFIGS.day;

    // Use Poly Haven HDRI if loaded, otherwise fall back to solid colour + fog
    const hdriEnv = hdriCacheRef.current.get(HDRI_URLS[settings.skyStyle]) ?? null;
    if (hdriEnv) {
      scene.environment = hdriEnv;
      scene.background = hdriEnv;
      if (rendererRef.current) {
        rendererRef.current.toneMappingExposure = settings.skyStyle === "dusk" ? 0.68 : 1.02;
      }
    } else {
      scene.background = new THREE.Color(sky.bg);
      scene.fog = new THREE.Fog(sky.fog, 24, 74);
    }

    sceneRef.current = scene;

    // Reduce manual ambient when IBL is active (HDRI provides it)
    const hasHdri = hdriEnv !== null;
    scene.add(new THREE.AmbientLight(0xffffff, hasHdri ? 0.12 : 0.38));
    scene.add(new THREE.HemisphereLight(0xf5fbff, 0xa29483, hasHdri ? 0.22 : 0.62));

    const sunIntensity = settings.skyStyle === "overcast" ? 0.35 : hasHdri ? 0.88 : 1.22;
    const sun = new THREE.DirectionalLight(0xfff6dd, sunIntensity);
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

    const fillColor = settings.skyStyle === "dusk" ? 0xffb060 : 0xcde3ff;
    const fill = new THREE.DirectionalLight(fillColor, 0.45);
    fill.position.set(-10, 9, -12);
    scene.add(fill);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshLambertMaterial({ color: sky.ground }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    if (!plan) return;

    const mapper = createPlan3DMapper(plan.bounding_box);
    const wallHeightMm = clamp(settings.wallHeightMm, 1800, 6000);
    const wallHeightM = mapper.toMeters(wallHeightMm);
    const bb = plan.bounding_box;
    const planW = (bb[2] - bb[0]) * mapper.mmToM;
    const planD = (bb[3] - bb[1]) * mapper.mmToM;

    // Prefer Poly Haven PBR texture if already loaded, fall back to canvas texture
    const baseFloorTex = (() => {
      if (settings.floorTexture === "none") return null;
      const url = PH_FLOOR_URLS[settings.floorTexture as "tile" | "wood" | "concrete"];
      const cached = url ? phTexCacheRef.current.get(url) : null;
      return cached ?? makeFloorTexture(settings.floorTexture);
    })();

    const ceilMat = new THREE.MeshStandardMaterial({
      color: 0xf8f4ec,
      roughness: 0.95,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
    });

    for (let idx = 0; idx < plan.rooms.length; idx++) {
      const room = plan.rooms[idx];
      if (room.polygon.length < 3) continue;

      const shape = new THREE.Shape();
      const first: [number, number] = [room.polygon[0][0], room.polygon[0][1]];
      const firstShape = mapper.toShapePoint(first);
      shape.moveTo(firstShape.x, firstShape.y);
      for (let i = 1; i < room.polygon.length; i++) {
        const pt: [number, number] = [room.polygon[i][0], room.polygon[i][1]];
        const shapePoint = mapper.toShapePoint(pt);
        shape.lineTo(shapePoint.x, shapePoint.y);
      }
      shape.closePath();

      // Floor — MeshStandardMaterial for full PBR support (roughnessMap + normalMap)
      let floorMat: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
      if (baseFloorTex && settings.floorTexture !== "none") {
        const fType = settings.floorTexture as "tile" | "wood" | "concrete";
        const tileM = fType === "wood" ? 0.12 : 0.30;
        const rW = (room.dimensions_mm.width  * mapper.mmToM) / tileM;
        const rH = (room.dimensions_mm.height * mapper.mmToM) / tileM;

        const cloneRepeat = (src: THREE.Texture): THREE.Texture => {
          const t = src.clone();
          t.repeat.set(rW, rH);
          t.needsUpdate = true;
          return t;
        };

        const diffTex   = cloneRepeat(baseFloorTex);
        const roughTex  = phTexCacheRef.current.get(PH_PBR_URLS[fType].rough) ?? null;
        const norTex    = phTexCacheRef.current.get(PH_PBR_URLS[fType].nor)   ?? null;

        floorMat = new THREE.MeshStandardMaterial({
          map:          diffTex,
          roughnessMap: roughTex ? cloneRepeat(roughTex) as THREE.Texture : undefined,
          roughness:    roughTex ? 1.0 : 0.75,
          normalMap:    norTex   ? cloneRepeat(norTex)   as THREE.Texture : undefined,
          normalScale:  norTex   ? new THREE.Vector2(0.8, 0.8) : undefined,
          metalness: 0,
          side: THREE.DoubleSide,
        });
      } else {
        floorMat = new THREE.MeshLambertMaterial({
          color: new THREE.Color(ROOM_COLORS[idx % ROOM_COLORS.length]),
          side: THREE.DoubleSide,
        });
      }
      const floorMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), floorMat);
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.position.y = 0.002;
      floorMesh.receiveShadow = true;
      scene.add(floorMesh);

      // Ceiling
      if (settings.showCeiling) {
        const ceilMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), ceilMat);
        ceilMesh.rotation.x = -Math.PI / 2;
        ceilMesh.position.y = wallHeightM - 0.005;
        scene.add(ceilMesh);
      }

      // Room label
      const centroid = mapper.toScenePoint(room.centroid as [number, number]);
      buildRoomLabel(scene, room.name, room.area_sq_m, centroid.x, 0.04, centroid.z);

      // Furniture
      if (settings.showFurniture) {
        buildRoomFurniture(scene, room, mapper);
      }
    }

    const wallMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(settings.wallColor),
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
        const dy = ws.end[1] - ws.start[1];
        const lengthMm = Math.hypot(dx, dy);
        if (lengthMm < 1) continue;

        // Use the mapper for all coordinate conversions so orientation is
        // guaranteed to match the 2D plan (no accidental axis flip).
        const rotY = mapper.wallRotationY(ws.start, ws.end);
        const thickM = Math.max(mapper.toMeters(ws.thickness), 0.1);

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
            // Advance along the wall in plan space, then convert to scene coords.
            // This keeps orientation intact and avoids raw Y-as-Z arithmetic here.
            const midScene = mapper.toScenePoint(mapper.advancePoint(ws.start, ws.end, midMm));
            const pieceGeom = new THREE.BoxGeometry(
              mapper.toMeters(pieceLengthMm),
              mapper.toMeters(pieceHeightMm),
              thickM,
            );
            const pieceMesh = new THREE.Mesh(pieceGeom, wallMat);
            pieceMesh.position.set(
              midScene.x,
              mapper.toMeters((spanBottomMm + spanTopMm) / 2),
              midScene.z,
            );
            pieceMesh.rotation.y = rotY;
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
          const firstOuter = mapper.toShapePoint([outer[0][0], outer[0][1]]);
          shape.moveTo(firstOuter.x, firstOuter.y);
          for (let i = 1; i < outer.length; i++) {
            const point = outer[i];
            const shapePoint = mapper.toShapePoint([point[0], point[1]]);
            shape.lineTo(shapePoint.x, shapePoint.y);
          }
          shape.closePath();

          for (let h = 1; h < rings.length; h++) {
            const hole = rings[h];
            if (hole.length < 3) continue;
            const path = new THREE.Path();
            const firstHole = mapper.toShapePoint([hole[0][0], hole[0][1]]);
            path.moveTo(firstHole.x, firstHole.y);
            for (let i = 1; i < hole.length; i++) {
              const point = hole[i];
              const shapePoint = mapper.toShapePoint([point[0], point[1]]);
              path.lineTo(shapePoint.x, shapePoint.y);
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
    // MeshPhysicalMaterial: physically accurate glass with transmission + IOR
    // glassOpacity 0.45 → transmission 0.55 (55% of light passes through)
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.02,
      transmission: clamp(1 - settings.glassOpacity, 0.1, 0.9),
      thickness: 0.004,
      ior: 1.5,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
    });

    const safeDoorHeightMm = clamp(settings.doorHeightMm, 1200, wallHeightMm - 30);
    const safeDoorHeightM = mapper.toMeters(safeDoorHeightMm);
    const safeDoorDepthM = Math.max(mapper.toMeters(settings.doorThicknessMm), 0.03);
    for (const door of plan.doors ?? []) {
      // Use the door's exact start/end from the plan so 3D matches 2D placement.
      // Projecting to nearest wall can shift positions; prefer exact coordinates.
      const pose = mapper.linePose(door.start, door.end);
      if (pose.widthMm < 120) continue;
      const widthM = mapper.toMeters(pose.widthMm);

      const group = new THREE.Group();
      group.position.set(pose.midX, safeDoorHeightM / 2, pose.midZ);
      group.rotation.y = mapper.wallRotationY(door.start, door.end);

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

      // tag group with element id if present so updates/removals can be correlated
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (group as any).userData = { elementId: (door as any).id };
      } catch {}
      scene.add(group);
    }

    const safeWindowSillMm = clamp(settings.windowSillMm, 0, wallHeightMm - 180);
    const safeWindowDepthM = Math.max(mapper.toMeters(settings.windowFrameDepthMm), 0.03);
    for (const win of plan.windows ?? []) {
      // Use the window's exact start/end from the plan so 3D matches 2D placement.
      const pose = mapper.linePose(win.start, win.end);
      if (pose.widthMm < 120) continue;

      const winHeightMm = clamp(win.height || 1200, 300, wallHeightMm);
      const usableHeightMm = Math.min(winHeightMm, wallHeightMm - safeWindowSillMm - 40);
      if (usableHeightMm <= 100) continue;

      const widthM = mapper.toMeters(pose.widthMm);
      const heightM = mapper.toMeters(usableHeightMm);
      const sillM = mapper.toMeters(safeWindowSillMm);

      const group = new THREE.Group();
      group.position.set(pose.midX, sillM + heightM / 2, pose.midZ);
      group.rotation.y = mapper.wallRotationY(win.start, win.end);

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

      // tag window group with element id for correlation
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (group as any).userData = { elementId: (win as any).id };
      } catch {}
      scene.add(group);
    }

    buildRoof(scene, plan.bounding_box, wallHeightM, settings, mapper);

    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (camera && controls) {
      const diagonal = Math.max(Math.hypot(planW, planD), 2);
      const radius = Math.max(diagonal * 0.95, 4.2);
      // Keep default camera azimuth aligned with plan axes (no implicit model rotation).
      camera.position.set(0, Math.max(wallHeightM * 1.12, radius * 0.54), radius * 1.45);
      controls.target.set(0, wallHeightM * 0.45, 0);
      controls.minDistance = Math.max(diagonal * 0.22, 2);
      controls.maxDistance = Math.max(diagonal * 6, 80);
      controls.update();
    }
  }, [plan, settings, phVersion]);

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

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 8, display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11, color: "#d8d8d8" }}>Roof style</span>
                <select
                  value={settings.roofStyle}
                  onChange={(e) => onSettingsChange({ roofStyle: e.target.value as View3DSettings["roofStyle"] })}
                  style={{
                    background: "#2a2a2a",
                    border: "1px solid rgba(255,255,255,0.25)",
                    color: "#fff",
                    borderRadius: 4,
                    padding: "4px 6px",
                    fontSize: 12,
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  <option value="none">None</option>
                  <option value="flat">Flat</option>
                  <option value="gable">Gable</option>
                  <option value="hip">Hip</option>
                  <option value="shed">Shed (lean-to)</option>
                </select>
              </label>

              {settings.roofStyle !== "none" && (
                <NumberSettingInput
                  label="Overhang"
                  value={settings.roofOverhangMm}
                  min={0}
                  max={1500}
                  step={50}
                  unit="mm"
                  onCommit={(next) => onSettingsChange({ roofOverhangMm: next })}
                />
              )}

              {settings.roofStyle !== "none" && settings.roofStyle !== "flat" && (
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 11, color: "#d8d8d8" }}>Pitch</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="range"
                      min={5}
                      max={60}
                      step={1}
                      value={settings.roofPitchDeg}
                      onChange={(e) => onSettingsChange({ roofPitchDeg: Number(e.target.value) })}
                      style={{ flex: 1, cursor: "pointer" }}
                    />
                    <span style={{ minWidth: 36, textAlign: "right", fontWeight: 600 }}>
                      {settings.roofPitchDeg}°
                    </span>
                  </div>
                </label>
              )}

              {settings.roofStyle !== "none" && (
                <ColorSwatches
                  label="Roof color"
                  value={settings.roofColor}
                  swatches={ROOF_COLOR_PRESETS}
                  onChange={(color) => onSettingsChange({ roofColor: color })}
                />
              )}
            </div>

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 8, display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11, color: "#d8d8d8" }}>Floor texture</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {(["none", "tile", "wood", "concrete"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => onSettingsChange({ floorTexture: t })}
                      style={{
                        flex: 1,
                        padding: "3px 0",
                        fontSize: 10,
                        borderRadius: 4,
                        border: settings.floorTexture === t
                          ? "1px solid #fff"
                          : "1px solid rgba(255,255,255,0.25)",
                        background: settings.floorTexture === t
                          ? "rgba(255,255,255,0.25)"
                          : "rgba(255,255,255,0.08)",
                        color: "#fff",
                        cursor: "pointer",
                        textTransform: "capitalize",
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={settings.showCeiling}
                  onChange={(e) => onSettingsChange({ showCeiling: e.target.checked })}
                  style={{ width: 14, height: 14, cursor: "pointer" }}
                />
                <span style={{ fontSize: 11, color: "#d8d8d8" }}>Show ceiling</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={settings.showFurniture}
                  onChange={(e) => onSettingsChange({ showFurniture: e.target.checked })}
                  style={{ width: 14, height: 14, cursor: "pointer" }}
                />
                <span style={{ fontSize: 11, color: "#d8d8d8" }}>Show furniture</span>
              </label>

              <ColorSwatches
                label="Wall color"
                value={settings.wallColor}
                swatches={WALL_COLOR_PRESETS}
                onChange={(color) => onSettingsChange({ wallColor: color })}
              />

              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11, color: "#d8d8d8" }}>Sky</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {(["day", "dusk", "overcast"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => onSettingsChange({ skyStyle: s })}
                      style={{
                        flex: 1,
                        padding: "3px 0",
                        fontSize: 11,
                        borderRadius: 4,
                        border: settings.skyStyle === s
                          ? "1px solid #fff"
                          : "1px solid rgba(255,255,255,0.25)",
                        background: settings.skyStyle === s
                          ? "rgba(255,255,255,0.25)"
                          : "rgba(255,255,255,0.08)",
                        color: "#fff",
                        cursor: "pointer",
                        textTransform: "capitalize",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </label>
            </div>
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
