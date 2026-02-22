"""Unit conversion utilities. Internal representation is always millimeters."""

UNIT_TO_MM = {
    "mm": 1.0,
    "cm": 10.0,
    "m": 1000.0,
    "ft": 304.8,
    "in": 25.4,
}

VALID_UNITS = set(UNIT_TO_MM.keys())


def to_mm(value: float, unit: str) -> float:
    """Convert a value from the given unit to millimeters."""
    if unit not in UNIT_TO_MM:
        raise ValueError(f"Unknown unit '{unit}'. Valid: {VALID_UNITS}")
    return value * UNIT_TO_MM[unit]


def from_mm(value: float, unit: str) -> float:
    """Convert a value from millimeters to the given unit."""
    if unit not in UNIT_TO_MM:
        raise ValueError(f"Unknown unit '{unit}'. Valid: {VALID_UNITS}")
    return value / UNIT_TO_MM[unit]


def area_mm2_to_m2(area_mm2: float) -> float:
    return area_mm2 / 1_000_000


def area_mm2_to_ft2(area_mm2: float) -> float:
    return area_mm2 / (304.8 * 304.8)
