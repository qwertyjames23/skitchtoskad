"""Bridge between parser AST and geometry engine."""

from __future__ import annotations

from app.core.parser.ast_nodes import FloorPlanAST, FloorCommand, UnitCommand, LotCommand, SetbackCommand, NorthCommand
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

    # FURNITURE commands
    for furn_cmd in ast.furniture_commands:
        plan.furniture.append({
            "x": furn_cmd.position[0],
            "y": furn_cmd.position[1],
            "fixture_type": furn_cmd.fixture_type,
            "rotation": furn_cmd.rotation,
        })

    # ROOM commands — act as labels with optional color; take priority over plain LABEL
    for room_cmd in ast.room_commands:
        plan.labels[room_cmd.text] = room_cmd.position
        if room_cmd.color:
            plan.room_colors[room_cmd.text] = room_cmd.color

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


def ast_to_floors(ast: FloorPlanAST) -> list[dict]:
    """Build a separate BuiltPlan per FLOOR section.

    Returns an empty list when no FLOOR commands are present (single-floor plan).
    Global commands (LOT, SETBACK, NORTH, UNIT) are shared across all floors.
    """
    _GLOBAL_TYPES = (UnitCommand, LotCommand, SetbackCommand, NorthCommand)
    _FLOOR_TYPE = FloorCommand

    # Exit early if no FLOOR commands
    if not any(isinstance(c, _FLOOR_TYPE) for c in ast.commands):
        return []

    # Collect global commands (apply to every floor)
    global_cmds = [c for c in ast.commands if isinstance(c, _GLOBAL_TYPES)]

    # Partition floor-specific commands
    floor_buckets: dict[int, list] = {}
    current_floor = 1
    for cmd in ast.commands:
        if isinstance(cmd, _FLOOR_TYPE):
            current_floor = cmd.level
            if current_floor not in floor_buckets:
                floor_buckets[current_floor] = []
        elif not isinstance(cmd, _GLOBAL_TYPES):
            if current_floor not in floor_buckets:
                floor_buckets[current_floor] = []
            floor_buckets[current_floor].append(cmd)

    if not floor_buckets:
        return []

    result: list[dict] = []
    for floor_num in sorted(floor_buckets.keys()):
        sub_cmds = global_cmds + floor_buckets[floor_num]
        sub_ast = FloorPlanAST(commands=sub_cmds, unit=ast.unit)
        try:
            built = ast_to_plan(sub_ast)
            result.append({"floor": floor_num, **built.to_response()})
        except Exception:
            pass

    return result
