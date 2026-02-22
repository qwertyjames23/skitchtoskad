"""Lot/property boundary geometry for site plans."""

from __future__ import annotations

from dataclasses import dataclass, field

from shapely.geometry import Polygon


@dataclass
class LotGeometry:
    """Property boundary with optional setback envelope."""

    boundary: Polygon
    setback_polygon: Polygon | None
    north_angle: float  # degrees; 90 = pointing up (north)
    setbacks: dict = field(default_factory=dict)  # {front, rear, left, right}

    @property
    def area_sq_m(self) -> float:
        """Lot area in square metres (input coordinates are in mm)."""
        return self.boundary.area / 1_000_000

    def to_dict(self) -> dict:
        """Serialise to a plain dict for the API response."""
        def _coords(poly: Polygon | None) -> list[list[float]] | None:
            if poly is None or poly.is_empty:
                return None
            return [[x, y] for x, y in poly.exterior.coords]

        return {
            "boundary": _coords(self.boundary),
            "setback_polygon": _coords(self.setback_polygon),
            "north_angle": self.north_angle,
            "area_sq_m": round(self.area_sq_m, 2),
            "setbacks": self.setbacks,
        }


def build_lot_geometry(
    vertices: list[tuple[float, float]],
    front: float = 0.0,
    rear: float = 0.0,
    left: float = 0.0,
    right: float = 0.0,
    north_angle: float = 90.0,
) -> LotGeometry:
    """Construct a LotGeometry from vertices and setback distances.

    Setbacks are in the same unit as the vertices (mm by default).
    Uses a mitre-join inward buffer for the setback polygon, which
    produces accurate right-angle corners for rectangular lots.
    """
    boundary = Polygon(vertices)

    setback_poly: Polygon | None = None
    min_setback = min(front, rear, left, right)
    if min_setback > 0:
        buffered = boundary.buffer(-min_setback, join_style=2)  # 2 = mitre
        if not buffered.is_empty and isinstance(buffered, Polygon):
            setback_poly = buffered

    return LotGeometry(
        boundary=boundary,
        setback_polygon=setback_poly,
        north_angle=north_angle,
        setbacks={"front": front, "rear": rear, "left": left, "right": right},
    )
