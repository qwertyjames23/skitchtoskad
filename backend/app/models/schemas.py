"""Pydantic schemas for API request/response validation."""

from __future__ import annotations

import math
from pydantic import BaseModel, field_validator


class Coordinate(BaseModel):
    x: float
    y: float

    @field_validator("x", "y")
    @classmethod
    def must_be_finite(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("Coordinate must be a finite number")
        return v


class WallInput(BaseModel):
    start: list[float]  # [x, y]
    end: list[float]
    thickness: float = 200.0

    @field_validator("start", "end")
    @classmethod
    def must_be_pair(cls, v: list[float]) -> list[float]:
        if len(v) != 2:
            raise ValueError("Coordinate must be [x, y]")
        return v


class DoorInput(BaseModel):
    start: list[float]
    end: list[float]
    swing: str = "left"


class WindowInput(BaseModel):
    start: list[float]
    end: list[float]
    sill_height: float = 900.0
    head_height: float = 2100.0


class LabelInput(BaseModel):
    position: list[float]
    text: str


class ScriptRequest(BaseModel):
    script: str
    unit: str = "mm"

    @field_validator("script")
    @classmethod
    def script_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Script cannot be empty")
        return v


class CoordsRequest(BaseModel):
    walls: list[WallInput]
    doors: list[DoorInput] = []
    windows: list[WindowInput] = []
    labels: list[LabelInput] = []
    unit: str = "mm"


class RoomResponse(BaseModel):
    name: str
    area_sq_m: float
    area_sq_ft: float
    centroid: list[float]
    dimensions_mm: dict[str, float]
    perimeter_mm: float
    polygon: list[list[float]]


class GenerateResponse(BaseModel):
    walls_geojson: dict
    rooms: list[dict]
    doors: list[dict]
    windows: list[dict]
    bounding_box: list[float]
    lot: dict | None = None
    building_footprint_sq_m: float = 0.0
    compliance: str | None = None
    wall_segments: list[dict] = []


class ParseErrorResponse(BaseModel):
    errors: list[dict]
