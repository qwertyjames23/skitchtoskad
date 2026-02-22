import { Text, Group } from "react-konva";
import type { RoomInfo } from "../../types/plan";
import type { Transform } from "../../utils/coordTransform";

interface Props {
  room: RoomInfo;
  transform: Transform;
}

export function RoomLabel({ room, transform }: Props) {
  // Room box in stage coordinates, derived from polygon vertices.
  // We use this as a hard label container so text never spills outside.
  const screenXs = room.polygon.map(([wx, wy]) => transform.toScreen(wx, wy)[0]);
  const screenYs = room.polygon.map(([wx, wy]) => transform.toScreen(wx, wy)[1]);
  const minX = Math.min(...screenXs);
  const maxX = Math.max(...screenXs);
  const minY = Math.min(...screenYs);
  const maxY = Math.max(...screenYs);
  const roomScreenW = maxX - minX;
  const roomScreenH = maxY - minY;
  const sx = (minX + maxX) / 2;
  const sy = (minY + maxY) / 2;

  // Text container stays inside the room with a little internal padding.
  const innerPad = 5;
  const textW = Math.min(280, Math.max(30, roomScreenW - innerPad * 2));
  const textH = Math.min(120, Math.max(14, roomScreenH - innerPad * 2));

  const showArea = textH >= 34;
  const nameFontSize = Math.max(8, Math.min(13, Math.floor(Math.min(textW / 7, textH / (showArea ? 3.2 : 2.0)))));
  const areaFontSize = Math.max(8, Math.min(10, nameFontSize - 2));
  const gap = showArea ? 3 : 0;
  const nameBoxH = showArea ? Math.max(12, textH - areaFontSize - gap) : textH;

  // Clip to the room rectangle so labels can never bleed outside room bounds.
  return (
    <Group
      x={minX + innerPad}
      y={minY + innerPad}
      clipX={0}
      clipY={0}
      clipWidth={textW}
      clipHeight={textH}
      listening={false}
    >
      {/* Room name — bold, primary hierarchy */}
      <Text
        x={sx - minX - innerPad - textW / 2}
        y={sy - minY - innerPad - textH / 2}
        text={room.name}
        fontSize={nameFontSize}
        fontStyle="bold"
        fill="#1a1a1a"
        align="center"
        width={textW}
        height={nameBoxH}
        verticalAlign="middle"
        wrap="word"
        ellipsis
        lineHeight={1.05}
      />

      {/* Room area — shown only when the room has enough vertical space */}
      {showArea && (
        <Text
          x={sx - minX - innerPad - textW / 2}
          y={sy - minY - innerPad - textH / 2 + nameBoxH + gap}
          text={`${room.area_sq_m} m\u00b2`}
          fontSize={areaFontSize}
          fill="#555"
          align="center"
          width={textW}
          height={areaFontSize + 2}
          verticalAlign="middle"
          wrap="none"
        />
      )}
    </Group>
  );
}
