export interface ScriptTemplate {
  name: string;
  description: string;
  script: string;
}

export const SCRIPT_TEMPLATES: ScriptTemplate[] = [
  {
    name: "Studio Unit",
    description: "Single room with door and 2 windows",
    script: `UNIT mm

# Studio unit — 6m × 5m
WALL (0,0) -> (6000,0) THICK 200
WALL (6000,0) -> (6000,5000) THICK 200
WALL (6000,5000) -> (0,5000) THICK 200
WALL (0,5000) -> (0,0) THICK 200

DOOR (2500,0) -> (3400,0) SWING left
WINDOW (0,1500) -> (0,3000) SILL 900 HEIGHT 1200
WINDOW (6000,1500) -> (6000,3000) SILL 900 HEIGHT 1200

ROOM (3000,2500) "Studio" COLOR #f5e6d3
`,
  },
  {
    name: "1-Bedroom Apartment",
    description: "Living room, bedroom, bathroom, kitchen",
    script: `UNIT mm

# 1-Bedroom apartment — approx 50 sqm
# Outer shell
WALL (0,0) -> (9000,0) THICK 200
WALL (9000,0) -> (9000,7000) THICK 200
WALL (9000,7000) -> (0,7000) THICK 200
WALL (0,7000) -> (0,0) THICK 200

# Interior partitions
WALL (5500,0) -> (5500,4500) THICK 150
WALL (5500,4500) -> (9000,4500) THICK 150
WALL (0,4500) -> (5500,4500) THICK 150

# Doors
DOOR (2500,0) -> (3400,0) SWING left
DOOR (5500,1800) -> (5500,2700) SWING right
DOOR (5500,5500) -> (5500,6400) SWING left
DOOR (7000,4500) -> (7900,4500) SWING double

# Windows
WINDOW (1000,7000) -> (3000,7000) SILL 900 HEIGHT 1200
WINDOW (6000,7000) -> (8500,7000) SILL 900 HEIGHT 1200
WINDOW (9000,1500) -> (9000,3500) SILL 900 HEIGHT 1200

# Room labels
ROOM (2750,2250) "Living Room" COLOR #f5e6d3
ROOM (7250,2250) "Kitchen" COLOR #d3e8f5
ROOM (4500,5750) "Bedroom" COLOR #d3f5e6
ROOM (7250,5750) "Bathroom" COLOR #f5f0d3
`,
  },
  {
    name: "2-Bedroom House + Lot",
    description: "Full house with lot plan, setbacks, north arrow",
    script: `UNIT mm

NORTH 90
LOT (0,0) -> (15000,0) -> (15000,20000) -> (0,20000)
SETBACK FRONT 3000 REAR 2000 SIDE 1500

# House outer shell — 10m × 12m, centred on lot
WALL (2500,4000) -> (12500,4000) THICK 200
WALL (12500,4000) -> (12500,16000) THICK 200
WALL (12500,16000) -> (2500,16000) THICK 200
WALL (2500,16000) -> (2500,4000) THICK 200

# Interior partitions
WALL (2500,10000) -> (12500,10000) THICK 150
WALL (7500,4000) -> (7500,10000) THICK 150
WALL (7500,10000) -> (7500,13000) THICK 150

# Doors
DOOR (5000,4000) -> (5900,4000) SWING left
DOOR (7500,7000) -> (7500,7900) SWING right
DOOR (7500,11500) -> (7500,12400) SWING left
DOOR (4500,10000) -> (5400,10000) SWING double
DOOR (9500,10000) -> (10400,10000) SWING double

# Windows
WINDOW (3000,16000) -> (5000,16000) SILL 900 HEIGHT 1200
WINDOW (8000,16000) -> (11000,16000) SILL 900 HEIGHT 1200
WINDOW (2500,6000) -> (2500,9000) SILL 900 HEIGHT 1200
WINDOW (12500,6000) -> (12500,9000) SILL 900 HEIGHT 1200
WINDOW (12500,11000) -> (12500,14000) SILL 900 HEIGHT 1200

# Rooms
ROOM (5000,7000) "Living / Dining" COLOR #f5e6d3
ROOM (10000,7000) "Kitchen" COLOR #d3e8f5
ROOM (4000,13000) "Bedroom 1" COLOR #d3f5e6
ROOM (10000,13000) "Bedroom 2" COLOR #f5d3e8
ROOM (7500,11500) "Hallway" COLOR #e8f5d3
`,
  },
  {
    name: "Small Office",
    description: "Open plan office with reception and meeting room",
    script: `UNIT mm

# Small office — 12m × 8m
WALL (0,0) -> (12000,0) THICK 200
WALL (12000,0) -> (12000,8000) THICK 200
WALL (12000,8000) -> (0,8000) THICK 200
WALL (0,8000) -> (0,0) THICK 200

# Reception divider
WALL (0,2500) -> (4000,2500) THICK 150
WALL (4000,0) -> (4000,2500) THICK 150

# Meeting room
WALL (8000,4000) -> (12000,4000) THICK 150
WALL (8000,4000) -> (8000,8000) THICK 150

# Doors
DOOR (5500,0) -> (6500,0) SWING double
DOOR (4000,1200) -> (4000,2100) SWING right
DOOR (8000,6000) -> (8000,6900) SWING left

# Windows — south and north facades
WINDOW (1000,0) -> (3000,0) SILL 900 HEIGHT 1200
WINDOW (7000,0) -> (9000,0) SILL 900 HEIGHT 1200
WINDOW (1000,8000) -> (4000,8000) SILL 900 HEIGHT 1200
WINDOW (5500,8000) -> (9000,8000) SILL 900 HEIGHT 1200
WINDOW (12000,1000) -> (12000,3500) SILL 900 HEIGHT 1200
WINDOW (12000,5000) -> (12000,7500) SILL 900 HEIGHT 1200

# Rooms
ROOM (2000,1250) "Reception" COLOR #f5e6d3
ROOM (4000,4000) "Open Office" COLOR #d3e8f5
ROOM (10000,6000) "Meeting Room" COLOR #d3f5e6
`,
  },
];
