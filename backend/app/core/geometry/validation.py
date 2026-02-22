"""Polygon coordinate validation, auto-closing, and sanitization.

This module catches bad geometry BEFORE it reaches Shapely, producing
clear error messages instead of cryptic topology exceptions.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum, auto

from shapely.geometry import Polygon, LinearRing, LineString, Point
from shapely.validation import make_valid, explain_validity


class ValidationSeverity(Enum):
    ERROR = auto()    # blocks processing
    WARNING = auto()  # auto-fixable, continue with correction
    INFO = auto()     # informational only


@dataclass
class GeometryIssue:
    severity: ValidationSeverity
    code: str
    message: str
    location: tuple[float, float] | None = None


@dataclass
class ValidationResult:
    polygon: Polygon | None
    issues: list[GeometryIssue] = field(default_factory=list)

    @property
    def valid(self) -> bool:
        return not any(i.severity == ValidationSeverity.ERROR for i in self.issues)

    @property
    def errors(self) -> list[GeometryIssue]:
        return [i for i in self.issues if i.severity == ValidationSeverity.ERROR]

    @property
    def warnings(self) -> list[GeometryIssue]:
        return [i for i in self.issues if i.severity == ValidationSeverity.WARNING]


# ── 1. Coordinate-level validation ──────────────────────────────────────

def validate_coordinates(coords: list[tuple[float, float]]) -> list[GeometryIssue]:
    """Check raw coordinate list for problems before building a polygon."""
    issues: list[GeometryIssue] = []

    # Must have at least 3 distinct points to form a polygon
    if len(coords) < 3:
        issues.append(GeometryIssue(
            ValidationSeverity.ERROR,
            "TOO_FEW_POINTS",
            f"Need at least 3 points for a polygon, got {len(coords)}",
        ))
        return issues

    # Check for non-finite values (NaN, inf)
    for i, (x, y) in enumerate(coords):
        if not (math.isfinite(x) and math.isfinite(y)):
            issues.append(GeometryIssue(
                ValidationSeverity.ERROR,
                "NON_FINITE_COORD",
                f"Point {i} has non-finite coordinate ({x}, {y})",
                location=(x if math.isfinite(x) else 0, y if math.isfinite(y) else 0),
            ))

    # Check for consecutive duplicate points
    dedup_count = 0
    for i in range(len(coords) - 1):
        if _points_equal(coords[i], coords[i + 1]):
            dedup_count += 1
            issues.append(GeometryIssue(
                ValidationSeverity.WARNING,
                "CONSECUTIVE_DUPLICATE",
                f"Points {i} and {i+1} are identical at ({coords[i][0]}, {coords[i][1]})",
                location=coords[i],
            ))

    # After removing duplicates, still need 3 distinct points
    unique = _deduplicate_consecutive(coords)
    if len(unique) < 3:
        issues.append(GeometryIssue(
            ValidationSeverity.ERROR,
            "DEGENERATE_AFTER_DEDUP",
            f"Only {len(unique)} unique consecutive points — cannot form polygon",
        ))

    # Check for collinear points (all on the same line = zero area)
    if len(unique) >= 3 and _all_collinear(unique):
        issues.append(GeometryIssue(
            ValidationSeverity.ERROR,
            "ALL_COLLINEAR",
            "All points are collinear — polygon would have zero area",
        ))

    # Check for extremely small edges (< 1mm)
    for i in range(len(coords) - 1):
        d = _distance(coords[i], coords[i + 1])
        if 0 < d < 1.0:
            issues.append(GeometryIssue(
                ValidationSeverity.WARNING,
                "MICRO_EDGE",
                f"Edge {i}-{i+1} is only {d:.3f}mm long",
                location=coords[i],
            ))

    return issues


# ── 2. Auto-closing shapes ─────────────────────────────────────────────

def auto_close_ring(
    coords: list[tuple[float, float]],
    tolerance: float = 5.0,
) -> tuple[list[tuple[float, float]], list[GeometryIssue]]:
    """Ensure a coordinate ring is closed, snapping the last point to
    the first if they're within tolerance.

    Three cases:
    1. Already closed (first == last): return as-is
    2. Gap < tolerance: snap last point to first (WARNING)
    3. Gap >= tolerance: append first point as new last point (WARNING)

    Returns (closed_coords, issues).
    """
    issues: list[GeometryIssue] = []

    if len(coords) < 3:
        return coords, issues

    first = coords[0]
    last = coords[-1]
    gap = _distance(first, last)

    if _points_equal(first, last):
        # Case 1: already closed
        return coords, issues

    if gap <= tolerance:
        # Case 2: close enough — snap last to first
        closed = coords[:-1] + [first]
        issues.append(GeometryIssue(
            ValidationSeverity.WARNING,
            "SNAPPED_CLOSED",
            f"Snapped last point to first (gap was {gap:.2f}mm)",
            location=last,
        ))
        return closed, issues

    # Case 3: significant gap — append closing point
    closed = coords + [first]
    issues.append(GeometryIssue(
        ValidationSeverity.WARNING,
        "AUTO_CLOSED",
        f"Appended closing segment ({gap:.1f}mm gap between first and last point)",
        location=last,
    ))
    return closed, issues


# ── 3. Full polygon validation + repair ────────────────────────────────

def validate_polygon(
    coords: list[tuple[float, float]],
    auto_fix: bool = True,
    close_tolerance: float = 5.0,
) -> ValidationResult:
    """Full validation pipeline for a polygon coordinate ring.

    Steps:
    1. Validate raw coordinates (NaN, duplicates, collinearity)
    2. Auto-close if needed
    3. Build Shapely polygon
    4. Check Shapely validity (self-intersection, etc.)
    5. Optionally repair with make_valid()

    Returns a ValidationResult with the (possibly repaired) polygon
    and all issues found.
    """
    all_issues: list[GeometryIssue] = []

    # Step 1: coordinate-level checks
    coord_issues = validate_coordinates(coords)
    all_issues.extend(coord_issues)

    if any(i.severity == ValidationSeverity.ERROR for i in coord_issues):
        return ValidationResult(polygon=None, issues=all_issues)

    # Clean consecutive duplicates before proceeding
    clean_coords = _deduplicate_consecutive(coords)

    # Step 2: auto-close
    closed_coords, close_issues = auto_close_ring(clean_coords, close_tolerance)
    all_issues.extend(close_issues)

    # Step 3: build Shapely polygon
    try:
        poly = Polygon(closed_coords)
    except Exception as e:
        all_issues.append(GeometryIssue(
            ValidationSeverity.ERROR,
            "SHAPELY_CONSTRUCTION_FAILED",
            f"Could not construct polygon: {e}",
        ))
        return ValidationResult(polygon=None, issues=all_issues)

    # Step 4: check Shapely validity
    if not poly.is_valid:
        reason = explain_validity(poly)
        all_issues.append(GeometryIssue(
            ValidationSeverity.WARNING if auto_fix else ValidationSeverity.ERROR,
            "INVALID_GEOMETRY",
            f"Shapely reports: {reason}",
        ))

        if auto_fix:
            # Step 5: repair
            poly = make_valid(poly)
            if poly.geom_type == "MultiPolygon":
                # Take the largest polygon from the result
                poly = max(poly.geoms, key=lambda p: p.area)
            all_issues.append(GeometryIssue(
                ValidationSeverity.INFO,
                "AUTO_REPAIRED",
                "Polygon was repaired with make_valid()",
            ))
        else:
            return ValidationResult(polygon=None, issues=all_issues)

    # Check orientation (should be CCW for exterior ring)
    if poly.exterior.is_ccw is False:
        all_issues.append(GeometryIssue(
            ValidationSeverity.WARNING,
            "CW_ORIENTATION",
            "Ring was clockwise — reversed to CCW (standard exterior orientation)",
        ))
        poly = Polygon(list(reversed(list(poly.exterior.coords))))

    # Check for degenerate area
    if poly.area < 1.0:  # < 1 mm²
        all_issues.append(GeometryIssue(
            ValidationSeverity.ERROR,
            "ZERO_AREA",
            f"Polygon has negligible area ({poly.area:.4f} mm²)",
        ))
        return ValidationResult(polygon=None, issues=all_issues)

    return ValidationResult(polygon=poly, issues=all_issues)


# ── 4. Wall chain auto-closing ─────────────────────────────────────────

def auto_close_wall_chain(
    segments: list[tuple[tuple[float, float], tuple[float, float]]],
    tolerance: float = 5.0,
) -> tuple[list[tuple], list[GeometryIssue]]:
    """Detect if a chain of wall segments forms an almost-closed loop
    and snap the gap shut.

    A wall chain is 'almost closed' when the end of the last segment
    is within tolerance of the start of the first segment.

    Returns (fixed_segments, issues).
    """
    issues: list[GeometryIssue] = []

    if len(segments) < 2:
        return segments, issues

    first_start = segments[0][0]
    last_end = segments[-1][1]
    gap = _distance(first_start, last_end)

    if gap < 0.01:
        # Already closed
        return segments, issues

    if gap <= tolerance:
        # Snap: modify the last segment's endpoint
        fixed = list(segments)
        old_last = fixed[-1]
        fixed[-1] = (old_last[0], first_start)
        issues.append(GeometryIssue(
            ValidationSeverity.WARNING,
            "CHAIN_SNAPPED",
            f"Snapped last wall endpoint to close {gap:.2f}mm gap",
            location=last_end,
        ))
        return fixed, issues

    # Gap too large — add a closing segment
    fixed = list(segments) + [(last_end, first_start)]
    issues.append(GeometryIssue(
        ValidationSeverity.WARNING,
        "CHAIN_AUTO_CLOSED",
        f"Added closing wall segment to bridge {gap:.1f}mm gap",
        location=last_end,
    ))
    return fixed, issues


# ── Helpers ─────────────────────────────────────────────────────────────

def _distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(b[0] - a[0], b[1] - a[1])


def _points_equal(a: tuple[float, float], b: tuple[float, float], eps: float = 1e-9) -> bool:
    return abs(a[0] - b[0]) < eps and abs(a[1] - b[1]) < eps


def _deduplicate_consecutive(coords: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if not coords:
        return []
    result = [coords[0]]
    for c in coords[1:]:
        if not _points_equal(c, result[-1]):
            result.append(c)
    return result


def _all_collinear(points: list[tuple[float, float]]) -> bool:
    """Check if all points lie on a single line using cross product."""
    if len(points) < 3:
        return True
    x0, y0 = points[0]
    x1, y1 = points[1]
    for x2, y2 in points[2:]:
        cross = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0)
        if abs(cross) > 1e-6:
            return False
    return True
