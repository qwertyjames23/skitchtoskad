"""Room representation and area calculation."""

from __future__ import annotations

from dataclasses import dataclass
from shapely.geometry import Polygon

from app.utils.units import area_mm2_to_m2, area_mm2_to_ft2


@dataclass
class Room:
    """A detected room with its polygon boundary."""

    name: str
    polygon: Polygon

    @property
    def area_mm2(self) -> float:
        return self.polygon.area

    @property
    def area_sq_m(self) -> float:
        return area_mm2_to_m2(self.polygon.area)

    @property
    def area_sq_ft(self) -> float:
        return area_mm2_to_ft2(self.polygon.area)

    @property
    def centroid(self) -> tuple[float, float]:
        """Center point for label placement, guaranteed to be inside the room.

        Shapely's geometric centroid can fall outside non-convex (e.g. L-shaped)
        polygons. ``representative_point()`` is always strictly interior.
        """
        c = self.polygon.centroid
        if not self.polygon.contains(c):
            c = self.polygon.representative_point()
        return (c.x, c.y)

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        return self.polygon.bounds

    @property
    def dimensions_mm(self) -> dict[str, float]:
        """Bounding box width and height in mm."""
        minx, miny, maxx, maxy = self.polygon.bounds
        return {"width": maxx - minx, "height": maxy - miny}

    @property
    def perimeter_mm(self) -> float:
        return self.polygon.length

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "area_sq_m": round(self.area_sq_m, 2),
            "area_sq_ft": round(self.area_sq_ft, 2),
            "centroid": self.centroid,
            "dimensions_mm": self.dimensions_mm,
            "perimeter_mm": round(self.perimeter_mm, 1),
            "polygon": list(self.polygon.exterior.coords),
        }
