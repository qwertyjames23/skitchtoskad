"""Semantic validation of the parsed AST."""

from __future__ import annotations

from dataclasses import dataclass

from app.core.parser.ast_nodes import (
    FloorPlanAST,
    WallCommand,
    DoorCommand,
    WindowCommand,
    LabelCommand,
    LotCommand,
    SetbackCommand,
)
from app.utils.units import VALID_UNITS


@dataclass
class ValidationError:
    message: str
    line: int


def validate(ast: FloorPlanAST) -> list[ValidationError]:
    """Run semantic checks on the parsed AST. Returns list of errors (empty = valid)."""
    errors: list[ValidationError] = []

    # Check unit
    if ast.unit not in VALID_UNITS:
        errors.append(ValidationError(
            f"Invalid unit '{ast.unit}'. Must be one of: {', '.join(sorted(VALID_UNITS))}",
            line=0,
        ))

    # Check walls — required unless a LOT command is present (lot-only view is valid)
    if not ast.walls and ast.lot is None:
        errors.append(ValidationError("No walls defined. At least one WALL is required (or define a LOT).", line=0))

    for wall in ast.walls:
        if wall.start == wall.end:
            errors.append(ValidationError(
                f"Wall has zero length (start == end at {wall.start})",
                line=wall.line,
            ))
        if wall.thickness <= 0:
            errors.append(ValidationError(
                f"Wall thickness must be positive, got {wall.thickness}",
                line=wall.line,
            ))
        if wall.thickness > 1000:
            errors.append(ValidationError(
                f"Wall thickness {wall.thickness}mm seems too large (max 1000mm)",
                line=wall.line,
            ))

    # Check doors
    for door in ast.doors:
        if door.start == door.end:
            errors.append(ValidationError(
                f"Door has zero width (start == end at {door.start})",
                line=door.line,
            ))
        if door.swing not in ("left", "right", "double"):
            errors.append(ValidationError(
                f"Invalid door swing '{door.swing}'. Must be left, right, or double.",
                line=door.line,
            ))

    # Check windows
    for window in ast.windows:
        if window.start == window.end:
            errors.append(ValidationError(
                f"Window has zero width (start == end at {window.start})",
                line=window.line,
            ))

    # Check lot
    if ast.lot is not None:
        lot = ast.lot
        if len(lot.vertices) < 3:
            errors.append(ValidationError("LOT requires at least 3 vertices.", line=lot.line))

    # Check setback
    if ast.setback is not None:
        sb = ast.setback
        for side, val in [("front", sb.front), ("rear", sb.rear), ("left", sb.left), ("right", sb.right)]:
            if val < 0:
                errors.append(ValidationError(f"Setback '{side}' must be non-negative.", line=sb.line))

    # Check labels
    seen_labels: set[str] = set()
    for label in ast.labels:
        if not label.text:
            errors.append(ValidationError("Label has empty text", line=label.line))
        if label.text in seen_labels:
            errors.append(ValidationError(
                f"Duplicate label '{label.text}'",
                line=label.line,
            ))
        seen_labels.add(label.text)

    return errors
