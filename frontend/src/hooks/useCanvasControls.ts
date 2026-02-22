import { useState, useCallback } from "react";
import type { KonvaEventObject } from "konva/lib/Node";

export function useCanvasControls(minScale = 0.1, maxScale = 10) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const onWheel = useCallback(
    (e: KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = e.target.getStage();
      if (!stage) return;

      const oldScale = scale;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const factor = 1.1;
      const newScale = direction > 0 ? oldScale * factor : oldScale / factor;
      const clampedScale = Math.max(minScale, Math.min(maxScale, newScale));

      const mousePointTo = {
        x: (pointer.x - position.x) / oldScale,
        y: (pointer.y - position.y) / oldScale,
      };

      setScale(clampedScale);
      setPosition({
        x: pointer.x - mousePointTo.x * clampedScale,
        y: pointer.y - mousePointTo.y * clampedScale,
      });
    },
    [scale, position, minScale, maxScale]
  );

  const onDragEnd = useCallback((e: KonvaEventObject<DragEvent>) => {
    const stage = e.target.getStage();
    if (stage && e.target === stage) {
      setPosition({ x: stage.x(), y: stage.y() });
    }
  }, []);

  const resetView = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  return { scale, position, onWheel, onDragEnd, resetView };
}
