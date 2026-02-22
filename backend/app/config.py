from __future__ import annotations

import os
from dataclasses import dataclass

try:
    from pydantic_settings import BaseSettings

    class Settings(BaseSettings):
        app_name: str = "SKAD Floor Plan Generator"
        debug: bool = True
        cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]
        default_unit: str = "mm"
        default_wall_thickness: float = 200.0  # mm
        snap_tolerance: float = 1.0  # mm - for closing wall gaps
        max_script_length: int = 50_000  # characters

        class Config:
            env_prefix = "SKAD_"

    settings = Settings()
except ModuleNotFoundError:
    @dataclass
    class Settings:
        app_name: str = "SKAD Floor Plan Generator"
        debug: bool = True
        cors_origins: list[str] = None
        default_unit: str = "mm"
        default_wall_thickness: float = 200.0
        snap_tolerance: float = 1.0
        max_script_length: int = 50_000

        def __post_init__(self) -> None:
            if self.cors_origins is None:
                self.cors_origins = ["http://localhost:3000", "http://localhost:5173"]

    def _env_bool(name: str, default: bool) -> bool:
        raw = os.getenv(name)
        if raw is None:
            return default
        return raw.strip().lower() in {"1", "true", "yes", "on"}

    def _env_float(name: str, default: float) -> float:
        raw = os.getenv(name)
        if raw is None:
            return default
        try:
            return float(raw)
        except ValueError:
            return default

    def _env_int(name: str, default: int) -> int:
        raw = os.getenv(name)
        if raw is None:
            return default
        try:
            return int(raw)
        except ValueError:
            return default

    def _env_list(name: str, default: list[str]) -> list[str]:
        raw = os.getenv(name)
        if raw is None:
            return default
        values = [v.strip() for v in raw.split(",") if v.strip()]
        return values or default

    settings = Settings(
        app_name=os.getenv("SKAD_APP_NAME", "SKAD Floor Plan Generator"),
        debug=_env_bool("SKAD_DEBUG", True),
        cors_origins=_env_list("SKAD_CORS_ORIGINS", ["http://localhost:3000", "http://localhost:5173"]),
        default_unit=os.getenv("SKAD_DEFAULT_UNIT", "mm"),
        default_wall_thickness=_env_float("SKAD_DEFAULT_WALL_THICKNESS", 200.0),
        snap_tolerance=_env_float("SKAD_SNAP_TOLERANCE", 1.0),
        max_script_length=_env_int("SKAD_MAX_SCRIPT_LENGTH", 50_000),
    )
