"""Tests for wall offsetting and intersection resolution."""

import pytest
import math
from shapely.geometry import LineString, Polygon, Point

from app.core.geometry.offset import (
    OffsetWall,
    WallCorner,
    JoinStyle,
    CapStyle,
    compute_mitre_point,
    resolve_wall_intersections,
    find_t_junctions,
    find_crossings,
    offset_polygon_inward,
    offset_polygon_outward,
)


class TestOffsetWall:
    def test_polygon_has_correct_area(self):
        """A 5000mm wall with 200mm thickness = ~1,000,000 mm² area."""
        wall = OffsetWall(
            centerline=LineString([(0, 0), (5000, 0)]),
            thickness=200,
        )
        assert wall.polygon.area == pytest.approx(1_000_000, rel=0.01)

    def test_left_edge_is_offset(self):
        wall = OffsetWall(
            centerline=LineString([(0, 0), (5000, 0)]),
            thickness=200,
        )
        left = wall.left_edge
        # Left edge of a horizontal line going right should be above (positive Y)
        coords = list(left.coords)
        for _, y in coords:
            assert y == pytest.approx(100, abs=1)  # half-thickness

    def test_right_edge_is_offset(self):
        wall = OffsetWall(
            centerline=LineString([(0, 0), (5000, 0)]),
            thickness=200,
        )
        right = wall.right_edge
        coords = list(right.coords)
        for _, y in coords:
            assert y == pytest.approx(-100, abs=1)

    def test_flat_cap_does_not_extend(self):
        wall = OffsetWall(
            centerline=LineString([(0, 0), (1000, 0)]),
            thickness=200,
            cap=CapStyle.FLAT,
        )
        minx, _, maxx, _ = wall.polygon.bounds
        assert minx == pytest.approx(0, abs=1)
        assert maxx == pytest.approx(1000, abs=1)

    def test_square_cap_extends(self):
        wall = OffsetWall(
            centerline=LineString([(0, 0), (1000, 0)]),
            thickness=200,
            cap=CapStyle.SQUARE,
        )
        minx, _, maxx, _ = wall.polygon.bounds
        # Square cap extends by half-thickness past each end
        assert minx == pytest.approx(-100, abs=1)
        assert maxx == pytest.approx(1100, abs=1)

    def test_arbitrary_offset(self):
        wall = OffsetWall(
            centerline=LineString([(0, 0), (1000, 0)]),
            thickness=200,
        )
        offset_300 = wall.offset_by(300)
        coords = list(offset_300.coords)
        for _, y in coords:
            assert y == pytest.approx(300, abs=1)

    def test_diagonal_wall(self):
        wall = OffsetWall(
            centerline=LineString([(0, 0), (3000, 4000)]),
            thickness=200,
        )
        # Length should be 5000
        assert wall.centerline.length == pytest.approx(5000)
        # Area should still be length * thickness
        assert wall.polygon.area == pytest.approx(5000 * 200, rel=0.01)


class TestWallCorner:
    def test_right_angle(self):
        wall_a = OffsetWall(LineString([(0, 0), (1000, 0)]), 200)
        wall_b = OffsetWall(LineString([(1000, 0), (1000, 1000)]), 200)
        corner = WallCorner(wall_a, wall_b, (1000, 0))
        assert corner.angle_degrees == pytest.approx(90, abs=1)
        assert not corner.is_acute

    def test_acute_angle(self):
        wall_a = OffsetWall(LineString([(0, 0), (1000, 0)]), 200)
        wall_b = OffsetWall(LineString([(1000, 0), (1200, 100)]), 200)
        corner = WallCorner(wall_a, wall_b, (1000, 0))
        assert corner.angle_degrees < 60
        assert corner.is_acute

    def test_resolve_produces_valid_polygon(self):
        wall_a = OffsetWall(LineString([(0, 0), (1000, 0)]), 200)
        wall_b = OffsetWall(LineString([(1000, 0), (1000, 1000)]), 200)
        corner = WallCorner(wall_a, wall_b, (1000, 0))
        result = corner.resolve()
        assert result.is_valid
        assert result.area > 0


class TestComputeMitrePoint:
    def test_90_degree_corner(self):
        line_a = LineString([(0, 0), (1000, 0)])
        line_b = LineString([(1000, 0), (1000, 1000)])
        pt = compute_mitre_point(line_a, line_b, 100)
        assert pt is not None
        # Left of line_a (going right) = upward (+Y).
        # Left of line_b (going up) = leftward (-X).
        # These two offset lines intersect at (900, 100).
        assert pt[0] == pytest.approx(900, abs=10)
        assert pt[1] == pytest.approx(100, abs=10)

    def test_parallel_lines_returns_none(self):
        line_a = LineString([(0, 0), (1000, 0)])
        line_b = LineString([(0, 200), (1000, 200)])
        pt = compute_mitre_point(line_a, line_b, 100)
        # Parallel lines don't produce a mitre point
        # (their offsets are also parallel)
        assert pt is None


class TestResolveWallIntersections:
    def test_empty_list(self):
        result = resolve_wall_intersections([])
        assert result.is_empty

    def test_single_wall(self):
        walls = [OffsetWall(LineString([(0, 0), (5000, 0)]), 200)]
        result = resolve_wall_intersections(walls)
        assert result.is_valid
        assert result.area == pytest.approx(1_000_000, rel=0.02)

    def test_two_perpendicular_walls(self):
        walls = [
            OffsetWall(LineString([(0, 0), (5000, 0)]), 200),
            OffsetWall(LineString([(2500, -1000), (2500, 1000)]), 200),
        ]
        result = resolve_wall_intersections(walls)
        assert result.is_valid
        # Area should be less than sum of individual areas (overlap removed)
        individual_sum = sum(w.polygon.area for w in walls)
        assert result.area < individual_sum

    def test_closed_room(self):
        walls = [
            OffsetWall(LineString([(0, 0), (5000, 0)]), 200),
            OffsetWall(LineString([(5000, 0), (5000, 4000)]), 200),
            OffsetWall(LineString([(5000, 4000), (0, 4000)]), 200),
            OffsetWall(LineString([(0, 4000), (0, 0)]), 200),
        ]
        result = resolve_wall_intersections(walls)
        assert result.is_valid
        # Should have an interior ring (the room)
        if result.geom_type == "Polygon":
            assert len(list(result.interiors)) == 1


class TestFindTJunctions:
    def test_partition_creates_t_junction(self):
        walls = [
            OffsetWall(LineString([(0, 0), (5000, 0)]), 200),     # bottom
            OffsetWall(LineString([(5000, 0), (5000, 4000)]), 200), # right
            OffsetWall(LineString([(5000, 4000), (0, 4000)]), 200), # top
            OffsetWall(LineString([(0, 4000), (0, 0)]), 200),      # left
            OffsetWall(LineString([(2500, 0), (2500, 4000)]), 150), # partition
        ]
        junctions = find_t_junctions(walls, tolerance=10)
        # Partition endpoints touch bottom and top walls = 2 T-junctions
        assert len(junctions) >= 2

    def test_no_t_junction_for_l_corner(self):
        walls = [
            OffsetWall(LineString([(0, 0), (1000, 0)]), 200),
            OffsetWall(LineString([(1000, 0), (1000, 1000)]), 200),
        ]
        junctions = find_t_junctions(walls, tolerance=10)
        assert len(junctions) == 0  # L-corner, not T


class TestFindCrossings:
    def test_crossing_walls(self):
        walls = [
            OffsetWall(LineString([(0, 500), (1000, 500)]), 200),
            OffsetWall(LineString([(500, 0), (500, 1000)]), 200),
        ]
        crossings = find_crossings(walls)
        assert len(crossings) == 1
        pt = crossings[0]["intersection_point"]
        assert pt[0] == pytest.approx(500)
        assert pt[1] == pytest.approx(500)

    def test_no_crossing_for_parallel(self):
        walls = [
            OffsetWall(LineString([(0, 0), (1000, 0)]), 200),
            OffsetWall(LineString([(0, 500), (1000, 500)]), 200),
        ]
        crossings = find_crossings(walls)
        assert len(crossings) == 0


class TestPolygonOffset:
    def test_inward_offset(self):
        from shapely.geometry import box
        poly = box(0, 0, 1000, 1000)
        shrunk = offset_polygon_inward(poly, 100)
        assert shrunk is not None
        assert shrunk.area == pytest.approx(800 * 800, rel=0.05)

    def test_inward_offset_collapse(self):
        from shapely.geometry import box
        poly = box(0, 0, 100, 100)
        result = offset_polygon_inward(poly, 200)  # larger than half-width
        assert result is None

    def test_outward_offset(self):
        from shapely.geometry import box
        poly = box(0, 0, 1000, 1000)
        grown = offset_polygon_outward(poly, 100)
        assert grown.area > poly.area
        assert grown.area == pytest.approx(1200 * 1200, rel=0.05)
