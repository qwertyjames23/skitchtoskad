import { Group, Rect, Circle, Line, Ellipse } from "react-konva";
import type { Transform } from "../../utils/coordTransform";

interface Props {
  x: number;        // world mm
  y: number;        // world mm
  fixtureType: string;
  rotation: number; // degrees clockwise
  transform: Transform;
}

const STROKE = "#336699";
const FILL = "rgba(200,220,240,0.55)";
const SW = 1; // stroke width in px (screen)

// Helper: scale mm → px at current transform (no zoom applied — transform already handles it)
function sc(mm: number, t: Transform) {
  return mm * t.scale;
}

export function FurnitureShape({ x, y, fixtureType, rotation, transform }: Props) {
  const [sx, sy] = transform.toScreen(x, y);

  // Group is centered on (sx, sy) and rotated
  const common = {
    x: sx,
    y: sy,
    rotation,
    listening: false,
  };

  switch (fixtureType) {
    case "toilet": {
      // Tank: 400×300 rect centered above; bowl: 400×500 rect with 300 wide ellipse
      const tw = sc(400, transform), th = sc(300, transform);
      const bw = sc(400, transform), bh = sc(500, transform);
      return (
        <Group {...common}>
          {/* tank */}
          <Rect x={-tw / 2} y={-th - bh / 2} width={tw} height={th} fill={FILL} stroke={STROKE} strokeWidth={SW} />
          {/* bowl rect */}
          <Rect x={-bw / 2} y={-bh / 2} width={bw} height={bh} fill={FILL} stroke={STROKE} strokeWidth={SW} />
          {/* bowl ellipse cutout suggestion */}
          <Ellipse radiusX={bw / 2 - sc(40, transform)} radiusY={bh / 2 - sc(60, transform)} fill="rgba(255,255,255,0.6)" stroke={STROKE} strokeWidth={SW * 0.5} />
        </Group>
      );
    }

    case "sink": {
      const w = sc(500, transform), h = sc(500, transform);
      const r = sc(150, transform);
      return (
        <Group {...common}>
          <Rect x={-w / 2} y={-h / 2} width={w} height={h} fill={FILL} stroke={STROKE} strokeWidth={SW} />
          <Circle radius={r} fill="rgba(255,255,255,0.6)" stroke={STROKE} strokeWidth={SW * 0.5} />
        </Group>
      );
    }

    case "bathtub": {
      const w = sc(700, transform), h = sc(1600, transform);
      const innerW = sc(580, transform), innerH = sc(1300, transform);
      return (
        <Group {...common}>
          <Rect x={-w / 2} y={-h / 2} width={w} height={h} fill={FILL} stroke={STROKE} strokeWidth={SW} />
          <Ellipse radiusX={innerW / 2} radiusY={innerH / 2} fill="rgba(255,255,255,0.5)" stroke={STROKE} strokeWidth={SW * 0.5} />
        </Group>
      );
    }

    case "shower": {
      const w = sc(900, transform);
      return (
        <Group {...common}>
          <Rect x={-w / 2} y={-w / 2} width={w} height={w} fill={FILL} stroke={STROKE} strokeWidth={SW} />
          {/* diagonal lines */}
          <Line points={[-w / 2, -w / 2, w / 2, w / 2]} stroke={STROKE} strokeWidth={SW * 0.5} />
          <Line points={[w / 2, -w / 2, -w / 2, w / 2]} stroke={STROKE} strokeWidth={SW * 0.5} />
          {/* drain */}
          <Circle radius={sc(60, transform)} fill="#fff" stroke={STROKE} strokeWidth={SW * 0.5} />
        </Group>
      );
    }

    case "bed-single": {
      const bw = sc(900, transform), bh = sc(2000, transform);
      const hw = sc(900, transform), hh = sc(250, transform);
      return (
        <Group {...common}>
          {/* mattress */}
          <Rect x={-bw / 2} y={-bh / 2 + hh} width={bw} height={bh - hh} fill={FILL} stroke={STROKE} strokeWidth={SW} />
          {/* headboard */}
          <Rect x={-hw / 2} y={-bh / 2} width={hw} height={hh} fill={STROKE} />
          {/* pillow hint */}
          <Ellipse x={0} y={-bh / 2 + hh + sc(200, transform)} radiusX={sc(200, transform)} radiusY={sc(120, transform)} fill="rgba(255,255,255,0.7)" stroke={STROKE} strokeWidth={SW * 0.4} />
        </Group>
      );
    }

    case "bed-double": {
      const bw = sc(1500, transform), bh = sc(2000, transform);
      const hh = sc(250, transform);
      return (
        <Group {...common}>
          <Rect x={-bw / 2} y={-bh / 2 + hh} width={bw} height={bh - hh} fill={FILL} stroke={STROKE} strokeWidth={SW} />
          <Rect x={-bw / 2} y={-bh / 2} width={bw} height={hh} fill={STROKE} />
          {/* two pillows */}
          <Ellipse x={-bw / 4} y={-bh / 2 + hh + sc(200, transform)} radiusX={sc(180, transform)} radiusY={sc(110, transform)} fill="rgba(255,255,255,0.7)" stroke={STROKE} strokeWidth={SW * 0.4} />
          <Ellipse x={bw / 4} y={-bh / 2 + hh + sc(200, transform)} radiusX={sc(180, transform)} radiusY={sc(110, transform)} fill="rgba(255,255,255,0.7)" stroke={STROKE} strokeWidth={SW * 0.4} />
        </Group>
      );
    }

    case "sofa": {
      const sw2 = sc(900, transform), sh = sc(2100, transform);
      const backH = sc(250, transform);
      const armW = sc(200, transform);
      return (
        <Group {...common}>
          {/* seat */}
          <Rect x={-sw2 / 2 + armW} y={-sh / 2 + backH} width={sw2 - armW * 2} height={sh - backH} fill={FILL} stroke={STROKE} strokeWidth={SW} />
          {/* back */}
          <Rect x={-sw2 / 2 + armW} y={-sh / 2} width={sw2 - armW * 2} height={backH} fill={STROKE} />
          {/* left arm */}
          <Rect x={-sw2 / 2} y={-sh / 2} width={armW} height={sh} fill={FILL} stroke={STROKE} strokeWidth={SW} />
          {/* right arm */}
          <Rect x={sw2 / 2 - armW} y={-sh / 2} width={armW} height={sh} fill={FILL} stroke={STROKE} strokeWidth={SW} />
        </Group>
      );
    }

    case "desk": {
      const dw = sc(750, transform), dh = sc(1500, transform);
      return (
        <Group {...common}>
          <Rect x={-dw / 2} y={-dh / 2} width={dw} height={dh} fill={FILL} stroke={STROKE} strokeWidth={SW} />
        </Group>
      );
    }

    case "dining-table": {
      const tw = sc(900, transform), th = sc(1800, transform);
      const chairW = sc(400, transform), chairH = sc(400, transform);
      const gap = sc(50, transform);
      return (
        <Group {...common}>
          <Ellipse radiusX={tw / 2} radiusY={th / 2} fill={FILL} stroke={STROKE} strokeWidth={SW} />
          {/* chairs: top, bottom */}
          <Rect x={-chairW / 2} y={-th / 2 - chairH - gap} width={chairW} height={chairH} fill={FILL} stroke={STROKE} strokeWidth={SW} />
          <Rect x={-chairW / 2} y={th / 2 + gap} width={chairW} height={chairH} fill={FILL} stroke={STROKE} strokeWidth={SW} />
          {/* chairs: left, right (mid) */}
          <Rect x={-tw / 2 - chairH - gap} y={-chairW / 2} width={chairH} height={chairW} fill={FILL} stroke={STROKE} strokeWidth={SW} />
          <Rect x={tw / 2 + gap} y={-chairW / 2} width={chairH} height={chairW} fill={FILL} stroke={STROKE} strokeWidth={SW} />
        </Group>
      );
    }

    case "stair": {
      // 10 treads, each 250mm deep, 1000mm wide
      const treads = 10;
      const treadH = sc(250, transform);
      const treadW = sc(1000, transform);
      const totalH = treads * treadH;
      return (
        <Group {...common}>
          {Array.from({ length: treads }, (_, i) => (
            <Rect
              key={i}
              x={-treadW / 2}
              y={-totalH / 2 + i * treadH}
              width={treadW}
              height={treadH}
              fill={i % 2 === 0 ? FILL : "rgba(180,200,220,0.35)"}
              stroke={STROKE}
              strokeWidth={SW * 0.6}
            />
          ))}
        </Group>
      );
    }

    default:
      // Unknown fixture — draw a simple question-mark box
      return (
        <Group {...common}>
          <Rect x={-sc(300, transform) / 2} y={-sc(300, transform) / 2} width={sc(300, transform)} height={sc(300, transform)} fill={FILL} stroke={STROKE} strokeWidth={SW} />
        </Group>
      );
  }
}

