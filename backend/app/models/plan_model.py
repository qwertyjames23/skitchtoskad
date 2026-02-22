"""Bridge between parser AST and geometry engine."""

from __future__ import annotations

from app.core.parser.ast_nodes import FloorPlanAST
from app.core.geometry.plan import FloorPlan, BuiltPlan
from app.core.geometry.opening import Door, Window
from app.core.geometry.lot import build_lot_geometry


def ast_to_plan(ast: FloorPlanAST) -> BuiltPlan:
    """Convert a parsed AST into a built floor plan with geometry."""
    plan = FloorPlan(unit=ast.unit)

    for wall_cmd in ast.walls:
        plan.walls.add(
            start=wall_cmd.start,
            end=wall_cmd.end,
            thickness=wall_cmd.thickness,
        )

    for door_cmd in ast.doors:
        plan.doors.append(Door(
            start=door_cmd.start,
            end=door_cmd.end,
            swing=door_cmd.swing,
        ))

    for win_cmd in ast.windows:
        plan.windows.append(Window(
            start=win_cmd.start,
            end=win_cmd.end,
            sill_height=win_cmd.sill_height,
            head_height=win_cmd.head_height,
        ))

    for label_cmd in ast.labels:
        plan.labels[label_cmd.text] = label_cmd.position

    # Lot plan
    if ast.lot is not None:
        sb = ast.setback
        north = ast.north
        plan.lot = build_lot_geometry(
            vertices=ast.lot.vertices,
            front=sb.front if sb else 0.0,
            rear=sb.rear if sb else 0.0,
            left=sb.left if sb else 0.0,
            right=sb.right if sb else 0.0,
            north_angle=north.angle if north else 90.0,
        )

    return plan.build()
