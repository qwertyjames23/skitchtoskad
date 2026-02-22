"""SKAD Floor Plan Generator — FastAPI application entry point."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config import settings
from app.api.routes_parse import router as parse_router
from app.api.routes_generate import router as generate_router
from app.api.routes_export import router as export_router

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Generate architectural floor plans from scripts or coordinates, export to DXF.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(parse_router, prefix="/api")
app.include_router(generate_router, prefix="/api")
app.include_router(export_router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


# ── Serve frontend static files ─────────────────────────────────────────
# When running from PyInstaller, _MEIPASS points to the temp extract dir.
# In development, the frontend/dist folder sits alongside the backend.

def _find_frontend_dist() -> Optional[Path]:
    """Locate the built frontend dist folder."""
    # PyInstaller bundle
    if getattr(sys, "_MEIPASS", None):
        candidate = Path(sys._MEIPASS) / "frontend_dist"
        if candidate.is_dir():
            return candidate
    # Development: relative to this file
    candidate = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
    if candidate.is_dir():
        return candidate
    return None


_frontend = _find_frontend_dist()
if _frontend:
    # Serve /assets/* (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=str(_frontend / "assets")), name="static")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve index.html for all non-API routes (SPA fallback)."""
        # Try to serve an exact file first
        file = _frontend / full_path
        if full_path and file.is_file():
            return FileResponse(str(file))
        return FileResponse(str(_frontend / "index.html"))
