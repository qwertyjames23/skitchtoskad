export type PlanPointMm = [number, number];

export interface ScenePoint {
  x: number;
  z: number;
}

export interface ShapePoint {
  x: number;
  y: number;
}

export interface LinePose3D {
  widthMm: number;
  angleRad: number;
  midX: number;
  midZ: number;
}

export interface Plan3DMapper {
  readonly mmToM: number;
  toMeters(mm: number): number;
  toScenePoint(point: PlanPointMm): ScenePoint;
  toShapePoint(point: PlanPointMm): ShapePoint;
  linePose(start: PlanPointMm, end: PlanPointMm): LinePose3D;
  /**
   * Advance `distanceMm` along the segment from `start` toward `end` and
   * return the resulting point in 2D plan space (mm).  Pass the result to
   * `toScenePoint` to obtain the Three.js scene position.
   *
   * Using this instead of hand-written `start + unitVec * dist` arithmetic
   * keeps all plan-space navigation inside the mapper and avoids introducing
   * raw 2D-Y variables that could be mistaken for 3D-Z coordinates.
   */
  advancePoint(start: PlanPointMm, end: PlanPointMm, distanceMm: number): PlanPointMm;
  /**
   * Return the Three.js `mesh.rotation.y` (radians) that aligns a mesh's
   * local +X axis with the direction from `start` to `end`.
   *
   * Derivation: plan Y maps to scene −Z (negated so south/small-Y = +Z = near
   * camera).  Scene direction = (Δx, 0, −Δy).  Three.js rotation.y = atan2(Δy, Δx)
   * correctly aligns +X to (Δx, 0, −Δy) — no sign change needed on the
   * atan2 result because the Z negation already compensates.
   */
  wallRotationY(start: PlanPointMm, end: PlanPointMm): number;
}

export const MM_TO_M = 0.001;

export function createPlan3DMapper(
  boundingBox: [number, number, number, number],
): Plan3DMapper {
  const [minX, minY, maxX, maxY] = boundingBox;
  const centerM: ScenePoint = {
    x: ((minX + maxX) / 2) * MM_TO_M,
    z: ((minY + maxY) / 2) * MM_TO_M,
  };

  const toScenePoint = (point: PlanPointMm): ScenePoint => ({
    // X maps directly. Y is negated so south (small Y) maps to +Z (near camera),
    // matching the 2D canvas where small Y = bottom = front of view.
    x: point[0] * MM_TO_M - centerM.x,
    z: -(point[1] * MM_TO_M - centerM.z),
  });

  const toShapePoint = (point: PlanPointMm): ShapePoint => {
    const scene = toScenePoint(point);
    return {
      x: scene.x,
      // ShapeGeometry is XY; after mesh.rotation.x = -PI/2 this maps back to +Z.
      y: -scene.z,
    };
  };

  const linePose = (start: PlanPointMm, end: PlanPointMm): LinePose3D => {
    const widthMm = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const angleRad = Math.atan2(end[1] - start[1], end[0] - start[0]);
    const mid: PlanPointMm = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    const midScene = toScenePoint(mid);
    return { widthMm, angleRad, midX: midScene.x, midZ: midScene.z };
  };

  const advancePoint = (
    start: PlanPointMm,
    end: PlanPointMm,
    distanceMm: number,
  ): PlanPointMm => {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const len = Math.hypot(dx, dy);
    if (len < 1) return [start[0], start[1]];
    return [start[0] + (dx / len) * distanceMm, start[1] + (dy / len) * distanceMm];
  };

  const wallRotationY = (start: PlanPointMm, end: PlanPointMm): number => {
    // With Y → −Z, scene direction = (Δx, 0, −Δy).
    // Three.js rotation.y = atan2(Δy, Δx) aligns mesh +X to (Δx, 0, −Δy).
    return Math.atan2(end[1] - start[1], end[0] - start[0]);
  };

  return {
    mmToM: MM_TO_M,
    toMeters: (mm: number) => mm * MM_TO_M,
    toScenePoint,
    toShapePoint,
    linePose,
    advancePoint,
    wallRotationY,
  };
}
