"""Block definitions for doors, windows, and symbols.

Blocks are reusable component definitions in DXF. Instead of drawing
a door as separate line + arc entities every time, we define the door
geometry ONCE as a block, then INSERT it at each location with a
rotation angle and scale.

Why blocks matter for AutoCAD users:
  - Select a door → it highlights as one object, not loose lines
  - Change the block definition → every instance updates
  - Block attributes can carry metadata (door ID, fire rating, etc.)
  - Schedules and quantity takeoffs count block insertions

All blocks are defined at the origin with unit width (1mm = 1 unit).
The INSERT command scales them to the actual opening width.
"""

from __future__ import annotations

import math
import ezdxf
from ezdxf.document import Drawing
from ezdxf.layouts import BlockLayout

from app.core.exporter.dxf_layers import BlockNames


def register_all_blocks(doc: Drawing) -> None:
    """Register all SKAD block definitions in the document."""
    _create_door_single_left(doc)
    _create_door_single_right(doc)
    _create_door_double(doc)
    _create_window_standard(doc)
    _create_window_fixed(doc)
    _create_north_arrow(doc)


# ── Door blocks ─────────────────────────────────────────────────────────
#
# Door block geometry is defined at origin, 1 unit wide.
# Convention:
#   - Base point (0,0) = hinge side
#   - (1,0) = latch side
#   - Door panel = line from hinge to latch
#   - Swing arc = 90° arc showing door travel
#   - Wall break lines = short lines at frame edges
#
# When inserted:
#   - X scale = opening width (e.g., 900 for a 900mm door)
#   - Y scale = 1 (or -1 to flip the swing side)
#   - Rotation = angle of the wall at that opening

def _create_door_single_left(doc: Drawing) -> None:
    """Single door, hinged on left (start), swinging upward (+Y)."""
    blk = doc.blocks.new(name=BlockNames.DOOR_SINGLE_LEFT)

    # Door panel: line from hinge (0,0) to latch (1,0)
    blk.add_line((0, 0), (1, 0), dxfattribs={"layer": "A-DOOR"})

    # Swing arc: 90° from closed (along +X) to open (along +Y)
    # Arc centered at hinge point (0,0), radius = door width (1 unit)
    blk.add_arc(
        center=(0, 0),
        radius=1,
        start_angle=0,
        end_angle=90,
        dxfattribs={"layer": "A-DOOR-SWING"},
    )

    # Frame ticks: short perpendicular lines at each jamb
    blk.add_line((0, -0.1), (0, 0.1), dxfattribs={"layer": "A-DOOR"})
    blk.add_line((1, -0.1), (1, 0.1), dxfattribs={"layer": "A-DOOR"})


def _create_door_single_right(doc: Drawing) -> None:
    """Single door, hinged on right (end), swinging upward (+Y)."""
    blk = doc.blocks.new(name=BlockNames.DOOR_SINGLE_RIGHT)

    # Door panel
    blk.add_line((0, 0), (1, 0), dxfattribs={"layer": "A-DOOR"})

    # Swing arc centered at right jamb (1,0)
    blk.add_arc(
        center=(1, 0),
        radius=1,
        start_angle=90,
        end_angle=180,
        dxfattribs={"layer": "A-DOOR-SWING"},
    )

    # Frame ticks
    blk.add_line((0, -0.1), (0, 0.1), dxfattribs={"layer": "A-DOOR"})
    blk.add_line((1, -0.1), (1, 0.1), dxfattribs={"layer": "A-DOOR"})


def _create_door_double(doc: Drawing) -> None:
    """Double door — two leaves swinging outward from center."""
    blk = doc.blocks.new(name=BlockNames.DOOR_DOUBLE)

    # Left leaf: line from center (0.5,0) to left jamb (0,0)
    blk.add_line((0, 0), (0.5, 0), dxfattribs={"layer": "A-DOOR"})
    # Right leaf: line from center (0.5,0) to right jamb (1,0)
    blk.add_line((0.5, 0), (1, 0), dxfattribs={"layer": "A-DOOR"})

    # Left swing arc (from left jamb outward)
    blk.add_arc(
        center=(0, 0),
        radius=0.5,
        start_angle=0,
        end_angle=90,
        dxfattribs={"layer": "A-DOOR-SWING"},
    )

    # Right swing arc (from right jamb outward)
    blk.add_arc(
        center=(1, 0),
        radius=0.5,
        start_angle=90,
        end_angle=180,
        dxfattribs={"layer": "A-DOOR-SWING"},
    )

    # Frame ticks
    blk.add_line((0, -0.1), (0, 0.1), dxfattribs={"layer": "A-DOOR"})
    blk.add_line((1, -0.1), (1, 0.1), dxfattribs={"layer": "A-DOOR"})


# ── Window blocks ───────────────────────────────────────────────────────
#
# Window block geometry: 1 unit wide, centered on centerline.
# Convention:
#   - Base point (0,0) = left edge of opening
#   - (1,0) = right edge of opening
#   - Three parallel lines = glass pane symbol in plan view
#   - Frame lines at each jamb
#
# Standard window: 3 parallel lines (outer frame, glass, outer frame)
# Fixed window: 2 diagonal lines forming an X (non-operable)

def _create_window_standard(doc: Drawing) -> None:
    """Standard operable window — three parallel lines."""
    blk = doc.blocks.new(name=BlockNames.WINDOW_STANDARD)

    # Glass pane lines — offset from centerline by ±0.05 units
    for offset_y in [-0.05, 0.0, 0.05]:
        blk.add_line(
            (0, offset_y), (1, offset_y),
            dxfattribs={"layer": "A-GLAZ"},
        )

    # Frame ticks at each jamb
    blk.add_line((0, -0.08), (0, 0.08), dxfattribs={"layer": "A-GLAZ"})
    blk.add_line((1, -0.08), (1, 0.08), dxfattribs={"layer": "A-GLAZ"})


def _create_window_fixed(doc: Drawing) -> None:
    """Fixed (non-operable) window — three lines + X pattern."""
    blk = doc.blocks.new(name=BlockNames.WINDOW_FIXED)

    # Glass pane lines
    for offset_y in [-0.05, 0.0, 0.05]:
        blk.add_line(
            (0, offset_y), (1, offset_y),
            dxfattribs={"layer": "A-GLAZ"},
        )

    # X pattern indicating fixed glass
    blk.add_line((0, -0.05), (1, 0.05), dxfattribs={"layer": "A-GLAZ"})
    blk.add_line((0, 0.05), (1, -0.05), dxfattribs={"layer": "A-GLAZ"})

    # Frame ticks
    blk.add_line((0, -0.08), (0, 0.08), dxfattribs={"layer": "A-GLAZ"})
    blk.add_line((1, -0.08), (1, 0.08), dxfattribs={"layer": "A-GLAZ"})


# ── Symbol blocks ───────────────────────────────────────────────────────

def _create_north_arrow(doc: Drawing) -> None:
    """North arrow symbol — triangular arrow pointing up."""
    blk = doc.blocks.new(name=BlockNames.NORTH_ARROW)

    # Triangle pointing up
    blk.add_lwpolyline(
        [(0, 0), (0.3, -0.8), (-0.3, -0.8), (0, 0)],
        close=True,
        dxfattribs={"layer": "A-ANNO-NOTE"},
    )

    # "N" label
    blk.add_text(
        "N", height=0.3,
        dxfattribs={"layer": "A-ANNO-NOTE"},
    ).set_placement((0, 0.15))


# ── Block insertion helpers ─────────────────────────────────────────────

def compute_door_insertion(
    start: tuple[float, float],
    end: tuple[float, float],
    swing: str,
) -> dict:
    """Compute INSERT parameters to place a door block at a wall opening.

    Returns dict with: block_name, insert_point, rotation, xscale, yscale.
    """
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    width = math.hypot(dx, dy)
    angle = math.degrees(math.atan2(dy, dx))

    if swing == "left":
        block_name = BlockNames.DOOR_SINGLE_LEFT
        insert_point = start
        yscale = 1
    elif swing == "right":
        block_name = BlockNames.DOOR_SINGLE_RIGHT
        insert_point = start
        yscale = 1
    else:  # double
        block_name = BlockNames.DOOR_DOUBLE
        insert_point = start
        yscale = 1

    return {
        "block_name": block_name,
        "insert_point": insert_point,
        "rotation": angle,
        "xscale": width,
        "yscale": width,  # uniform scale so arcs remain circular
    }


def compute_window_insertion(
    start: tuple[float, float],
    end: tuple[float, float],
    fixed: bool = False,
) -> dict:
    """Compute INSERT parameters to place a window block at a wall opening."""
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    width = math.hypot(dx, dy)
    angle = math.degrees(math.atan2(dy, dx))

    block_name = BlockNames.WINDOW_FIXED if fixed else BlockNames.WINDOW_STANDARD

    return {
        "block_name": block_name,
        "insert_point": start,
        "rotation": angle,
        "xscale": width,
        "yscale": width,
    }
