"""Wall geometry: centerline-based walls with thickness via Shapely buffering."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from shapely.geometry import LineString, Polygon, MultiPolygon, Point
from shapely.ops import unary_union

from app.core.geometry.validation import (
    validate_coordinates,
    auto_close_wall_chain,
    GeometryIssue,
    ValidationSeverity,
)
from app.core.geometry.offset import (
    OffsetWall,
    resolve_wall_intersections,
    find_t_junctions,
    find_crossings,
)


@dataclass
class WallSegment:
    """A single wall defined by its centerline endpoints and thickness."""

    start: tuple[float, float]
    end: tuple[float, float]
    thickness: float = 200.0  # mm
    id: str | None = None

    @property
    def centerline(self) -> LineString:
        return LineString([self.start, self.end])

    @property
    def length(self) -> float:
        return self.centerline.length

    @property
    def direction(self) -> tuple[float, float]:
        """Unit direction vector from start to end."""
        dx = self.end[0] - self.start[0]
        dy = self.end[1] - self.start[1]
        d = math.hypot(dx, dy)
        if d == 0:
            return (0.0, 0.0)
        return (dx / d, dy / d)

    @property
    def normal(self) -> tuple[float, float]:
        """Unit normal vector (perpendicular, pointing left)."""
        dx, dy = self.direction
        return (-dy, dx)

    def to_polygon(self) -> Polygon:
        """Buffer the centerline to produce a wall polygon with thickness."""
        return self.centerline.buffer(
            self.thickness / 2,
            cap_style="flat",
            join_style="mitre",
        )

    def to_offset_wall(self) -> OffsetWall:
        """Convert to an OffsetWall for advanced offset/intersection operations."""
        return OffsetWall(centerline=self.centerline, thickness=self.thickness)

    def inner_edge_points(self) -> tuple[tuple[float, float], tuple[float, float]]:
        """The two corners on the right (inner/room-facing) side of the wall."""
        nx, ny = self.normal
        half = self.thickness / 2
        return (
            (self.start[0] - nx * half, self.start[1] - ny * half),
            (self.end[0] - nx * half, self.end[1] - ny * half),
        )

    def outer_edge_points(self) -> tuple[tuple[float, float], tuple[float, float]]:
        """The two corners on the left (exterior-facing) side of the wall."""
        nx, ny = self.normal
        half = self.thickness / 2
        return (
            (self.start[0] + nx * half, self.start[1] + ny * half),
            (self.end[0] + nx * half, self.end[1] + ny * half),
        )

    def point_is_on_wall(self, point: tuple[float, float], tolerance: float = 1.0) -> bool:
        """Check if a point lies within or on the wall polygon."""
        pt = Point(point)
        return self.to_polygon().distance(pt) <= tolerance

    def validate(self) -> list[GeometryIssue]:
        """Validate this wall segment."""
        issues = []
        if self.length == 0:
            issues.append(GeometryIssue(
                ValidationSeverity.ERROR, "ZERO_LENGTH",
                f"Wall from {self.start} to {self.end} has zero length",
                location=self.start,
            ))
        if self.thickness <= 0:
            issues.append(GeometryIssue(
                ValidationSeverity.ERROR, "INVALID_THICKNESS",
                f"Wall thickness {self.thickness} must be positive",
            ))
        if self.thickness > 1000:
            issues.append(GeometryIssue(
                ValidationSeverity.WARNING, "THICK_WALL",
                f"Wall thickness {self.thickness}mm is unusually large",
            ))
        return issues


@dataclass
class WallNetwork:
    """Collection of wall segments that form a floor plan structure."""

    segments: list[WallSegment] = field(default_factory=list)
    snap_tolerance: float = 1.0  # mm — closes tiny gaps between walls

    def add(
        self,
        start: tuple,
        end: tuple,
        thickness: float = 200.0,
        id: str | None = None,
    ) -> WallSegment:
        seg = WallSegment(start=start, end=end, thickness=thickness, id=id)
        self.segments.append(seg)
        return seg

    def validate_all(self) -> list[GeometryIssue]:
        """Validate every segment and check network-level issues."""
        issues = []
        for i, seg in enumerate(self.segments):
            for issue in seg.validate():
                issue.message = f"Wall {i}: {issue.message}"
                issues.append(issue)
        return issues

    def auto_close(self, tolerance: float = 5.0) -> list[GeometryIssue]:
        """Detect and close gaps in wall chains.

        Finds sequences of walls where end-of-one meets start-of-next,
        then checks if the chain forms a near-closed loop.
        """
        if len(self.segments) < 3:
            return []

        chain = [(seg.start, seg.end) for seg in self.segments]
        fixed, issues = auto_close_wall_chain(chain, tolerance)

        if len(fixed) != len(chain):
            # A closing segment was added
            new_seg = fixed[-1]
            self.add(new_seg[0], new_seg[1], self.segments[-1].thickness)

        # Apply snapped endpoints
        for i, (start, end) in enumerate(fixed[:len(self.segments)]):
            self.segments[i].start = start
            self.segments[i].end = end

        return issues

    def find_junctions(self) -> dict:
        """Analyze the wall network for junction types."""
        offset_walls = [seg.to_offset_wall() for seg in self.segments]
        return {
            "t_junctions": find_t_junctions(offset_walls, self.snap_tolerance * 5),
            "crossings": find_crossings(offset_walls),
        }

    def merge_walls(self) -> Polygon | MultiPolygon:
        """Union all wall polygons into a single geometry.

        Uses a small buffer-debuffer trick to close gaps smaller than
        snap_tolerance, which handles imprecise user input.
        """
        if not self.segments:
            return Polygon()

        polys = [seg.to_polygon() for seg in self.segments]
        merged = unary_union(polys)

        # Close tiny gaps: expand then shrink
        if self.snap_tolerance > 0:
            merged = merged.buffer(self.snap_tolerance).buffer(-self.snap_tolerance)

        return merged

    def merge_walls_advanced(self) -> Polygon | MultiPolygon:
        """Merge using the offset engine with full intersection resolution."""
        offset_walls = [seg.to_offset_wall() for seg in self.segments]
        return resolve_wall_intersections(offset_walls, self.snap_tolerance)

    def detect_rooms(self) -> list[Polygon]:
        """Detect enclosed rooms as interior rings of the merged wall mass.

        When walls form closed loops, the merged polygon will have interior
        rings — each ring represents a room boundary.
        """
        merged = self.merge_walls()

        rooms = []
        if merged.is_empty:
            return rooms

        if isinstance(merged, MultiPolygon):
            for poly in merged.geoms:
                for interior in poly.interiors:
                    rooms.append(Polygon(interior))
        elif isinstance(merged, Polygon):
            for interior in merged.interiors:
                rooms.append(Polygon(interior))

        return rooms

    @property
    def bounding_box(self) -> tuple[float, float, float, float]:
        """Returns (minx, miny, maxx, maxy) of all walls."""
        merged = self.merge_walls()
        if merged.is_empty:
            return (0, 0, 0, 0)
        return merged.bounds
