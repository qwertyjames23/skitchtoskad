"""Project manager for SKAD — single active project, desktop-only.

Project folder layout:
    <base_dir>/<ProjectName>/
        project.json   — metadata (v1 schema)
        script.skad    — user script text
        outputs/       — DXF / IFC exports

Usage:
    pm = ProjectManager()
    pm.create_project("/path/to/Documents/SKAD_Projects", {"project_name": "House A", ...})
    pm.save_script("UNIT mm\\nWALL (0,0) -> (5000,0) THICK 200")
    text = pm.load_script()
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


# ── Constants ────────────────────────────────────────────────────────────────

_PROJECT_FILE = "project.json"
_SCRIPT_FILE = "script.skad"
_OUTPUTS_DIR = "outputs"

_METADATA_KEYS = {"project_name", "client_name", "location", "created_at", "last_modified"}
_SCHEMA_VERSION = 1


# ── Exceptions ────────────────────────────────────────────────────────────────

class NoActiveProjectError(RuntimeError):
    """Raised when an operation requires an active project but none is loaded."""

    def __str__(self) -> str:
        return (
            "No project is currently active. "
            "Call create_project() or open_project() first."
        )


class ProjectAlreadyExistsError(FileExistsError):
    """Raised when create_project() would overwrite an existing project folder."""

    def __init__(self, path: str) -> None:
        super().__init__(f"Project folder already exists: {path}")


class InvalidProjectError(ValueError):
    """Raised when a project folder is missing required files or has a corrupt schema."""

    def __init__(self, path: str, reason: str) -> None:
        super().__init__(f"Invalid project at '{path}': {reason}")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _utc_now() -> str:
    """Return current UTC time as an ISO-8601 string (e.g. 2026-02-26T10:30:00Z)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _sanitize_folder_name(name: str) -> str:
    """Strip characters that are unsafe for folder names on Windows/macOS/Linux."""
    unsafe = r'\/:*?"<>|'
    sanitized = "".join(c if c not in unsafe else "_" for c in name.strip())
    if not sanitized:
        raise ValueError("project_name produces an empty folder name after sanitization.")
    return sanitized


def _build_empty_metadata(project_name: str) -> dict:
    now = _utc_now()
    return {
        "schema_version": _SCHEMA_VERSION,
        "project_name": project_name,
        "client_name": "",
        "location": "",
        "created_at": now,
        "last_modified": now,
    }


# ── ProjectManager ────────────────────────────────────────────────────────────

class ProjectManager:
    """Manages a single active SKAD project on the local filesystem.

    Only one project is active at a time.  All mutating methods raise
    NoActiveProjectError if no project has been created or opened.
    """

    def __init__(self) -> None:
        self._project_path: Optional[Path] = None
        self._metadata: Optional[dict] = None

    # ── Creation ─────────────────────────────────────────────────────────────

    def create_project(self, base_dir: str, metadata: dict) -> str:
        """Create a new project under base_dir and make it the active project.

        Args:
            base_dir: Parent directory (e.g. Documents/SKAD_Projects).
                      Created automatically if it does not exist.
            metadata: Dict with at least 'project_name' key.  Optional keys:
                      'client_name', 'location'.

        Returns:
            Absolute path to the newly created project folder.

        Raises:
            ValueError: If 'project_name' is missing or empty.
            ProjectAlreadyExistsError: If the target folder already exists.
        """
        project_name = metadata.get("project_name", "").strip()
        if not project_name:
            raise ValueError("metadata must include a non-empty 'project_name'.")

        folder_name = _sanitize_folder_name(project_name)
        base = Path(base_dir).resolve()
        project_path = base / folder_name

        if project_path.exists():
            raise ProjectAlreadyExistsError(str(project_path))

        # Build metadata record
        now = _utc_now()
        meta = _build_empty_metadata(project_name)
        meta["client_name"] = metadata.get("client_name", "").strip()
        meta["location"] = metadata.get("location", "").strip()
        meta["created_at"] = now
        meta["last_modified"] = now

        # Create folder structure
        project_path.mkdir(parents=True, exist_ok=False)
        (project_path / _OUTPUTS_DIR).mkdir()

        # Write project.json
        self._write_json(project_path / _PROJECT_FILE, meta)

        # Write empty script placeholder
        (project_path / _SCRIPT_FILE).write_text("", encoding="utf-8")

        # Activate
        self._project_path = project_path
        self._metadata = meta

        return str(project_path)

    # ── Open ─────────────────────────────────────────────────────────────────

    def open_project(self, project_path: str) -> None:
        """Load an existing project from disk and make it the active project.

        Args:
            project_path: Path to a project folder that contains project.json.

        Raises:
            FileNotFoundError: If the folder or project.json does not exist.
            InvalidProjectError: If project.json is missing required keys or
                                 is not valid JSON.
        """
        path = Path(project_path).resolve()

        if not path.is_dir():
            raise FileNotFoundError(f"Project folder not found: {path}")

        json_path = path / _PROJECT_FILE
        if not json_path.is_file():
            raise InvalidProjectError(str(path), f"'{_PROJECT_FILE}' not found.")

        meta = self._read_json(json_path, context=str(path))
        self._validate_metadata(meta, context=str(path))

        # Ensure outputs/ exists (tolerant of hand-created projects)
        (path / _OUTPUTS_DIR).mkdir(exist_ok=True)

        self._project_path = path
        self._metadata = meta

    # ── Script I/O ────────────────────────────────────────────────────────────

    def save_script(self, script_text: str) -> None:
        """Overwrite script.skad in the active project.

        Args:
            script_text: Full text of the SKAD script.

        Raises:
            NoActiveProjectError: If no project is active.
        """
        self._require_active()
        script_path = self._project_path / _SCRIPT_FILE
        script_path.write_text(script_text, encoding="utf-8")
        self._touch_modified()

    def load_script(self) -> str:
        """Return the contents of script.skad in the active project.

        Returns an empty string if the file does not yet exist.

        Raises:
            NoActiveProjectError: If no project is active.
        """
        self._require_active()
        script_path = self._project_path / _SCRIPT_FILE
        if not script_path.is_file():
            return ""
        return script_path.read_text(encoding="utf-8")

    # ── Accessors ─────────────────────────────────────────────────────────────

    def get_project_path(self) -> str:
        """Return the absolute path to the active project folder.

        Raises:
            NoActiveProjectError: If no project is active.
        """
        self._require_active()
        return str(self._project_path)

    def get_metadata(self) -> dict:
        """Return a copy of the active project's metadata dict.

        Raises:
            NoActiveProjectError: If no project is active.
        """
        self._require_active()
        return dict(self._metadata)

    def get_outputs_path(self) -> str:
        """Return the absolute path to the outputs/ folder.

        Raises:
            NoActiveProjectError: If no project is active.
        """
        self._require_active()
        return str(self._project_path / _OUTPUTS_DIR)

    def is_active(self) -> bool:
        """Return True if a project is currently active."""
        return self._project_path is not None

    # ── Internal helpers ─────────────────────────────────────────────────────

    def _require_active(self) -> None:
        if self._project_path is None:
            raise NoActiveProjectError()

    def _touch_modified(self) -> None:
        """Update last_modified in metadata and persist to disk."""
        self._metadata["last_modified"] = _utc_now()
        self._write_json(self._project_path / _PROJECT_FILE, self._metadata)

    @staticmethod
    def _write_json(path: Path, data: dict) -> None:
        path.write_text(
            json.dumps(data, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    @staticmethod
    def _read_json(path: Path, context: str) -> dict:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise InvalidProjectError(context, f"'{_PROJECT_FILE}' is not valid JSON: {exc}") from exc

    @staticmethod
    def _validate_metadata(meta: dict, context: str) -> None:
        required = {"project_name", "created_at", "last_modified"}
        missing = required - meta.keys()
        if missing:
            raise InvalidProjectError(
                context,
                f"'{_PROJECT_FILE}' is missing required keys: {sorted(missing)}",
            )
        if not isinstance(meta.get("project_name"), str) or not meta["project_name"].strip():
            raise InvalidProjectError(context, "'project_name' must be a non-empty string.")
