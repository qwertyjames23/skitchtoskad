"""Floor plan assembly — ties walls, rooms, and openings together."""

from __future__ import annotations

from dataclasses import dataclass, field
from shapely.geometry import Polygon, MultiPolygon, mapping

from app.core.geometry.wall import WallNetwork, WallSegment
from app.core.geometry.room import Room
from app.core.geometry.opening import Door, Window
from app.core.geometry.lot import LotGeometry


@dataclass
class FloorPlan:
    """Complete floor plan with walls, openings, and detected rooms."""

    walls: WallNetwork = field(default_factory=WallNetwork)
    doors: list[Door] = field(default_factory=list)
    windows: list[Window] = field(default_factory=list)
    labels: dict[str, tuple[float, float]] = field(default_factory=dict)
    room_colors: dict[str, str] = field(default_factory=dict)  # room name -> hex color
    furniture: list[dict] = field(default_factory=list)  # [{x, y, fixture_type, rotation}]
    lot: LotGeometry | None = None
    unit: str = "mm"

    def build(self) -> "BuiltPlan":
        """Process geometry: merge walls, cut openings, detect rooms."""
        # Step 1: Merge all wall segments
        merged = self.walls.merge_walls()

        # Step 2: Detect rooms from the UNCUT merged walls
        # (doors/windows are visual cuts — rooms exist regardless of openings)
        room_polygons = []
        if isinstance(merged, MultiPolygon):
            for poly in merged.geoms:
                for interior in poly.interiors:
                    room_polygons.append(Polygon(interior))
        elif isinstance(merged, Polygon):
            for interior in merged.interiors:
                room_polygons.append(Polygon(interior))

        # Step 3: Cut openings for visual rendering and DXF export
        for door in self.doors:
            cut = door.cut_polygon()
            merged = merged.difference(cut)

        for window in self.windows:
            cut = window.cut_polygon()
            merged = merged.difference(cut)

        # Step 4: Assign labels to rooms by proximity
        rooms = []
        for i, rpoly in enumerate(room_polygons):
            name, color = self._find_label_for_room(rpoly, i)
            rooms.append(Room(name=name, polygon=rpoly, color=color))

        return BuiltPlan(
            wall_geometry=merged,
            wall_segments=list(self.walls.segments),
            rooms=rooms,
            doors=self.doors,
            windows=self.windows,
            furniture=self.furniture,
            lot=self.lot,
            unit=self.unit,
        )

    def _find_label_for_room(self, room_poly: Polygon, index: int) -> tuple[str, str]:
        """Find the label whose position falls inside this room polygon.

        Returns (name, color) — color is from room_colors dict if set, else empty string.
        """
        from shapely.geometry import Point
        for label_text, label_pos in self.labels.items():
            if room_poly.contains(Point(label_pos)):
                color = self.room_colors.get(label_text, "")
                return label_text, color
        return f"Room {index + 1}", ""


@dataclass
class BuiltPlan:
    """Processed floor plan ready for rendering and export."""

    wall_geometry: Polygon | MultiPolygon
    wall_segments: list[WallSegment] = field(default_factory=list)
    rooms: list[Room] = field(default_factory=list)
    doors: list[Door] = field(default_factory=list)
    windows: list[Window] = field(default_factory=list)
    furniture: list[dict] = field(default_factory=list)
    lot: LotGeometry | None = None
    unit: str = "mm"

    @property
    def bounding_box(self) -> tuple[float, float, float, float]:
        if self.lot is not None:
            return self.lot.boundary.bounds
        if self.wall_geometry.is_empty:
            return (0, 0, 0, 0)
        return self.wall_geometry.bounds

    @property
    def building_footprint(self) -> Polygon | None:
        """Outer perimeter of the building as a simple polygon (walls + rooms)."""
        if self.wall_geometry.is_empty:
            return None
        if isinstance(self.wall_geometry, MultiPolygon):
            from shapely.ops import unary_union
            return unary_union([Polygon(p.exterior.coords) for p in self.wall_geometry.geoms])
        return Polygon(self.wall_geometry.exterior.coords)

    @property
    def building_footprint_sq_m(self) -> float:
        """Building coverage area in m²."""
        fp = self.building_footprint
        return round(fp.area / 1_000_000, 2) if fp else 0.0

    @property
    def compliance(self) -> str | None:
        """'ok' if building footprint is within the setback polygon, 'violation' otherwise."""
        if self.lot is None or self.lot.setback_polygon is None:
            return None
        fp = self.building_footprint
        if fp is None or fp.is_empty:
            return None
        return "ok" if self.lot.setback_polygon.covers(fp) else "violation"

    def to_geojson(self) -> dict:
        """Convert the plan to GeoJSON for frontend rendering."""
        features = []

        # Wall geometry (with holes for rooms)
        if not self.wall_geometry.is_empty:
            features.append({
                "type": "Feature",
                "properties": {"type": "wall"},
                "geometry": mapping(self.wall_geometry),
            })

        # Room polygons
        for room in self.rooms:
            features.append({
                "type": "Feature",
                "properties": {
                    "type": "room",
                    "name": room.name,
                    "area_sq_m": round(room.area_sq_m, 2),
                },
                "geometry": mapping(room.polygon),
            })

        return {"type": "FeatureCollection", "features": features}

    def to_response(self) -> dict:
        """Generate the API response payload."""
        resp = {
            "walls_geojson": self.to_geojson(),
            "rooms": [room.to_dict() for room in self.rooms],
            "doors": [door.to_dict() for door in self.doors],
            "windows": [window.to_dict() for window in self.windows],
            "bounding_box": list(self.bounding_box),
            "lot": self.lot.to_dict() if self.lot is not None else None,
            "building_footprint_sq_m": self.building_footprint_sq_m,
            "compliance": self.compliance,
            "wall_segments": [
                {
                    "id": ws.id,
                    "start": list(ws.start),
                    "end": list(ws.end),
                    "thickness": ws.thickness,
                }
                for ws in self.wall_segments
            ],
            "furniture": self.furniture,
        }
        return resp

    def write_to_dxf(self, exporter) -> None:
        """Write this plan into a DXFExporter instance."""
        # Lot boundary (drawn first, behind building elements)
        if self.lot is not None:
            lot_coords = list(self.lot.boundary.exterior.coords)
            exporter.add_lot_boundary(lot_coords)

            if self.lot.setback_polygon is not None and not self.lot.setback_polygon.is_empty:
                sb_coords = list(self.lot.setback_polygon.exterior.coords)
                exporter.add_setback_polygon(sb_coords)

            # North arrow — place outside top-right corner of the lot
            bbox = self.lot.boundary.bounds
            north_pos = (bbox[2] + 1000, bbox[3])
            exporter.add_north_arrow(north_pos)

        # Wall polygons (outlines + hatches)
        if isinstance(self.wall_geometry, MultiPolygon):
            for poly in self.wall_geometry.geoms:
                exporter.add_wall_polygon(poly)
        elif isinstance(self.wall_geometry, Polygon) and not self.wall_geometry.is_empty:
            exporter.add_wall_polygon(self.wall_geometry)

        # Wall centerlines (construction reference)
        for seg in self.wall_segments:
            exporter.add_wall_centerline(seg.start, seg.end)

        # Doors (block inserts)
        for door in self.doors:
            exporter.add_door(door.start, door.end, door.swing)

        # Windows (block inserts)
        for window in self.windows:
            exporter.add_window(window.start, window.end)

        # Room labels + area
        for room in self.rooms:
            exporter.add_room_label(room.centroid, room.name, room.area_sq_m)

        # Dimensions on exterior walls
        bbox = self.bounding_box
        if bbox != (0, 0, 0, 0):
            minx, miny, maxx, maxy = bbox
            exporter.add_dimension((minx, miny), (maxx, miny), offset=-500)
            exporter.add_dimension((maxx, miny), (maxx, maxy), offset=500)


    def write_to_ifc(self, exporter) -> None:
        """Write this plan into an IFCExporter instance."""
        DEFAULT_WALL_HEIGHT = 2700.0  # mm

        for seg in self.wall_segments:
            exporter.add_wall(seg.start, seg.end, seg.thickness, DEFAULT_WALL_HEIGHT)

        for door in self.doors:
            exporter.add_door(door.start, door.end, door.swing)

        for window in self.windows:
            exporter.add_window(window.start, window.end, window.sill_height, window.head_height)

        for room in self.rooms:
            exporter.add_room(
                list(room.polygon.exterior.coords),
                room.name,
                room.area_sq_m,
                DEFAULT_WALL_HEIGHT,
            )


def build_plan_from_coords(data: dict) -> BuiltPlan:
    """Build a plan from raw coordinate data (the /generate/from-coords endpoint)."""
    plan = FloorPlan(unit=data.get("unit", "mm"))

    for w in data.get("walls", []):
        plan.walls.add(
            start=tuple(w["start"]),
            end=tuple(w["end"]),
            thickness=w.get("thickness", 200.0),
            id=w.get("id"),
        )

    for d in data.get("doors", []):
        plan.doors.append(Door(
            id=d.get("id"),
            start=tuple(d["start"]),
            end=tuple(d["end"]),
            swing=d.get("swing", "left"),
        ))

    for win in data.get("windows", []):
        plan.windows.append(Window(
            id=win.get("id"),
            start=tuple(win["start"]),
            end=tuple(win["end"]),
            sill_height=win.get("sill_height", 900.0),
            head_height=win.get("head_height", 2100.0),
        ))

    for lbl in data.get("labels", []):
        plan.labels[lbl["text"]] = tuple(lbl["position"])

    return plan.build()
