"""AST node definitions for the SKAD scripting language."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Union


@dataclass
class WallCommand:
    start: tuple[float, float]
    end: tuple[float, float]
    thickness: float = 200.0
    line: int = 0


@dataclass
class DoorCommand:
    start: tuple[float, float]
    end: tuple[float, float]
    swing: str = "left"
    line: int = 0


@dataclass
class WindowCommand:
    start: tuple[float, float]
    end: tuple[float, float]
    sill_height: float = 900.0
    head_height: float = 2100.0
    line: int = 0


@dataclass
class LabelCommand:
    position: tuple[float, float]
    text: str = ""
    line: int = 0


@dataclass
class UnitCommand:
    unit: str = "mm"
    line: int = 0


@dataclass
class LotCommand:
    vertices: list[tuple[float, float]]
    line: int = 0


@dataclass
class SetbackCommand:
    front: float = 0.0
    rear: float = 0.0
    left: float = 0.0
    right: float = 0.0
    line: int = 0


@dataclass
class NorthCommand:
    angle: float = 90.0  # degrees; 90 = pointing up
    line: int = 0


Command = Union[WallCommand, DoorCommand, WindowCommand, LabelCommand, UnitCommand, LotCommand, SetbackCommand, NorthCommand]


@dataclass
class FloorPlanAST:
    commands: list[Command]
    unit: str = "mm"

    @property
    def walls(self) -> list[WallCommand]:
        return [c for c in self.commands if isinstance(c, WallCommand)]

    @property
    def doors(self) -> list[DoorCommand]:
        return [c for c in self.commands if isinstance(c, DoorCommand)]

    @property
    def windows(self) -> list[WindowCommand]:
        return [c for c in self.commands if isinstance(c, WindowCommand)]

    @property
    def labels(self) -> list[LabelCommand]:
        return [c for c in self.commands if isinstance(c, LabelCommand)]

    @property
    def lot(self) -> "LotCommand | None":
        cmds = [c for c in self.commands if isinstance(c, LotCommand)]
        return cmds[0] if cmds else None

    @property
    def setback(self) -> "SetbackCommand | None":
        cmds = [c for c in self.commands if isinstance(c, SetbackCommand)]
        return cmds[0] if cmds else None

    @property
    def north(self) -> "NorthCommand | None":
        cmds = [c for c in self.commands if isinstance(c, NorthCommand)]
        return cmds[0] if cmds else None
