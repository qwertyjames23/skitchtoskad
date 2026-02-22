"""Wall offsetting and intersection resolution.

Wall offsetting is the core geometric operation that transforms a 1D centerline
into a 2D wall with thickness. This module handles the three hard problems:

1. PARALLEL OFFSET — expanding a centerline into inner/outer edges
2. CORNER RESOLUTION — what happens where two offset walls meet
3. INTERSECTION CLEANUP — resolving overlaps when walls cross

The approach: each wall is a buffered centerline (handled by Shapely's
LineString.buffer). The complexity lives in how we MERGE those buffers
when walls meet at corners or cross each other.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum, auto

from shapely.geometry import (
    LineString, Polygon, MultiPolygon, Point,
    MultiLineString, GeometryCollection,
)
from shapely.ops import unary_union, split, nearest_points
from shapely.affinity import translate


class JoinStyle(Enum):
    """How two offset wall edges connect at a corner."""
    MITRE = auto()   # sharp point (architectural standard)
    BEVEL = auto()   # flat cut at corner
    ROUND = auto()   # rounded corner


class CapStyle(Enum):
    """How a wall terminates at an open end."""
    FLAT = auto()    # square cut at endpoint
    SQUARE = auto()  # extends by half-thickness past endpoint
    ROUND = auto()   # semicircle


# ── 1. Single-wall offset ──────────────────────────────────────────────

@dataclass
class OffsetWall:
    """A wall with computed inner and outer edges from its centerline."""

    centerline: LineString
    thickness: float
    join: JoinStyle = JoinStyle.MITRE
    cap: CapStyle = CapStyle.FLAT

    @property
    def half_thickness(self) -> float:
        return self.thickness / 2

    @property
    def polygon(self) -> Polygon:
        """The full wall polygon (centerline buffered by half-thickness)."""
        return self.centerline.buffer(
            self.half_thickness,
            cap_style=self.cap.name.lower(),
            join_style=self.join.name.lower(),
            mitre_limit=5.0,  # max mitre extension = 5x the offset
        )

    @property
    def left_edge(self) -> LineString:
        """The edge on the left side of the centerline (looking from start to end).

        Shapely's offset_curve: positive = left, negative = right.
        """
        return self.centerline.offset_curve(self.half_thickness)

    @property
    def right_edge(self) -> LineString:
        """The edge on the right side of the centerline."""
        return self.centerline.offset_curve(-self.half_thickness)

    @property
    def inner_edge(self) -> LineString:
        """For room-bounding walls, the 'inner' edge faces the room.

        Convention: right side = interior (room-facing).
        This matches architectural convention where walls are drawn
        with the room on the right when walking the perimeter clockwise.
        """
        return self.right_edge

    @property
    def outer_edge(self) -> LineString:
        """The exterior-facing edge."""
        return self.left_edge

    def offset_by(self, distance: float) -> LineString:
        """Offset the centerline by an arbitrary distance.

        Positive = left, negative = right (Shapely convention).
        Useful for creating parallel construction lines.
        """
        return self.centerline.offset_curve(distance)


# ── 2. Corner resolution ───────────────────────────────────────────────

@dataclass
class WallCorner:
    """Represents the junction where two walls meet."""

    wall_a: OffsetWall
    wall_b: OffsetWall
    junction_point: tuple[float, float]

    @property
    def angle_degrees(self) -> float:
        """Interior angle between the two walls at the junction."""
        # Get direction vectors at the junction
        da = _direction_at_end(self.wall_a.centerline)
        db = _direction_at_start(self.wall_b.centerline)

        # Angle between vectors
        dot = da[0] * db[0] + da[1] * db[1]
        cross = da[0] * db[1] - da[1] * db[0]
        return math.degrees(math.atan2(abs(cross), dot))

    @property
    def is_acute(self) -> bool:
        return self.angle_degrees < 60

    def resolve(self) -> Polygon:
        """Merge the two wall polygons at this corner.

        For mitre joins, Shapely handles this automatically when we
        union the two buffered polygons. But for acute angles, the
        mitre can extend very far — we clamp it.
        """
        merged = unary_union([self.wall_a.polygon, self.wall_b.polygon])

        if self.is_acute:
            # Clip the mitre spike by intersecting with a bounding circle
            # centered on the junction point
            max_extension = max(self.wall_a.thickness, self.wall_b.thickness) * 3
            clip_circle = Point(self.junction_point).buffer(max_extension)
            merged = merged.intersection(clip_circle)

        return merged


def compute_mitre_point(
    line_a: LineString,
    line_b: LineString,
    offset: float,
) -> tuple[float, float] | None:
    """Find the mitre point where two offset lines would intersect.

    Given two wall centerlines that share an endpoint, compute where
    their parallel offset lines meet. This is the sharp corner point
    in a mitre join.

    Returns None if lines are parallel (no intersection).
    """
    # Offset both lines
    offset_a = line_a.offset_curve(offset)
    offset_b = line_b.offset_curve(offset)

    # Extend the offset lines to find their intersection
    extended_a = _extend_line(offset_a, 1000)
    extended_b = _extend_line(offset_b, 1000)

    intersection = extended_a.intersection(extended_b)

    if intersection.is_empty:
        return None
    if intersection.geom_type == "Point":
        return (intersection.x, intersection.y)
    if intersection.geom_type == "MultiPoint":
        # Take the point nearest to the original junction
        junction = Point(line_a.coords[-1])
        nearest = nearest_points(junction, intersection)[1]
        return (nearest.x, nearest.y)

    return None


# ── 3. Multi-wall intersection resolution ──────────────────────────────

def resolve_wall_intersections(
    walls: list[OffsetWall],
    snap_tolerance: float = 1.0,
) -> Polygon | MultiPolygon:
    """Merge multiple offset walls, resolving all intersections cleanly.

    This is the main algorithm that produces clean wall geometry from
    a collection of individually-offset walls. It handles:

    - T-junctions (partition wall meeting exterior wall)
    - L-junctions (corner where two walls meet at 90°)
    - X-junctions (two walls crossing each other)
    - Overlapping parallel walls

    The algorithm:
    1. Buffer each centerline independently
    2. Union all polygons (automatically resolves overlaps)
    3. Buffer-debuffer to close micro-gaps from floating point
    4. Validate and repair the result
    """
    if not walls:
        return Polygon()

    # Step 1: collect all wall polygons
    polygons = []
    for wall in walls:
        poly = wall.polygon
        if poly.is_valid and not poly.is_empty:
            polygons.append(poly)

    if not polygons:
        return Polygon()

    # Step 2: union — this is where Shapely does the heavy lifting
    # unary_union uses a cascaded union algorithm that's O(n log n)
    # much faster than pairwise union which would be O(n²)
    merged = unary_union(polygons)

    # Step 3: snap micro-gaps
    # The buffer(+t).buffer(-t) trick closes gaps smaller than t
    # while preserving the overall shape. This handles floating-point
    # imprecision at wall junctions.
    if snap_tolerance > 0:
        merged = merged.buffer(snap_tolerance).buffer(-snap_tolerance)

    # Step 4: validate
    if not merged.is_valid:
        from shapely.validation import make_valid
        merged = make_valid(merged)

    return merged


def find_t_junctions(
    walls: list[OffsetWall],
    tolerance: float = 5.0,
) -> list[dict]:
    """Detect T-junctions where one wall endpoint touches another wall's body.

    A T-junction occurs when a partition wall meets an exterior wall.
    The partition's endpoint is ON the exterior wall's centerline,
    but not at either of its endpoints.

    Returns list of {wall_index, target_wall_index, point, snap_distance}.
    """
    junctions = []

    for i, wall in enumerate(walls):
        for endpoint in [wall.centerline.coords[0], wall.centerline.coords[-1]]:
            pt = Point(endpoint)

            for j, target in enumerate(walls):
                if i == j:
                    continue

                # Check if the endpoint is near the target's centerline
                dist = target.centerline.distance(pt)
                if dist > tolerance:
                    continue

                # But NOT near either endpoint of the target
                target_start = Point(target.centerline.coords[0])
                target_end = Point(target.centerline.coords[-1])
                if pt.distance(target_start) < tolerance or pt.distance(target_end) < tolerance:
                    continue  # This is an L-junction, not a T

                junctions.append({
                    "wall_index": i,
                    "target_wall_index": j,
                    "point": endpoint,
                    "snap_distance": dist,
                })

    return junctions


def find_crossings(
    walls: list[OffsetWall],
) -> list[dict]:
    """Detect X-junctions where two wall centerlines cross each other.

    Returns list of {wall_a, wall_b, intersection_point}.
    """
    crossings = []

    for i in range(len(walls)):
        for j in range(i + 1, len(walls)):
            intersection = walls[i].centerline.intersection(walls[j].centerline)

            if intersection.is_empty:
                continue

            if intersection.geom_type == "Point":
                # Verify it's a true crossing (not just an endpoint touch)
                a_start = Point(walls[i].centerline.coords[0])
                a_end = Point(walls[i].centerline.coords[-1])
                b_start = Point(walls[j].centerline.coords[0])
                b_end = Point(walls[j].centerline.coords[-1])

                pt = intersection
                is_endpoint = (
                    pt.distance(a_start) < 1 or pt.distance(a_end) < 1 or
                    pt.distance(b_start) < 1 or pt.distance(b_end) < 1
                )

                if not is_endpoint:
                    crossings.append({
                        "wall_a": i,
                        "wall_b": j,
                        "intersection_point": (pt.x, pt.y),
                    })

    return crossings


# ── 4. Parallel offset for room boundaries ─────────────────────────────

def offset_polygon_inward(
    polygon: Polygon,
    distance: float,
) -> Polygon | MultiPolygon | None:
    """Offset a polygon inward (shrink) by a given distance.

    Used for computing the room interior boundary after accounting
    for wall finishes, baseboards, etc.

    Negative buffer = inward offset.
    Returns None if the polygon collapses to nothing.
    """
    result = polygon.buffer(-distance, join_style="mitre", mitre_limit=2.0)

    if result.is_empty:
        return None

    return result


def offset_polygon_outward(
    polygon: Polygon,
    distance: float,
) -> Polygon:
    """Offset a polygon outward (expand) by a given distance.

    Used for computing clearance zones, exterior footprint, etc.
    """
    return polygon.buffer(distance, join_style="mitre", mitre_limit=2.0)


# ── Helpers ─────────────────────────────────────────────────────────────

def _direction_at_end(line: LineString) -> tuple[float, float]:
    """Unit direction vector at the end of a LineString."""
    coords = list(line.coords)
    dx = coords[-1][0] - coords[-2][0]
    dy = coords[-1][1] - coords[-2][1]
    length = math.hypot(dx, dy)
    if length == 0:
        return (1.0, 0.0)
    return (dx / length, dy / length)


def _direction_at_start(line: LineString) -> tuple[float, float]:
    """Unit direction vector at the start of a LineString."""
    coords = list(line.coords)
    dx = coords[1][0] - coords[0][0]
    dy = coords[1][1] - coords[0][1]
    length = math.hypot(dx, dy)
    if length == 0:
        return (1.0, 0.0)
    return (dx / length, dy / length)


def _extend_line(line: LineString, distance: float) -> LineString:
    """Extend a line segment in both directions by 'distance'."""
    coords = list(line.coords)
    if len(coords) < 2:
        return line

    # Extend from start
    dx = coords[0][0] - coords[1][0]
    dy = coords[0][1] - coords[1][1]
    length = math.hypot(dx, dy)
    if length > 0:
        new_start = (
            coords[0][0] + dx / length * distance,
            coords[0][1] + dy / length * distance,
        )
    else:
        new_start = coords[0]

    # Extend from end
    dx = coords[-1][0] - coords[-2][0]
    dy = coords[-1][1] - coords[-2][1]
    length = math.hypot(dx, dy)
    if length > 0:
        new_end = (
            coords[-1][0] + dx / length * distance,
            coords[-1][1] + dy / length * distance,
        )
    else:
        new_end = coords[-1]

    return LineString([new_start] + coords + [new_end])
