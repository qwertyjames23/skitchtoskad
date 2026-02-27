"""IFC export engine — produces IFC4 files for BIM authoring tools.

Produces a valid IFC4 STEP file containing:
  IfcProject > IfcSite > IfcBuilding > IfcBuildingStorey(ies)
    ├── IfcWallStandardCase  (axis polyline + extruded rectangle body)
    ├── IfcDoor              (placed at opening midpoint, bounding box body)
    ├── IfcWindow            (placed at opening midpoint, bounding box body)
    └── IfcSpace             (room polygon extruded to storey height)

All coordinates are in millimetres (matching SKAD's internal space).
The file can be opened in ArchiCAD 25+, Revit 2024+, FreeCAD 0.21+, and
any IFC4-compliant viewer (e.g. ifc.js / BIMvision).
"""

from __future__ import annotations

import io
import math
import tempfile
import os
import uuid

import ifcopenshell
import ifcopenshell.guid


def _new_guid() -> str:
    return ifcopenshell.guid.new()


def _vec2d(x: float, y: float) -> list:
    return [float(x), float(y)]


def _vec3d(x: float, y: float, z: float = 0.0) -> list:
    return [float(x), float(y), float(z)]


def _dist(a: tuple, b: tuple) -> float:
    return math.hypot(b[0] - a[0], b[1] - a[1])


def _unit_vec(a: tuple, b: tuple) -> tuple:
    d = _dist(a, b)
    if d == 0:
        return (1.0, 0.0)
    return ((b[0] - a[0]) / d, (b[1] - a[1]) / d)


def _perp(v: tuple) -> tuple:
    """Perpendicular (90° CCW) of a 2D unit vector."""
    return (-v[1], v[0])


class IFCExporter:
    """Builds a complete IFC4 document from floor plan geometry."""

    def __init__(self, unit: str = "mm"):
        self.model = ifcopenshell.file(schema="IFC4")
        self._unit = unit
        self._storey_elements: list = []
        self._storey_spaces: list = []
        self._storey: object = None
        self._building: object = None
        self._context3d: object = None
        self._context2d: object = None
        self._setup_project()

    # ── Project hierarchy setup ─────────────────────────────────────────

    def _setup_project(self):
        model = self.model

        # Length unit: millimetre
        si_unit = model.createIfcSIUnit(
            None, "LENGTHUNIT", "MILLI", "METRE"
        )
        unit_assignment = model.createIfcUnitAssignment([si_unit])

        # Geometric representation contexts
        self._context3d = model.createIfcGeometricRepresentationContext(
            None, "Model", 3, 1.0e-5,
            model.createIfcAxis2Placement3D(
                model.createIfcCartesianPoint(_vec3d(0, 0, 0)),
                None, None,
            ),
            None,
        )
        self._context2d = model.createIfcGeometricRepresentationSubContext(
            "FootPrint", "Model",
            None, None, None, None,
            self._context3d, None, "PLAN_VIEW", None,
        )
        self._context_axis = model.createIfcGeometricRepresentationSubContext(
            "Axis", "Model",
            None, None, None, None,
            self._context3d, None, "GRAPH_VIEW", None,
        )
        self._context_body = model.createIfcGeometricRepresentationSubContext(
            "Body", "Model",
            None, None, None, None,
            self._context3d, None, "MODEL_VIEW", None,
        )

        # Owner history (required by IFC spec)
        person = model.createIfcPerson(None, "SKAD", None, None, None, None, None, None)
        org = model.createIfcOrganization(None, "SKAD", None, None, None)
        person_org = model.createIfcPersonAndOrganization(person, org, None)
        application = model.createIfcApplication(org, "1.0", "SKAD Floor Plan Generator", "SKAD")
        self._owner_history = model.createIfcOwnerHistory(
            person_org, application, None, "ADDED", None, person_org, application,
            0,
        )

        # Project
        project = model.createIfcProject(
            _new_guid(), self._owner_history, "SKAD Floor Plan", None,
            None, None, None,
            [self._context3d],
            unit_assignment,
        )

        # Site
        site_placement = model.createIfcLocalPlacement(
            None, self._make_axis2placement3d(0, 0, 0)
        )
        site = model.createIfcSite(
            _new_guid(), self._owner_history, "Site", None, None,
            site_placement, None, None, "ELEMENT", None, None, None, None, None,
        )
        model.createIfcRelAggregates(
            _new_guid(), self._owner_history, None, None, project, [site]
        )

        # Building
        building_placement = model.createIfcLocalPlacement(
            site_placement, self._make_axis2placement3d(0, 0, 0)
        )
        self._building = model.createIfcBuilding(
            _new_guid(), self._owner_history, "Building", None, None,
            building_placement, None, None, "ELEMENT", None, None, None,
        )
        model.createIfcRelAggregates(
            _new_guid(), self._owner_history, None, None, site, [self._building]
        )
        self._building_placement = building_placement

        # Default storey (level 1)
        self._storey = self._create_storey(1, 0.0)
        model.createIfcRelAggregates(
            _new_guid(), self._owner_history, None, None,
            self._building, [self._storey]
        )

    def _create_storey(self, floor_num: int, elevation: float) -> object:
        model = self.model
        placement = model.createIfcLocalPlacement(
            self._building_placement,
            self._make_axis2placement3d(0, 0, elevation),
        )
        return model.createIfcBuildingStorey(
            _new_guid(), self._owner_history,
            f"Level {floor_num}", None, None,
            placement, None, None, "ELEMENT", elevation,
        )

    def add_storey(self, floor_num: int, elevation_mm: float = 0.0):
        """Flush current storey elements, then switch to a new storey."""
        self._flush_storey()
        storey = self._create_storey(floor_num, elevation_mm)
        self.model.createIfcRelAggregates(
            _new_guid(), self._owner_history, None, None,
            self._building, [storey]
        )
        self._storey = storey

    # ── Geometry helpers ────────────────────────────────────────────────

    def _make_axis2placement3d(
        self, x: float, y: float, z: float = 0.0,
        ref_x: tuple | None = None, axis: tuple | None = None,
    ) -> object:
        model = self.model
        origin = model.createIfcCartesianPoint(_vec3d(x, y, z))
        ifc_axis = (
            model.createIfcDirection(_vec3d(*axis)) if axis else None
        )
        ifc_ref = (
            model.createIfcDirection(_vec3d(*ref_x)) if ref_x else None
        )
        return model.createIfcAxis2Placement3D(origin, ifc_axis, ifc_ref)

    def _make_local_placement(
        self, x: float, y: float, z: float = 0.0,
        ref_x: tuple | None = None,
        relative_to=None,
    ) -> object:
        placement = self._make_axis2placement3d(x, y, z, ref_x=ref_x)
        return self.model.createIfcLocalPlacement(relative_to, placement)

    def _extrude_profile(
        self, profile, depth: float,
        placement: object,
    ) -> object:
        """Create an IfcExtrudedAreaSolid from a profile and depth."""
        model = self.model
        extrude_dir = model.createIfcDirection(_vec3d(0, 0, 1))
        solid = model.createIfcExtrudedAreaSolid(profile, placement, extrude_dir, depth)
        return solid

    def _attach_pset(self, element, pset_name: str, props: list):
        """Attach a named IfcPropertySet to an IFC element.

        props: list of (property_name, ifc_type_name, value)
        e.g.  [("Thickness", "IfcPositiveLengthMeasure", 200.0)]
        """
        model = self.model
        pset_props = []
        for name, type_name, value in props:
            nominal = model.create_entity(type_name, value)
            prop = model.createIfcPropertySingleValue(name, None, nominal, None)
            pset_props.append(prop)
        pset = model.createIfcPropertySet(
            _new_guid(), self._owner_history, pset_name, None, pset_props
        )
        model.createIfcRelDefinesByProperties(
            _new_guid(), self._owner_history, None, None, [element], pset
        )

    # ── Walls ───────────────────────────────────────────────────────────

    def add_wall(
        self, start: tuple, end: tuple,
        thickness: float, height: float = 2700.0,
    ):
        """Add an IfcWallStandardCase with axis and extruded body."""
        model = self.model
        length = _dist(start, end)
        if length < 1:
            return

        u = _unit_vec(start, end)  # unit vector along wall
        perp = _perp(u)             # perpendicular (normal)

        # Placement: origin at start, X axis along wall, Z up
        placement = self._make_local_placement(
            start[0], start[1], 0.0,
            ref_x=(u[0], u[1], 0.0),
            relative_to=None,
        )

        # Axis representation: 2D polyline along wall centerline
        p0 = model.createIfcCartesianPoint((0.0, 0.0, 0.0))
        p1 = model.createIfcCartesianPoint((length, 0.0, 0.0))
        axis_curve = model.createIfcPolyline([p0, p1])
        axis_rep = model.createIfcShapeRepresentation(
            self._context_axis, "Axis", "Curve3D", [axis_curve]
        )

        # Body: rectangle profile centered on Y=0, extruded by height
        # Profile: XDim = length (along wall), YDim = thickness
        profile_placement = model.createIfcAxis2Placement2D(
            model.createIfcCartesianPoint((length / 2, 0.0)),
            None,
        )
        profile = model.createIfcRectangleProfileDef(
            "AREA", None, profile_placement, length, thickness
        )
        body_placement = self._make_axis2placement3d(0, 0, 0)
        solid = self._extrude_profile(profile, height, body_placement)
        body_rep = model.createIfcShapeRepresentation(
            self._context_body, "Body", "SweptSolid", [solid]
        )

        shape = model.createIfcProductDefinitionShape(None, None, [axis_rep, body_rep])

        wall = model.createIfcWallStandardCase(
            _new_guid(), self._owner_history,
            f"Wall", None, None,
            placement, shape, None,
        )
        self._storey_elements.append(wall)
        self._attach_pset(wall, "Pset_WallCommon", [
            ("Thickness", "IfcPositiveLengthMeasure", thickness),
            ("Height",    "IfcPositiveLengthMeasure", height),
        ])

    # ── Doors ───────────────────────────────────────────────────────────

    def add_door(
        self, start: tuple, end: tuple,
        swing: str = "left", height: float = 2100.0,
    ):
        """Add an IfcDoor placed at the midpoint of the opening."""
        model = self.model
        width = _dist(start, end)
        if width < 1:
            return

        mx = (start[0] + end[0]) / 2
        my = (start[1] + end[1]) / 2
        u = _unit_vec(start, end)

        placement = self._make_local_placement(
            mx, my, 0.0,
            ref_x=(u[0], u[1], 0.0),
        )

        # Body: simple bounding box
        body_solid = model.createIfcBoundingBox(
            model.createIfcCartesianPoint((-width / 2, 0.0, 0.0)),
            width, 50.0, height,
        )
        body_rep = model.createIfcShapeRepresentation(
            self._context_body, "Body", "BoundingBox", [body_solid]
        )
        shape = model.createIfcProductDefinitionShape(None, None, [body_rep])

        door = model.createIfcDoor(
            _new_guid(), self._owner_history,
            "Door", None, None,
            placement, shape, None,
            height, width,
        )
        self._storey_elements.append(door)
        self._attach_pset(door, "Pset_DoorCommon", [
            ("OverallWidth",  "IfcPositiveLengthMeasure", width),
            ("OverallHeight", "IfcPositiveLengthMeasure", height),
        ])

    # ── Windows ─────────────────────────────────────────────────────────

    def add_window(
        self, start: tuple, end: tuple,
        sill_height: float = 900.0, head_height: float = 2100.0,
    ):
        """Add an IfcWindow placed at the midpoint of the opening."""
        model = self.model
        width = _dist(start, end)
        if width < 1:
            return

        window_height = head_height - sill_height
        mx = (start[0] + end[0]) / 2
        my = (start[1] + end[1]) / 2
        u = _unit_vec(start, end)

        placement = self._make_local_placement(
            mx, my, sill_height,
            ref_x=(u[0], u[1], 0.0),
        )

        body_solid = model.createIfcBoundingBox(
            model.createIfcCartesianPoint((-width / 2, 0.0, 0.0)),
            width, 50.0, window_height,
        )
        body_rep = model.createIfcShapeRepresentation(
            self._context_body, "Body", "BoundingBox", [body_solid]
        )
        shape = model.createIfcProductDefinitionShape(None, None, [body_rep])

        window = model.createIfcWindow(
            _new_guid(), self._owner_history,
            "Window", None, None,
            placement, shape, None,
            window_height, width,
        )
        self._storey_elements.append(window)
        self._attach_pset(window, "Pset_WindowCommon", [
            ("OverallWidth",  "IfcPositiveLengthMeasure", width),
            ("OverallHeight", "IfcPositiveLengthMeasure", window_height),
            ("SillHeight",    "IfcLengthMeasure",         sill_height),
        ])

    # ── Rooms (IfcSpace) ────────────────────────────────────────────────

    def add_room(
        self, polygon_coords: list, name: str,
        area_sq_m: float, height: float = 2700.0,
    ):
        """Add an IfcSpace from a room polygon."""
        model = self.model
        if len(polygon_coords) < 3:
            return

        # Footprint polyline (close the loop)
        pts_2d = [
            model.createIfcCartesianPoint((float(p[0]), float(p[1]), 0.0))
            for p in polygon_coords
        ]
        if pts_2d[0] != pts_2d[-1]:
            pts_2d.append(pts_2d[0])
        footprint_curve = model.createIfcPolyline(pts_2d)
        curve_bounded = model.createIfcCurveBoundedPlane(
            model.createIfcPlane(self._make_axis2placement3d(0, 0, 0)),
            footprint_curve, [],
        )
        footprint_rep = model.createIfcShapeRepresentation(
            self._context2d, "FootPrint", "Curve3D", [footprint_curve]
        )

        # Body: arbitrary closed profile extruded by height
        poly_pts_2d = [
            model.createIfcCartesianPoint((float(p[0]), float(p[1])))
            for p in polygon_coords
        ]
        if poly_pts_2d[0] != poly_pts_2d[-1]:
            poly_pts_2d.append(poly_pts_2d[0])
        polyline_2d = model.createIfcPolyline(poly_pts_2d)
        profile = model.createIfcArbitraryClosedProfileDef("AREA", None, polyline_2d)
        body_placement = self._make_axis2placement3d(0, 0, 0)
        solid = self._extrude_profile(profile, height, body_placement)
        body_rep = model.createIfcShapeRepresentation(
            self._context_body, "Body", "SweptSolid", [solid]
        )

        shape = model.createIfcProductDefinitionShape(None, None, [footprint_rep, body_rep])

        placement = self._make_local_placement(0, 0, 0)
        space = model.createIfcSpace(
            _new_guid(), self._owner_history,
            name, None, None,
            placement, shape, f"{area_sq_m:.2f} m\u00b2",
            "ELEMENT", None,
        )
        self._storey_spaces.append(space)
        self._attach_pset(space, "Pset_SpaceCommon", [
            ("NetFloorArea", "IfcAreaMeasure",           round(area_sq_m, 4)),
            ("Height",       "IfcPositiveLengthMeasure", height),
        ])

    # ── Flush + output ──────────────────────────────────────────────────

    def _flush_storey(self):
        """Assign collected elements and spaces to the current storey."""
        if not self._storey:
            return

        if self._storey_elements:
            self.model.createIfcRelContainedInSpatialStructure(
                _new_guid(), self._owner_history, None, None,
                self._storey_elements[:],
                self._storey,
            )
            self._storey_elements.clear()

        if self._storey_spaces:
            self.model.createIfcRelAggregates(
                _new_guid(), self._owner_history, None, None,
                self._storey,
                self._storey_spaces[:],
            )
            self._storey_spaces.clear()

    def to_bytes(self) -> bytes:
        """Serialize IFC document to STEP bytes for HTTP response."""
        self._flush_storey()
        with tempfile.NamedTemporaryFile(suffix=".ifc", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            self.model.write(tmp_path)
            with open(tmp_path, "rb") as f:
                return f.read()
        finally:
            os.unlink(tmp_path)
