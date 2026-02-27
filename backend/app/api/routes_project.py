"""Project management API endpoints — desktop single-session."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.project.project_manager import (
    ProjectManager,
    NoActiveProjectError,
    ProjectAlreadyExistsError,
    InvalidProjectError,
)

router = APIRouter(tags=["project"])

# Desktop-only: one ProjectManager per process (single active project).
_pm = ProjectManager()


def _default_base() -> Path:
    return Path.home() / "Documents" / "SKAD_Projects"


# ── Request schemas ───────────────────────────────────────────────────────────

class NewProjectRequest(BaseModel):
    project_name: str
    client_name: str = ""
    location: str = ""
    base_dir: Optional[str] = None


class OpenProjectRequest(BaseModel):
    project_path: str


class SaveScriptRequest(BaseModel):
    script: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/project/status")
async def project_status():
    """Return current active project info, or {active: false} if none."""
    if not _pm.is_active():
        return {"active": False}
    return {
        "active": True,
        "project_path": _pm.get_project_path(),
        "metadata": _pm.get_metadata(),
    }


@router.get("/project/list")
async def list_projects(base_dir: Optional[str] = None):
    """Scan base_dir for SKAD project folders and return summary list."""
    base = Path(base_dir) if base_dir else _default_base()
    projects = []
    if base.is_dir():
        for entry in sorted(base.iterdir()):
            json_path = entry / "project.json"
            if not (entry.is_dir() and json_path.is_file()):
                continue
            try:
                meta = json.loads(json_path.read_text(encoding="utf-8"))
                projects.append({
                    "project_path": str(entry),
                    "project_name": meta.get("project_name", entry.name),
                    "client_name": meta.get("client_name", ""),
                    "location": meta.get("location", ""),
                    "last_modified": meta.get("last_modified", ""),
                })
            except Exception:
                pass  # skip corrupt entries silently
    return {"projects": projects}


@router.post("/project/new")
async def new_project(req: NewProjectRequest):
    """Create a new project folder and make it the active project."""
    base = str(Path(req.base_dir) if req.base_dir else _default_base())
    try:
        path = _pm.create_project(base, {
            "project_name": req.project_name,
            "client_name": req.client_name,
            "location": req.location,
        })
    except ProjectAlreadyExistsError as exc:
        raise HTTPException(409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(422, detail=str(exc))
    return {"project_path": path, "metadata": _pm.get_metadata()}


@router.post("/project/open")
async def open_project(req: OpenProjectRequest):
    """Open an existing project and return its metadata + script text."""
    try:
        _pm.open_project(req.project_path)
    except FileNotFoundError as exc:
        raise HTTPException(404, detail=str(exc))
    except InvalidProjectError as exc:
        raise HTTPException(422, detail=str(exc))
    return {"metadata": _pm.get_metadata(), "script": _pm.load_script()}


@router.post("/project/save-script")
async def save_script(req: SaveScriptRequest):
    """Save script text to the active project's script.skad file."""
    try:
        _pm.save_script(req.script)
    except NoActiveProjectError as exc:
        raise HTTPException(400, detail=str(exc))
    return {"ok": True, "last_modified": _pm.get_metadata()["last_modified"]}
