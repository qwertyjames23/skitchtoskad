# SKAD Script Language Specification v1.0

## Overview
SKAD scripts define 2D architectural floor plans using a line-based command syntax.
All geometry is defined in plan view (top-down). Units default to millimeters.

## Commands

### UNIT
Set the measurement unit for all coordinates and dimensions.
```
UNIT mm    # millimeters (default)
UNIT cm    # centimeters
UNIT m     # meters
UNIT ft    # feet
```

### WALL
Define a wall segment by its centerline endpoints and optional thickness.
```
WALL (x1,y1) -> (x2,y2)              # uses default 200mm thickness
WALL (x1,y1) -> (x2,y2) THICK 150    # explicit thickness in current unit
```

### DOOR
Define a door opening along a wall. The coordinates mark the opening edges.
```
DOOR (x1,y1) -> (x2,y2)                  # default left swing
DOOR (x1,y1) -> (x2,y2) SWING left       # opens left
DOOR (x1,y1) -> (x2,y2) SWING right      # opens right
DOOR (x1,y1) -> (x2,y2) SWING double     # double door
```

### WINDOW
Define a window opening along a wall.
```
WINDOW (x1,y1) -> (x2,y2)                        # default 900mm sill, 1200mm height
WINDOW (x1,y1) -> (x2,y2) SILL 800 HEIGHT 1400   # custom sill and height
```

### LABEL
Place a text label at a position (used for naming rooms).
```
LABEL (x,y) "Room Name"
```

## Comments
Lines starting with `#` are ignored.
```
# This is a comment
```

## Coordinate System
- Origin (0,0) is at bottom-left
- X axis: positive to the right
- Y axis: positive upward
- Coordinates are in the current UNIT

## Example
```
UNIT mm

WALL (0,0) -> (5000,0) THICK 200
WALL (5000,0) -> (5000,4000) THICK 200
WALL (5000,4000) -> (0,4000) THICK 200
WALL (0,4000) -> (0,0) THICK 200

DOOR (2500,0) -> (2500,900) SWING left
WINDOW (1500,4000) -> (3500,4000)

LABEL (2500,2000) "Living Room"
```
