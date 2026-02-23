"""Door and window openings that cut through walls."""

from __future__ import annotations

import math
from dataclasses import dataclass
from uuid import uuid4
from shapely.geometry import LineString, Polygon


@dataclass
class Door:
    """A door opening defined by its position along a wall."""

    # stable identifier used to correlate elements between 2D/3D/frontend
    id: str | None = None
    start: tuple[float, float] = (0.0, 0.0)
    end: tuple[float, float] = (0.0, 0.0)
    swing: str = "left"  # "left", "right", "double"
    cut_depth: float = 300.0  # how deep to cut through the wall (mm)

    @property
    def width(self) -> float:
        dx = self.end[0] - self.start[0]
        dy = self.end[1] - self.start[1]
        return math.hypot(dx, dy)

    @property
    def midpoint(self) -> tuple[float, float]:
        return (
            (self.start[0] + self.end[0]) / 2,
            (self.start[1] + self.end[1]) / 2,
        )

    def cut_polygon(self) -> Polygon:
        """Create a rectangle that cuts through the wall at this opening."""
        line = LineString([self.start, self.end])
        return line.buffer(self.cut_depth / 2, cap_style="flat")

    @property
    def swing_arc(self) -> dict:
        """Calculate arc parameters for DXF/canvas rendering."""
        dx = self.end[0] - self.start[0]
        dy = self.end[1] - self.start[1]
        angle_base = math.degrees(math.atan2(dy, dx))

        if self.swing == "left":
            pivot = self.start
            start_angle = angle_base
            end_angle = angle_base + 90
        elif self.swing == "right":
            pivot = self.end
            start_angle = angle_base + 90
            end_angle = angle_base + 180
        else:  # double
            pivot = self.midpoint
            start_angle = angle_base
            end_angle = angle_base + 180

        return {
            "center": pivot,
            "radius": self.width if self.swing != "double" else self.width / 2,
            "start_angle": start_angle,
            "end_angle": end_angle,
        }

    def __post_init__(self) -> None:
        if not self.id:
            # generate a stable short uuid for cross-layer correlation
            self.id = uuid4().hex

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "type": "door",
            "start": self.start,
            "end": self.end,
            "swing": self.swing,
            "width": round(self.width, 1),
            "arc": self.swing_arc,
        }


@dataclass
class Window:
    """A window opening defined by its position along a wall."""

    id: str | None = None
    start: tuple[float, float] = (0.0, 0.0)
    end: tuple[float, float] = (0.0, 0.0)
    sill_height: float = 900.0   # mm from floor
    head_height: float = 2100.0  # mm from floor
    cut_depth: float = 300.0

    @property
    def width(self) -> float:
        dx = self.end[0] - self.start[0]
        dy = self.end[1] - self.start[1]
        return math.hypot(dx, dy)

    @property
    def height(self) -> float:
        return self.head_height - self.sill_height

    def cut_polygon(self) -> Polygon:
        """Create a rectangle that cuts through the wall at this opening."""
        line = LineString([self.start, self.end])
        return line.buffer(self.cut_depth / 2, cap_style="flat")

    @property
    def glass_lines(self) -> list[tuple]:
        """Three parallel lines representing the window in plan view."""
        dx = self.end[0] - self.start[0]
        dy = self.end[1] - self.start[1]
        length = math.hypot(dx, dy)
        if length == 0:
            return []
        # Normal direction, 50mm offset
        nx, ny = -dy / length * 50, dx / length * 50
        lines = []
        for offset in [-1, 0, 1]:
            s = (self.start[0] + nx * offset, self.start[1] + ny * offset)
            e = (self.end[0] + nx * offset, self.end[1] + ny * offset)
            lines.append((s, e))
        return lines

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "type": "window",
            "start": self.start,
            "end": self.end,
            "width": round(self.width, 1),
            "height": round(self.height, 1),
            "glass_lines": self.glass_lines,
        }

    def __post_init__(self) -> None:
        if not self.id:
            self.id = uuid4().hex
