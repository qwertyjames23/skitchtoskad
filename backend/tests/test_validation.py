"""Tests for polygon validation, auto-closing, and sanitization."""

import pytest
import math
from app.core.geometry.validation import (
    validate_coordinates,
    auto_close_ring,
    validate_polygon,
    auto_close_wall_chain,
    ValidationSeverity,
)


class TestValidateCoordinates:
    def test_valid_triangle(self):
        coords = [(0, 0), (1000, 0), (500, 1000)]
        issues = validate_coordinates(coords)
        errors = [i for i in issues if i.severity == ValidationSeverity.ERROR]
        assert len(errors) == 0

    def test_too_few_points(self):
        coords = [(0, 0), (1000, 0)]
        issues = validate_coordinates(coords)
        assert any(i.code == "TOO_FEW_POINTS" for i in issues)

    def test_nan_coordinate(self):
        coords = [(0, 0), (float("nan"), 100), (500, 1000)]
        issues = validate_coordinates(coords)
        assert any(i.code == "NON_FINITE_COORD" for i in issues)

    def test_inf_coordinate(self):
        coords = [(0, 0), (float("inf"), 100), (500, 1000)]
        issues = validate_coordinates(coords)
        assert any(i.code == "NON_FINITE_COORD" for i in issues)

    def test_consecutive_duplicates(self):
        coords = [(0, 0), (0, 0), (1000, 0), (500, 1000)]
        issues = validate_coordinates(coords)
        assert any(i.code == "CONSECUTIVE_DUPLICATE" for i in issues)

    def test_all_collinear(self):
        coords = [(0, 0), (100, 0), (200, 0), (300, 0)]
        issues = validate_coordinates(coords)
        assert any(i.code == "ALL_COLLINEAR" for i in issues)

    def test_not_collinear(self):
        coords = [(0, 0), (100, 0), (100, 100)]
        issues = validate_coordinates(coords)
        assert not any(i.code == "ALL_COLLINEAR" for i in issues)

    def test_micro_edge_warning(self):
        coords = [(0, 0), (0.5, 0), (500, 1000)]
        issues = validate_coordinates(coords)
        assert any(i.code == "MICRO_EDGE" for i in issues)

    def test_degenerate_after_dedup(self):
        coords = [(0, 0), (0, 0), (100, 0), (100, 0)]
        issues = validate_coordinates(coords)
        assert any(i.code == "DEGENERATE_AFTER_DEDUP" for i in issues)


class TestAutoCloseRing:
    def test_already_closed(self):
        coords = [(0, 0), (1000, 0), (500, 1000), (0, 0)]
        closed, issues = auto_close_ring(coords)
        assert closed == coords
        assert len(issues) == 0

    def test_snap_small_gap(self):
        coords = [(0, 0), (1000, 0), (500, 1000), (0.5, 0.5)]
        closed, issues = auto_close_ring(coords, tolerance=5.0)
        assert closed[-1] == (0, 0)  # snapped to first
        assert any(i.code == "SNAPPED_CLOSED" for i in issues)

    def test_append_for_large_gap(self):
        coords = [(0, 0), (1000, 0), (500, 1000)]
        closed, issues = auto_close_ring(coords, tolerance=5.0)
        assert closed[-1] == (0, 0)  # appended first point
        assert len(closed) == 4  # one point added
        assert any(i.code == "AUTO_CLOSED" for i in issues)

    def test_too_few_points(self):
        coords = [(0, 0), (100, 0)]
        closed, issues = auto_close_ring(coords)
        assert closed == coords  # unchanged


class TestValidatePolygon:
    def test_valid_square(self):
        coords = [(0, 0), (1000, 0), (1000, 1000), (0, 1000)]
        result = validate_polygon(coords)
        assert result.valid
        assert result.polygon is not None
        assert result.polygon.area == pytest.approx(1_000_000)

    def test_auto_closes(self):
        coords = [(0, 0), (1000, 0), (1000, 1000), (0, 1000)]
        result = validate_polygon(coords)
        assert result.valid
        # The polygon exterior should be closed
        ext = list(result.polygon.exterior.coords)
        assert ext[0] == ext[-1]

    def test_self_intersecting_bowtie(self):
        # Bowtie: two triangles sharing a point, self-intersecting
        coords = [(0, 0), (1000, 1000), (1000, 0), (0, 1000)]
        result = validate_polygon(coords, auto_fix=True)
        assert result.valid  # repaired
        assert any(i.code == "INVALID_GEOMETRY" for i in result.issues)
        assert any(i.code == "AUTO_REPAIRED" for i in result.issues)

    def test_self_intersecting_no_fix(self):
        coords = [(0, 0), (1000, 1000), (1000, 0), (0, 1000)]
        result = validate_polygon(coords, auto_fix=False)
        assert not result.valid

    def test_zero_area(self):
        coords = [(0, 0), (1000, 0), (2000, 0)]  # collinear
        result = validate_polygon(coords)
        assert not result.valid

    def test_rejects_nan(self):
        coords = [(0, 0), (float("nan"), 100), (500, 1000)]
        result = validate_polygon(coords)
        assert not result.valid

    def test_snaps_near_closed_ring(self):
        coords = [(0, 0), (1000, 0), (1000, 1000), (0, 1000), (0.5, 0.3)]
        result = validate_polygon(coords, close_tolerance=5.0)
        assert result.valid
        assert any(i.code == "SNAPPED_CLOSED" for i in result.issues)


class TestAutoCloseWallChain:
    def test_already_closed(self):
        segments = [
            ((0, 0), (1000, 0)),
            ((1000, 0), (1000, 1000)),
            ((1000, 1000), (0, 1000)),
            ((0, 1000), (0, 0)),
        ]
        fixed, issues = auto_close_wall_chain(segments)
        assert len(fixed) == 4
        assert len(issues) == 0

    def test_snap_small_gap(self):
        segments = [
            ((0, 0), (1000, 0)),
            ((1000, 0), (1000, 1000)),
            ((1000, 1000), (0, 1000)),
            ((0, 1000), (0.5, 0.3)),  # 0.58mm gap
        ]
        fixed, issues = auto_close_wall_chain(segments, tolerance=5.0)
        assert fixed[-1][1] == (0, 0)  # snapped
        assert any(i.code == "CHAIN_SNAPPED" for i in issues)

    def test_adds_closing_segment(self):
        segments = [
            ((0, 0), (1000, 0)),
            ((1000, 0), (1000, 1000)),
            ((1000, 1000), (0, 1000)),
            # missing the closing segment from (0,1000) -> (0,0)
        ]
        fixed, issues = auto_close_wall_chain(segments, tolerance=5.0)
        assert len(fixed) == 4  # closing segment added
        assert fixed[-1] == ((0, 1000), (0, 0))
        assert any(i.code == "CHAIN_AUTO_CLOSED" for i in issues)
