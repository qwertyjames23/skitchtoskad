"""Tests for the DXF exporter with block-based doors/windows and AIA layers."""

import pytest
import ezdxf
from io import StringIO

from app.core.exporter.dxf_writer import DXFExporter
from app.core.exporter.dxf_layers import LAYERS, BlockNames
from app.core.exporter.dxf_blocks import (
    compute_door_insertion,
    compute_window_insertion,
)
from app.core.geometry.plan import FloorPlan


class TestDXFSetup:
    """Verify the document is initialized with correct standards."""

    def test_creates_valid_dxf(self):
        exporter = DXFExporter(unit="mm")
        data = exporter.to_bytes()
        assert len(data) > 0

        doc = ezdxf.read(StringIO(data.decode("utf-8")))
        assert doc is not None

    def test_aia_layers_created(self):
        exporter = DXFExporter()
        layer_names = {l.dxf.name for l in exporter.doc.layers}
        # Verify core AIA layers exist
        assert "A-WALL" in layer_names
        assert "A-WALL-FILL" in layer_names
        assert "A-WALL-CNTR" in layer_names
        assert "A-DOOR" in layer_names
        assert "A-DOOR-SWING" in layer_names
        assert "A-GLAZ" in layer_names
        assert "A-ANNO-DIMS" in layer_names
        assert "A-ANNO-TEXT" in layer_names
        assert "A-ANNO-AREA" in layer_names
        assert "A-AREA-IDEN" in layer_names

    def test_layer_properties(self):
        exporter = DXFExporter()
        wall_layer = exporter.doc.layers.get("A-WALL")
        assert wall_layer.dxf.color == 7    # white
        assert wall_layer.dxf.lineweight == 50  # 0.50mm

        door_layer = exporter.doc.layers.get("A-DOOR")
        assert door_layer.dxf.color == 1    # red

    def test_non_printing_layers(self):
        exporter = DXFExporter()
        cntr_layer = exporter.doc.layers.get("A-WALL-CNTR")
        assert cntr_layer.dxf.plot == 0

    def test_frozen_layers(self):
        exporter = DXFExporter()
        furn_layer = exporter.doc.layers.get("A-FURN")
        assert furn_layer.is_frozen()

    def test_custom_linetypes_registered(self):
        exporter = DXFExporter()
        lt_names = {lt.dxf.name for lt in exporter.doc.linetypes}
        assert "DASHED" in lt_names
        assert "CENTER" in lt_names
        assert "HIDDEN" in lt_names

    def test_text_styles_registered(self):
        exporter = DXFExporter()
        style_names = {s.dxf.name for s in exporter.doc.styles}
        assert "SKAD_LABEL" in style_names
        assert "SKAD_DIM" in style_names
        assert "SKAD_NOTE" in style_names

    def test_dimstyle_configured(self):
        exporter = DXFExporter()
        dimstyle = exporter.doc.dimstyles.get("SKAD_DIM")
        assert dimstyle.dxf.dimtxt == 100
        assert dimstyle.dxf.dimasz == 80
        assert dimstyle.dxf.dimdec == 0

    def test_insunits_set(self):
        exporter = DXFExporter(unit="mm")
        assert exporter.doc.header["$INSUNITS"] == 4

        exporter_ft = DXFExporter(unit="ft")
        assert exporter_ft.doc.header["$INSUNITS"] == 2


class TestBlockDefinitions:
    """Verify block definitions are registered and have correct geometry."""

    def test_all_blocks_registered(self):
        exporter = DXFExporter()
        block_names = {b.name for b in exporter.doc.blocks if not b.name.startswith("*")}
        assert BlockNames.DOOR_SINGLE_LEFT in block_names
        assert BlockNames.DOOR_SINGLE_RIGHT in block_names
        assert BlockNames.DOOR_DOUBLE in block_names
        assert BlockNames.WINDOW_STANDARD in block_names
        assert BlockNames.WINDOW_FIXED in block_names
        assert BlockNames.NORTH_ARROW in block_names

    def test_door_left_block_entities(self):
        exporter = DXFExporter()
        blk = exporter.doc.blocks[BlockNames.DOOR_SINGLE_LEFT]
        entities = list(blk)
        # Should have: 1 line (panel) + 1 arc (swing) + 2 lines (ticks) = 4
        assert len(entities) == 4
        lines = [e for e in entities if e.dxftype() == "LINE"]
        arcs = [e for e in entities if e.dxftype() == "ARC"]
        assert len(lines) == 3   # panel + 2 ticks
        assert len(arcs) == 1    # swing

    def test_door_right_block_entities(self):
        exporter = DXFExporter()
        blk = exporter.doc.blocks[BlockNames.DOOR_SINGLE_RIGHT]
        arcs = [e for e in blk if e.dxftype() == "ARC"]
        assert len(arcs) == 1
        # Right-hinged door arc should be centered at (1,0)
        assert arcs[0].dxf.center.x == pytest.approx(1.0)

    def test_door_double_block_entities(self):
        exporter = DXFExporter()
        blk = exporter.doc.blocks[BlockNames.DOOR_DOUBLE]
        arcs = [e for e in blk if e.dxftype() == "ARC"]
        assert len(arcs) == 2  # two swing arcs

    def test_window_standard_block_entities(self):
        exporter = DXFExporter()
        blk = exporter.doc.blocks[BlockNames.WINDOW_STANDARD]
        lines = [e for e in blk if e.dxftype() == "LINE"]
        # 3 glass lines + 2 frame ticks = 5
        assert len(lines) == 5

    def test_window_fixed_has_x_pattern(self):
        exporter = DXFExporter()
        blk = exporter.doc.blocks[BlockNames.WINDOW_FIXED]
        lines = [e for e in blk if e.dxftype() == "LINE"]
        # 3 glass + 2 X diagonal + 2 ticks = 7
        assert len(lines) == 7

    def test_block_layers_correct(self):
        """Entities inside blocks must be on the correct layers."""
        exporter = DXFExporter()
        blk = exporter.doc.blocks[BlockNames.DOOR_SINGLE_LEFT]
        layers = {e.dxf.layer for e in blk}
        assert "A-DOOR" in layers
        assert "A-DOOR-SWING" in layers


class TestBlockInsertionCalc:
    """Test the geometric calculations for block placement."""

    def test_door_left_horizontal(self):
        params = compute_door_insertion((0, 0), (900, 0), "left")
        assert params["block_name"] == BlockNames.DOOR_SINGLE_LEFT
        assert params["insert_point"] == (0, 0)
        assert params["rotation"] == pytest.approx(0)
        assert params["xscale"] == pytest.approx(900)

    def test_door_right_horizontal(self):
        params = compute_door_insertion((0, 0), (900, 0), "right")
        assert params["block_name"] == BlockNames.DOOR_SINGLE_RIGHT

    def test_door_vertical_wall(self):
        params = compute_door_insertion((0, 0), (0, 900), "left")
        assert params["rotation"] == pytest.approx(90)
        assert params["xscale"] == pytest.approx(900)

    def test_door_diagonal_wall(self):
        params = compute_door_insertion((0, 0), (600, 800), "left")
        expected_width = (600**2 + 800**2) ** 0.5  # 1000
        assert params["xscale"] == pytest.approx(expected_width)

    def test_window_horizontal(self):
        params = compute_window_insertion((100, 0), (1100, 0))
        assert params["block_name"] == BlockNames.WINDOW_STANDARD
        assert params["xscale"] == pytest.approx(1000)
        assert params["rotation"] == pytest.approx(0)

    def test_window_fixed(self):
        params = compute_window_insertion((0, 0), (1000, 0), fixed=True)
        assert params["block_name"] == BlockNames.WINDOW_FIXED


class TestWallExport:
    def test_wall_polygon_creates_polyline_and_hatch(self):
        from shapely.geometry import box
        exporter = DXFExporter()
        wall_poly = box(0, 0, 5000, 200)
        exporter.add_wall_polygon(wall_poly)

        msp = exporter.doc.modelspace()
        wall_outlines = [e for e in msp if e.dxf.layer == "A-WALL"]
        wall_hatches = [e for e in msp if e.dxf.layer == "A-WALL-FILL"]
        assert len(wall_outlines) == 1
        assert len(wall_hatches) == 1

    def test_wall_with_room_hole(self):
        """Wall polygon with an interior ring should create room boundary."""
        from shapely.geometry import Polygon
        exterior = [(0, 0), (5000, 0), (5000, 4000), (0, 4000), (0, 0)]
        interior = [(200, 200), (4800, 200), (4800, 3800), (200, 3800), (200, 200)]
        wall_poly = Polygon(exterior, [interior])

        exporter = DXFExporter()
        exporter.add_wall_polygon(wall_poly)

        msp = exporter.doc.modelspace()
        room_boundaries = [e for e in msp if e.dxf.layer == "A-AREA-IDEN"]
        assert len(room_boundaries) == 1

    def test_wall_centerline(self):
        exporter = DXFExporter()
        exporter.add_wall_centerline((0, 0), (5000, 0))

        msp = exporter.doc.modelspace()
        centerlines = [e for e in msp if e.dxf.layer == "A-WALL-CNTR"]
        assert len(centerlines) == 1


class TestDoorExport:
    def test_door_is_block_insert(self):
        """Door should be a single INSERT entity, not loose lines/arcs."""
        exporter = DXFExporter()
        exporter.add_door((0, 0), (900, 0), "left")

        msp = exporter.doc.modelspace()
        inserts = [e for e in msp if e.dxftype() == "INSERT" and e.dxf.layer == "A-DOOR"]
        assert len(inserts) == 1

    def test_door_insert_name(self):
        exporter = DXFExporter()
        exporter.add_door((0, 0), (900, 0), "left")

        msp = exporter.doc.modelspace()
        insert = [e for e in msp if e.dxftype() == "INSERT"][0]
        assert insert.dxf.name == BlockNames.DOOR_SINGLE_LEFT

    def test_door_insert_scale(self):
        exporter = DXFExporter()
        exporter.add_door((0, 0), (900, 0), "left")

        msp = exporter.doc.modelspace()
        insert = [e for e in msp if e.dxftype() == "INSERT"][0]
        assert insert.dxf.xscale == pytest.approx(900)
        assert insert.dxf.yscale == pytest.approx(900)

    def test_door_insert_rotation(self):
        exporter = DXFExporter()
        exporter.add_door((0, 0), (0, 900), "left")  # vertical wall

        msp = exporter.doc.modelspace()
        insert = [e for e in msp if e.dxftype() == "INSERT"][0]
        assert insert.dxf.rotation == pytest.approx(90)

    def test_double_door_uses_correct_block(self):
        exporter = DXFExporter()
        exporter.add_door((0, 0), (1800, 0), "double")

        msp = exporter.doc.modelspace()
        insert = [e for e in msp if e.dxftype() == "INSERT"][0]
        assert insert.dxf.name == BlockNames.DOOR_DOUBLE


class TestWindowExport:
    def test_window_is_block_insert(self):
        exporter = DXFExporter()
        exporter.add_window((0, 0), (1000, 0))

        msp = exporter.doc.modelspace()
        inserts = [e for e in msp if e.dxftype() == "INSERT" and e.dxf.layer == "A-GLAZ"]
        assert len(inserts) == 1

    def test_window_insert_scale(self):
        exporter = DXFExporter()
        exporter.add_window((0, 0), (1200, 0))

        msp = exporter.doc.modelspace()
        insert = [e for e in msp if e.dxftype() == "INSERT"][0]
        assert insert.dxf.xscale == pytest.approx(1200)

    def test_fixed_window_block(self):
        exporter = DXFExporter()
        exporter.add_window((0, 0), (1000, 0), fixed=True)

        msp = exporter.doc.modelspace()
        insert = [e for e in msp if e.dxftype() == "INSERT"][0]
        assert insert.dxf.name == BlockNames.WINDOW_FIXED


class TestLabelExport:
    def test_room_label_entities(self):
        exporter = DXFExporter()
        exporter.add_room_label((2500, 2000), "Kitchen", 12.5)

        msp = exporter.doc.modelspace()
        name_texts = [e for e in msp if e.dxf.layer == "A-ANNO-TEXT"]
        area_texts = [e for e in msp if e.dxf.layer == "A-ANNO-AREA"]
        assert len(name_texts) == 1
        assert len(area_texts) == 1

    def test_room_label_uses_style(self):
        exporter = DXFExporter()
        exporter.add_room_label((0, 0), "Test", 10.0)

        msp = exporter.doc.modelspace()
        text = [e for e in msp if e.dxf.layer == "A-ANNO-TEXT"][0]
        assert text.dxf.style == "SKAD_LABEL"


class TestDimensionExport:
    def test_horizontal_dimension(self):
        exporter = DXFExporter()
        exporter.add_dimension((0, 0), (5000, 0), offset=-500)

        msp = exporter.doc.modelspace()
        dims = [e for e in msp if e.dxf.layer == "A-ANNO-DIMS"]
        assert len(dims) > 0

    def test_aligned_dimension(self):
        exporter = DXFExporter()
        exporter.add_aligned_dimension((0, 0), (3000, 4000), offset=300)

        msp = exporter.doc.modelspace()
        dims = [e for e in msp if e.dxf.layer == "A-ANNO-DIMS"]
        assert len(dims) > 0


class TestAnnotations:
    def test_add_note(self):
        exporter = DXFExporter()
        exporter.add_note((0, 0), "This is a note")

        msp = exporter.doc.modelspace()
        notes = [e for e in msp if e.dxf.layer == "A-ANNO-NOTE"]
        assert len(notes) == 1

    def test_north_arrow(self):
        exporter = DXFExporter()
        exporter.add_north_arrow((1000, 1000), scale=500)

        msp = exporter.doc.modelspace()
        inserts = [e for e in msp if e.dxftype() == "INSERT" and e.dxf.name == "SKAD_NORTH"]
        assert len(inserts) == 1


class TestFullPlanExport:
    def test_end_to_end_plan(self):
        """Full pipeline: build plan → export DXF → parse back → verify."""
        plan = FloorPlan()
        plan.walls.add((0, 0), (5000, 0), 200)
        plan.walls.add((5000, 0), (5000, 4000), 200)
        plan.walls.add((5000, 4000), (0, 4000), 200)
        plan.walls.add((0, 4000), (0, 0), 200)
        plan.labels["Living Room"] = (2500, 2000)

        built = plan.build()
        exporter = DXFExporter()
        built.write_to_dxf(exporter)

        data = exporter.to_bytes()
        doc = ezdxf.read(StringIO(data.decode("utf-8")))
        msp = doc.modelspace()

        # Walls
        wall_outlines = sum(1 for e in msp if e.dxf.layer == "A-WALL")
        assert wall_outlines > 0

        # Centerlines
        centerlines = sum(1 for e in msp if e.dxf.layer == "A-WALL-CNTR")
        assert centerlines == 4  # 4 wall segments

        # Labels
        name_labels = sum(1 for e in msp if e.dxf.layer == "A-ANNO-TEXT")
        area_labels = sum(1 for e in msp if e.dxf.layer == "A-ANNO-AREA")
        assert name_labels > 0
        assert area_labels > 0

        # Dimensions
        dims = sum(1 for e in msp if e.dxf.layer == "A-ANNO-DIMS")
        assert dims > 0

    def test_plan_with_doors_and_windows(self):
        """Verify doors and windows export as block inserts."""
        from app.core.geometry.opening import Door, Window

        plan = FloorPlan()
        plan.walls.add((0, 0), (6000, 0), 200)
        plan.walls.add((6000, 0), (6000, 4000), 200)
        plan.walls.add((6000, 4000), (0, 4000), 200)
        plan.walls.add((0, 4000), (0, 0), 200)
        plan.walls.add((3000, 0), (3000, 4000), 150)

        plan.doors.append(Door(start=(3000, 1500), end=(3000, 2400), swing="left"))
        plan.windows.append(Window(start=(1000, 4000), end=(2000, 4000)))
        plan.labels["Kitchen"] = (1500, 2000)
        plan.labels["Living"] = (4500, 2000)

        built = plan.build()
        exporter = DXFExporter()
        built.write_to_dxf(exporter)

        msp = exporter.doc.modelspace()
        inserts = [e for e in msp if e.dxftype() == "INSERT"]

        door_inserts = [e for e in inserts if e.dxf.name == BlockNames.DOOR_SINGLE_LEFT]
        window_inserts = [e for e in inserts if e.dxf.name == BlockNames.WINDOW_STANDARD]

        assert len(door_inserts) == 1
        assert len(window_inserts) == 1

    def test_save_to_file(self, tmp_path):
        exporter = DXFExporter()
        from shapely.geometry import box
        exporter.add_wall_polygon(box(0, 0, 5000, 200))

        filepath = str(tmp_path / "test_output.dxf")
        exporter.save(filepath)

        doc = ezdxf.readfile(filepath)
        assert doc is not None
