"""Tests for the FastAPI endpoints."""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

SAMPLE_SCRIPT = """UNIT mm
WALL (0,0) -> (5000,0) THICK 200
WALL (5000,0) -> (5000,4000) THICK 200
WALL (5000,4000) -> (0,4000) THICK 200
WALL (0,4000) -> (0,0) THICK 200
LABEL (2500,2000) "Main Room"
"""


class TestHealthEndpoint:
    def test_health(self):
        r = client.get("/api/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


class TestParseEndpoint:
    def test_valid_script(self):
        r = client.post("/api/parse", json={"script": SAMPLE_SCRIPT})
        assert r.status_code == 200
        data = r.json()
        assert data["valid"] is True
        assert data["wall_count"] == 4

    def test_empty_script(self):
        r = client.post("/api/parse", json={"script": ""})
        assert r.status_code == 422

    def test_invalid_syntax(self):
        r = client.post("/api/parse", json={"script": "WALL -> missing"})
        assert r.status_code == 422


class TestGenerateEndpoint:
    def test_generate_from_script(self):
        r = client.post("/api/generate/from-script", json={"script": SAMPLE_SCRIPT})
        assert r.status_code == 200
        data = r.json()
        assert "walls_geojson" in data
        assert "rooms" in data
        assert len(data["rooms"]) == 1
        assert data["rooms"][0]["name"] == "Main Room"
        assert data["rooms"][0]["area_sq_m"] > 0

    def test_generate_from_coords(self):
        r = client.post("/api/generate/from-coords", json={
            "walls": [
                {"id": "wall-1", "start": [0, 0], "end": [5000, 0], "thickness": 200},
                {"id": "wall-2", "start": [5000, 0], "end": [5000, 4000], "thickness": 200},
                {"id": "wall-3", "start": [5000, 4000], "end": [0, 4000], "thickness": 200},
                {"id": "wall-4", "start": [0, 4000], "end": [0, 0], "thickness": 200},
            ],
            "doors": [
                {"id": "door-1", "start": [2000, 0], "end": [2900, 0], "swing": "left"},
            ],
            "windows": [
                {"id": "window-1", "start": [5000, 1200], "end": [5000, 2200], "sill_height": 900, "head_height": 2100},
            ],
            "labels": [{"position": [2500, 2000], "text": "Room 1"}],
        })
        assert r.status_code == 200
        data = r.json()
        assert len(data["rooms"]) == 1
        assert data["doors"][0]["id"] == "door-1"
        assert data["doors"][0]["start"] == [2000, 0]
        assert data["doors"][0]["end"] == [2900, 0]
        assert data["windows"][0]["id"] == "window-1"
        assert data["windows"][0]["start"] == [5000, 1200]
        assert data["windows"][0]["end"] == [5000, 2200]
        wall_ids = [seg.get("id") for seg in data["wall_segments"]]
        assert wall_ids == ["wall-1", "wall-2", "wall-3", "wall-4"]


class TestExportEndpoint:
    def test_export_dxf(self):
        r = client.post("/api/export/dxf/from-script", json={"script": SAMPLE_SCRIPT})
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/dxf"
        assert len(r.content) > 0

    def test_export_dxf_invalid_script(self):
        r = client.post("/api/export/dxf/from-script", json={"script": "INVALID"})
        assert r.status_code == 422
