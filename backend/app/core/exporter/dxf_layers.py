"""DXF layer, linetype, text style, and block definitions.

Follows AIA (American Institute of Architects) CAD Layer Guidelines
adapted for residential floor plans. Layer naming uses a simplified
version of the AIA format: A-<element>[-<modifier>].

ACI color index reference:
  1=red  2=yellow  3=green  4=cyan  5=blue  6=magenta  7=white
  8=dark grey  9=light grey  250=light grey  251-255=grey scale

Lineweight values are in 100ths of mm:
  13=0.13mm  18=0.18mm  25=0.25mm  35=0.35mm  50=0.50mm  70=0.70mm
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LayerDef:
    """Single layer definition with all AutoCAD properties."""
    name: str
    color: int
    linetype: str
    lineweight: int
    description: str
    plot: bool = True          # include when printing
    frozen: bool = False       # start frozen (hidden)


# ── Layer definitions ───────────────────────────────────────────────────

LAYERS: list[LayerDef] = [
    # Structural
    LayerDef("A-WALL",        7,   "Continuous",  50, "Wall outlines"),
    LayerDef("A-WALL-FILL",   250, "Continuous",  -1, "Wall solid fill hatching"),
    LayerDef("A-WALL-CNTR",   8,   "CENTER",      13, "Wall centerlines", plot=False),

    # Openings
    LayerDef("A-DOOR",        1,   "Continuous",  25, "Door panels and frames"),
    LayerDef("A-DOOR-SWING",  1,   "DASHED",      13, "Door swing arcs"),
    LayerDef("A-GLAZ",        5,   "Continuous",  25, "Window glass and frames"),

    # Annotations
    LayerDef("A-ANNO-DIMS",   3,   "Continuous",  13, "Dimensions"),
    LayerDef("A-ANNO-TEXT",   2,   "Continuous",  -1, "Room names and labels"),
    LayerDef("A-ANNO-NOTE",   2,   "Continuous",  -1, "General notes"),
    LayerDef("A-ANNO-AREA",   8,   "Continuous",  -1, "Area calculations"),

    # Room boundaries
    LayerDef("A-AREA-IDEN",   8,   "Continuous",  -1, "Room boundary outlines"),
    LayerDef("A-AREA-FILL",   251, "Continuous",  -1, "Room fill hatching", plot=False),

    # Furniture & fixtures (future use)
    LayerDef("A-FURN",        6,   "Continuous",  18, "Furniture", frozen=True),
    LayerDef("A-FLOR-FIXT",   4,   "Continuous",  18, "Plumbing fixtures", frozen=True),

    # Reference
    LayerDef("A-GRID",        9,   "Continuous",  13, "Grid lines", plot=False),
    LayerDef("A-REFR",        8,   "Continuous",  13, "Reference / construction", plot=False),

    # Site / lot plan
    LayerDef("A-PROP",        2,   "Continuous",  70, "Property / lot boundary"),
    LayerDef("A-PROP-SETB",   3,   "DASHED",      25, "Setback / building envelope lines"),
]

# Quick lookup by name
LAYER_MAP: dict[str, LayerDef] = {layer.name: layer for layer in LAYERS}


# ── Linetype definitions ───────────────────────────────────────────────

CUSTOM_LINETYPES: list[dict] = [
    {
        "name": "DASHED",
        "pattern": "A,6.35,-3.175",  # ISO dash pattern
        "description": "Dashed __ __ __ __",
    },
    {
        "name": "CENTER",
        "pattern": "A,31.75,-6.35,6.35,-6.35",
        "description": "Center ____ _ ____ _",
    },
    {
        "name": "HIDDEN",
        "pattern": "A,3.175,-1.5875",
        "description": "Hidden _ _ _ _ _",
    },
    {
        "name": "DASHDOT",
        "pattern": "A,12.7,-6.35,0,-6.35",
        "description": "Dash dot __ . __ .",
    },
]


# ── Text style definitions ─────────────────────────────────────────────

TEXT_STYLES: list[dict] = [
    {
        "name": "SKAD_TITLE",
        "font": "Arial",
        "height": 0,  # variable height
    },
    {
        "name": "SKAD_LABEL",
        "font": "Arial",
        "height": 0,
    },
    {
        "name": "SKAD_DIM",
        "font": "Arial Narrow",
        "height": 0,
    },
    {
        "name": "SKAD_NOTE",
        "font": "Arial",
        "height": 0,
    },
]


# ── DXF unit mapping ───────────────────────────────────────────────────

DXF_UNITS = {
    "mm": 4,
    "cm": 5,
    "m": 6,
    "ft": 2,
    "in": 1,
}


# ── Block name constants ───────────────────────────────────────────────

class BlockNames:
    DOOR_SINGLE_LEFT = "SKAD_DOOR_SL"
    DOOR_SINGLE_RIGHT = "SKAD_DOOR_SR"
    DOOR_DOUBLE = "SKAD_DOOR_DBL"
    WINDOW_STANDARD = "SKAD_WINDOW"
    WINDOW_FIXED = "SKAD_WINDOW_FX"
    NORTH_ARROW = "SKAD_NORTH"
    TITLE_BLOCK = "SKAD_TITLEBLOCK"
