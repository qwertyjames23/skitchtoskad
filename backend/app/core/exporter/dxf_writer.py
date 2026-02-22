"""DXF export engine — produces AutoCAD-compatible .dxf files.

Design principles:
  - Doors and windows are block INSERTs, not loose geometry
  - Walls are LWPOLYLINE outlines + HATCH fills (SOLID pattern)
  - Every entity sits on an AIA-standard layer
  - Linetypes, text styles, and dimstyles are pre-configured
  - Output opens cleanly in AutoCAD 2010+ and LibreCAD

Entity structure per element:
  Wall:    LWPOLYLINE (outline) + HATCH (fill) + LWPOLYLINE (centerline)
  Door:    INSERT of door block (contains LINE panel + ARC swing + LINE ticks)
  Window:  INSERT of window block (contains 3x LINE glass + 2x LINE ticks)
  Room:    LWPOLYLINE (boundary) + TEXT (name) + TEXT (area)
  Dim:     DIMENSION entity with custom dimstyle
"""

from __future__ import annotations

import io
import math
from shapely.geometry import Polygon

import ezdxf
from ezdxf.enums import TextEntityAlignment

from app.core.exporter.dxf_layers import (
    LAYERS, CUSTOM_LINETYPES, TEXT_STYLES, DXF_UNITS, LAYER_MAP,
)
from app.core.exporter.dxf_blocks import (
    register_all_blocks,
    compute_door_insertion,
    compute_window_insertion,
)


class DXFExporter:
    """Builds a complete DXF document from floor plan geometry."""

    def __init__(self, unit: str = "mm"):
        self.doc = ezdxf.new("R2010", setup=True)
        self.msp = self.doc.modelspace()
        self.unit = unit

        self._setup_linetypes()
        self._setup_layers()
        self._setup_text_styles()
        self._setup_dimstyle()
        register_all_blocks(self.doc)

        # Header variables for AutoCAD compatibility
        self.doc.header["$INSUNITS"] = DXF_UNITS.get(unit, 4)
        self.doc.header["$LTSCALE"] = 1.0
        self.doc.header["$DIMSCALE"] = 1.0

    # ── Setup ───────────────────────────────────────────────────────────

    def _setup_linetypes(self):
        """Register custom linetypes (DASHED, CENTER, HIDDEN, DASHDOT)."""
        for lt in CUSTOM_LINETYPES:
            if lt["name"] not in self.doc.linetypes:
                self.doc.linetypes.add(
                    lt["name"],
                    pattern=lt["pattern"],
                    description=lt["description"],
                )

    def _setup_layers(self):
        """Create all AIA-standard layers with correct properties."""
        for layer_def in LAYERS:
            if layer_def.name in self.doc.layers:
                continue

            layer = self.doc.layers.add(
                layer_def.name,
                color=layer_def.color,
                linetype=layer_def.linetype,
            )
            layer.dxf.lineweight = layer_def.lineweight

            if not layer_def.plot:
                layer.dxf.plot = 0

            if layer_def.frozen:
                layer.freeze()

    def _setup_text_styles(self):
        """Register text styles with proper fonts."""
        for ts in TEXT_STYLES:
            if ts["name"] not in self.doc.styles:
                self.doc.styles.add(ts["name"], font=ts["font"])

    def _setup_dimstyle(self):
        """Configure dimension style for architectural floor plans."""
        if "SKAD_DIM" in self.doc.dimstyles:
            return

        style = self.doc.dimstyles.new("SKAD_DIM")
        style.dxf.dimtxt = 100       # text height (mm)
        style.dxf.dimasz = 80        # arrow size
        style.dxf.dimexo = 50        # extension line offset from origin
        style.dxf.dimexe = 80        # extension line extension past dim line
        style.dxf.dimclrd = 3        # dimension line color (green)
        style.dxf.dimclre = 3        # extension line color
        style.dxf.dimclrt = 3        # text color
        style.dxf.dimdec = 0         # decimal places (0 for mm)
        style.dxf.dimtad = 1         # text above dimension line
        style.dxf.dimgap = 40        # gap between text and dim line
        style.dxf.dimtih = 0         # text inside horizontal = off
        style.dxf.dimtoh = 0         # text outside horizontal = off
        style.dxf.dimse1 = 0         # show extension line 1
        style.dxf.dimse2 = 0         # show extension line 2

    # ── Walls ───────────────────────────────────────────────────────────

    def add_wall_polygon(self, polygon: Polygon):
        """Export wall as outline polyline + solid hatch + room cutouts.

        The polygon comes from Shapely after wall buffering. Its exterior
        ring is the wall outline, and interior rings are room cutouts.
        """
        if polygon.is_empty:
            return

        # 1. Exterior outline — heavy lineweight on A-WALL
        ext_coords = list(polygon.exterior.coords)
        self.msp.add_lwpolyline(
            ext_coords,
            close=True,
            dxfattribs={"layer": "A-WALL"},
        )

        # 2. Solid hatch fill
        hatch = self.msp.add_hatch(
            color=LAYER_MAP["A-WALL-FILL"].color,
            dxfattribs={"layer": "A-WALL-FILL"},
        )
        hatch.paths.add_polyline_path(ext_coords, is_closed=True)

        # 3. Interior holes (rooms) — outline + hatch cutout
        for interior in polygon.interiors:
            hole_coords = list(interior.coords)

            self.msp.add_lwpolyline(
                hole_coords,
                close=True,
                dxfattribs={"layer": "A-AREA-IDEN"},
            )

            # Subtract from wall hatch
            hatch.paths.add_polyline_path(hole_coords, is_closed=True)

    def add_wall_centerline(self, start: tuple, end: tuple):
        """Add a wall centerline (construction reference, non-printing)."""
        self.msp.add_line(
            start, end,
            dxfattribs={"layer": "A-WALL-CNTR"},
        )

    # ── Doors (block inserts) ──────────────────────────────────────────

    def add_door(self, start: tuple, end: tuple, swing: str = "left"):
        """Insert a door block at the opening location.

        The block is scaled to match the opening width and rotated
        to align with the wall direction. Each door is a single INSERT
        entity — selecting it in AutoCAD highlights the whole door,
        and it can be counted in schedules.
        """
        params = compute_door_insertion(start, end, swing)

        self.msp.add_blockref(
            params["block_name"],
            insert=params["insert_point"],
            dxfattribs={
                "layer": "A-DOOR",
                "xscale": params["xscale"],
                "yscale": params["yscale"],
                "rotation": params["rotation"],
            },
        )

    # ── Windows (block inserts) ────────────────────────────────────────

    def add_window(self, start: tuple, end: tuple, fixed: bool = False):
        """Insert a window block at the opening location."""
        params = compute_window_insertion(start, end, fixed)

        self.msp.add_blockref(
            params["block_name"],
            insert=params["insert_point"],
            dxfattribs={
                "layer": "A-GLAZ",
                "xscale": params["xscale"],
                "yscale": params["yscale"],
                "rotation": params["rotation"],
            },
        )

    # ── Room labels ────────────────────────────────────────────────────

    def add_room_label(self, position: tuple, name: str, area_sq_m: float):
        """Place room name and area text at the room centroid."""
        # Room name — larger text
        self.msp.add_text(
            name,
            height=150,
            dxfattribs={
                "layer": "A-ANNO-TEXT",
                "style": "SKAD_LABEL",
            },
        ).set_placement(position, align=TextEntityAlignment.MIDDLE_CENTER)

        # Area — smaller, below the name
        area_pos = (position[0], position[1] - 250)
        self.msp.add_text(
            f"{area_sq_m:.1f} m\u00b2",
            height=100,
            dxfattribs={
                "layer": "A-ANNO-AREA",
                "style": "SKAD_DIM",
            },
        ).set_placement(area_pos, align=TextEntityAlignment.MIDDLE_CENTER)

    # ── Dimensions ─────────────────────────────────────────────────────

    def add_dimension(self, start: tuple, end: tuple, offset: float = 300):
        """Add a linear dimension between two points.

        Auto-detects horizontal vs vertical orientation.
        """
        dx = end[0] - start[0]
        dy = end[1] - start[1]

        if abs(dx) >= abs(dy):
            base = (start[0], start[1] + offset)
            angle = 0
        else:
            base = (start[0] + offset, start[1])
            angle = 90

        dim = self.msp.add_linear_dim(
            base=base,
            p1=start,
            p2=end,
            angle=angle,
            dimstyle="SKAD_DIM",
            dxfattribs={"layer": "A-ANNO-DIMS"},
        )
        dim.render()

    def add_aligned_dimension(self, start: tuple, end: tuple, offset: float = 300):
        """Add a dimension aligned with an angled wall."""
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        if math.hypot(dx, dy) == 0:
            return

        dim = self.msp.add_aligned_dim(
            p1=start,
            p2=end,
            distance=offset,
            dimstyle="SKAD_DIM",
            dxfattribs={"layer": "A-ANNO-DIMS"},
        )
        dim.render()

    # ── Annotations ────────────────────────────────────────────────────

    def add_note(self, position: tuple, text: str, height: float = 80):
        """Add a general note annotation."""
        self.msp.add_mtext(
            text,
            dxfattribs={
                "layer": "A-ANNO-NOTE",
                "style": "SKAD_NOTE",
                "char_height": height,
                "width": 2000,
            },
        ).set_location(insert=position)

    def add_lot_boundary(self, coords: list[tuple]):
        """Draw the property/lot boundary polyline on A-PROP layer."""
        self.msp.add_lwpolyline(
            coords,
            close=True,
            dxfattribs={"layer": "A-PROP"},
        )

    def add_setback_polygon(self, coords: list[tuple]):
        """Draw the setback / building-envelope line on A-PROP-SETB layer."""
        self.msp.add_lwpolyline(
            coords,
            close=True,
            dxfattribs={"layer": "A-PROP-SETB", "linetype": "DASHED"},
        )

    def add_north_arrow(self, position: tuple, scale: float = 500):
        """Insert a north arrow symbol."""
        self.msp.add_blockref(
            "SKAD_NORTH",
            insert=position,
            dxfattribs={
                "layer": "A-ANNO-NOTE",
                "xscale": scale,
                "yscale": scale,
            },
        )

    # ── Output ─────────────────────────────────────────────────────────

    def save(self, filepath: str):
        """Save DXF to a file on disk."""
        self.doc.saveas(filepath)

    def to_bytes(self) -> bytes:
        """Serialize DXF to bytes for HTTP response streaming."""
        stream = io.StringIO()
        self.doc.write(stream)
        stream.seek(0)
        return stream.read().encode("utf-8")
