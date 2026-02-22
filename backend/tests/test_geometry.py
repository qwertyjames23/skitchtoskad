"""Tests for the core geometry engine."""

import pytest
from app.core.geometry.wall import WallSegment, WallNetwork
from app.core.geometry.room import Room
from app.core.geometry.opening import Door, Window
from app.core.geometry.plan import FloorPlan


class TestWallSegment:
    def test_to_polygon_has_area(self):
        wall = WallSegment(start=(0, 0), end=(5000, 0), thickness=200)
        poly = wall.to_polygon()
        assert not poly.is_empty
        # Area should be ~5000 * 200 = 1,000,000 mm²
        assert abs(poly.area - 1_000_000) < 1000

    def test_length(self):
        wall = WallSegment(start=(0, 0), end=(3000, 4000), thickness=200)
        assert wall.length == 5000.0

    def test_zero_length_wall(self):
        wall = WallSegment(start=(100, 100), end=(100, 100), thickness=200)
        assert wall.length == 0


class TestWallNetwork:
    def _make_box(self, w=5000, h=4000, thickness=200):
        """Helper: create a rectangular room."""
        network = WallNetwork()
        network.add((0, 0), (w, 0), thickness)
        network.add((w, 0), (w, h), thickness)
        network.add((w, h), (0, h), thickness)
        network.add((0, h), (0, 0), thickness)
        return network

    def test_merge_walls_produces_valid_polygon(self):
        network = self._make_box()
        merged = network.merge_walls()
        assert merged.is_valid
        assert not merged.is_empty

    def test_single_room_detection(self):
        """Four walls forming a rectangle should produce exactly 1 room."""
        network = self._make_box()
        rooms = network.detect_rooms()
        assert len(rooms) == 1

    def test_single_room_area_less_than_outer(self):
        """Room area should be less than outer dimensions due to wall thickness."""
        network = self._make_box(5000, 4000, 200)
        rooms = network.detect_rooms()
        assert len(rooms) == 1
        # Interior should be roughly (5000-200) * (4000-200) = 4800*3800
        # = 18,240,000 mm² but slightly different due to mitre joins
        room_area = rooms[0].area
        assert room_area < 5000 * 4000
        assert room_area > 4000 * 3000  # sanity lower bound

    def test_two_rooms_with_partition(self):
        """A rectangle split by a middle wall = 2 rooms."""
        network = self._make_box(6000, 4000, 200)
        network.add((3000, 0), (3000, 4000), 150)  # partition
        rooms = network.detect_rooms()
        assert len(rooms) == 2

    def test_empty_network(self):
        network = WallNetwork()
        merged = network.merge_walls()
        assert merged.is_empty
        assert network.detect_rooms() == []

    def test_bounding_box(self):
        network = self._make_box(5000, 4000, 200)
        minx, miny, maxx, maxy = network.bounding_box
        assert minx == pytest.approx(-100, abs=2)  # half wall thickness
        assert miny == pytest.approx(-100, abs=2)
        assert maxx == pytest.approx(5100, abs=2)
        assert maxy == pytest.approx(4100, abs=2)

    def test_snap_tolerance_closes_gaps(self):
        """Walls with tiny gaps should still form rooms when tolerance is set."""
        network = WallNetwork(snap_tolerance=2.0)
        # Leave a 1mm gap at bottom-left corner
        network.add((1, 0), (5000, 0), 200)  # offset start by 1mm
        network.add((5000, 0), (5000, 4000), 200)
        network.add((5000, 4000), (0, 4000), 200)
        network.add((0, 4000), (0, 0), 200)
        rooms = network.detect_rooms()
        assert len(rooms) == 1


class TestRoom:
    def test_area_conversion(self):
        from shapely.geometry import box
        # 3m x 4m room = 12 m²
        poly = box(0, 0, 3000, 4000)
        room = Room(name="Test", polygon=poly)
        assert room.area_sq_m == pytest.approx(12.0, abs=0.01)
        assert room.area_sq_ft == pytest.approx(129.17, abs=0.1)

    def test_centroid(self):
        from shapely.geometry import box
        poly = box(0, 0, 4000, 2000)
        room = Room(name="Test", polygon=poly)
        cx, cy = room.centroid
        assert cx == pytest.approx(2000)
        assert cy == pytest.approx(1000)

    def test_to_dict(self):
        from shapely.geometry import box
        poly = box(0, 0, 3000, 4000)
        room = Room(name="Kitchen", polygon=poly)
        d = room.to_dict()
        assert d["name"] == "Kitchen"
        assert "area_sq_m" in d
        assert "polygon" in d


class TestDoor:
    def test_width(self):
        door = Door(start=(0, 0), end=(900, 0))
        assert door.width == pytest.approx(900)

    def test_cut_polygon(self):
        door = Door(start=(0, 0), end=(900, 0), cut_depth=300)
        cut = door.cut_polygon()
        assert not cut.is_empty
        assert cut.area > 0

    def test_swing_arc(self):
        door = Door(start=(0, 0), end=(900, 0), swing="left")
        arc = door.swing_arc
        assert arc["center"] == (0, 0)
        assert arc["radius"] == pytest.approx(900)


class TestWindow:
    def test_glass_lines(self):
        window = Window(start=(0, 0), end=(1000, 0))
        lines = window.glass_lines
        assert len(lines) == 3


class TestFloorPlan:
    def test_build_simple_plan(self):
        plan = FloorPlan()
        plan.walls.add((0, 0), (5000, 0), 200)
        plan.walls.add((5000, 0), (5000, 4000), 200)
        plan.walls.add((5000, 4000), (0, 4000), 200)
        plan.walls.add((0, 4000), (0, 0), 200)
        plan.labels["Living Room"] = (2500, 2000)

        built = plan.build()
        assert len(built.rooms) == 1
        assert built.rooms[0].name == "Living Room"

    def test_build_with_door_opening(self):
        plan = FloorPlan()
        plan.walls.add((0, 0), (5000, 0), 200)
        plan.walls.add((5000, 0), (5000, 4000), 200)
        plan.walls.add((5000, 4000), (0, 4000), 200)
        plan.walls.add((0, 4000), (0, 0), 200)

        # Partition with door
        plan.walls.add((2500, 0), (2500, 4000), 150)
        plan.doors.append(Door(start=(2500, 1500), end=(2500, 2400)))

        built = plan.build()
        assert len(built.rooms) == 2
        assert len(built.doors) == 1

    def test_to_response(self):
        plan = FloorPlan()
        plan.walls.add((0, 0), (5000, 0), 200)
        plan.walls.add((5000, 0), (5000, 4000), 200)
        plan.walls.add((5000, 4000), (0, 4000), 200)
        plan.walls.add((0, 4000), (0, 0), 200)

        built = plan.build()
        response = built.to_response()
        assert "walls_geojson" in response
        assert "rooms" in response
        assert "bounding_box" in response
        assert len(response["bounding_box"]) == 4
