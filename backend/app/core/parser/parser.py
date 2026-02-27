"""Recursive descent parser: tokens -> AST."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.core.parser.tokenizer import Token, TokenType
from app.core.parser.ast_nodes import (
    FloorPlanAST,
    Command,
    WallCommand,
    DoorCommand,
    WindowCommand,
    LabelCommand,
    UnitCommand,
    LotCommand,
    SetbackCommand,
    NorthCommand,
    RoomCommand,
    FurnitureCommand,
    FloorCommand,
)


@dataclass
class ParseError:
    message: str
    line: int
    col: int


@dataclass
class ParseResult:
    ast: FloorPlanAST | None
    errors: list[ParseError]

    @property
    def ok(self) -> bool:
        return len(self.errors) == 0


class Parser:
    """Parses a token stream into a FloorPlanAST."""

    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.pos = 0
        self.errors: list[ParseError] = []
        self.unit = "mm"

    def parse(self) -> ParseResult:
        commands: list[Command] = []

        while not self._at_end():
            self._skip_newlines()
            if self._at_end():
                break

            cmd = self._parse_command()
            if cmd is not None:
                commands.append(cmd)

            # Consume rest of line on error recovery
            self._skip_to_newline()

        ast = FloorPlanAST(commands=commands, unit=self.unit)
        return ParseResult(ast=ast, errors=self.errors)

    def _parse_command(self) -> Command | None:
        tok = self._peek()
        if tok.type != TokenType.KEYWORD:
            self._error(f"Expected command keyword, got '{tok.value}'", tok)
            return None

        keyword = tok.value.upper()
        if keyword == "UNIT":
            return self._parse_unit()
        elif keyword == "WALL":
            return self._parse_wall()
        elif keyword == "DOOR":
            return self._parse_door()
        elif keyword == "WINDOW":
            return self._parse_window()
        elif keyword == "LABEL":
            return self._parse_label()
        elif keyword == "LOT":
            return self._parse_lot()
        elif keyword == "SETBACK":
            return self._parse_setback()
        elif keyword == "NORTH":
            return self._parse_north()
        elif keyword == "ROOM":
            return self._parse_room()
        elif keyword == "FURNITURE":
            return self._parse_furniture()
        elif keyword == "FLOOR":
            return self._parse_floor()
        else:
            self._error(f"Unknown command '{tok.value}'", tok)
            self._advance()
            return None

    def _parse_unit(self) -> UnitCommand | None:
        tok = self._advance()  # consume UNIT
        unit_tok = self._expect(TokenType.IDENT, "unit name (mm, cm, m, ft)")
        if unit_tok is None:
            return None
        self.unit = unit_tok.value.lower()
        return UnitCommand(unit=self.unit, line=tok.line)

    def _parse_wall(self) -> WallCommand | None:
        tok = self._advance()  # consume WALL
        start = self._expect_coord()
        if start is None:
            return None
        self._expect(TokenType.ARROW, "->")
        end = self._expect_coord()
        if end is None:
            return None

        thickness = 200.0
        if self._match_keyword("THICK"):
            thick_tok = self._expect(TokenType.NUMBER, "thickness value")
            if thick_tok:
                thickness = float(thick_tok.value)

        return WallCommand(start=start, end=end, thickness=thickness, line=tok.line)

    def _parse_door(self) -> DoorCommand | None:
        tok = self._advance()  # consume DOOR
        start = self._expect_coord()
        if start is None:
            return None
        self._expect(TokenType.ARROW, "->")
        end = self._expect_coord()
        if end is None:
            return None

        swing = "left"
        if self._match_keyword("SWING"):
            swing_tok = self._expect_ident_or_keyword("swing direction (left, right, double)")
            if swing_tok:
                swing = swing_tok.value.lower()

        return DoorCommand(start=start, end=end, swing=swing, line=tok.line)

    def _parse_window(self) -> WindowCommand | None:
        tok = self._advance()  # consume WINDOW
        start = self._expect_coord()
        if start is None:
            return None
        self._expect(TokenType.ARROW, "->")
        end = self._expect_coord()
        if end is None:
            return None

        sill = 900.0
        head = 2100.0
        if self._match_keyword("SILL"):
            sill_tok = self._expect(TokenType.NUMBER, "sill height")
            if sill_tok:
                sill = float(sill_tok.value)
        if self._match_keyword("HEIGHT"):
            h_tok = self._expect(TokenType.NUMBER, "window height")
            if h_tok:
                head = sill + float(h_tok.value)

        return WindowCommand(start=start, end=end, sill_height=sill, head_height=head, line=tok.line)

    def _parse_label(self) -> LabelCommand | None:
        tok = self._advance()  # consume LABEL
        pos = self._expect_coord()
        if pos is None:
            return None

        text_tok = self._expect(TokenType.STRING, "label text")
        if text_tok is None:
            return None

        return LabelCommand(position=pos, text=text_tok.value, line=tok.line)

    def _parse_lot(self) -> LotCommand | None:
        tok = self._advance()  # consume LOT
        vertices: list[tuple[float, float]] = []

        first = self._expect_coord()
        if first is None:
            return None
        vertices.append(first)

        while not self._at_end() and self._peek().type == TokenType.ARROW:
            self._advance()  # consume ->
            coord = self._expect_coord()
            if coord is None:
                return None
            vertices.append(coord)

        if len(vertices) < 3:
            self._error("LOT requires at least 3 vertices to form a polygon", tok)
            return None

        return LotCommand(vertices=vertices, line=tok.line)

    def _parse_setback(self) -> SetbackCommand | None:
        tok = self._advance()  # consume SETBACK

        # Uniform: SETBACK 3000
        if not self._at_end() and self._peek().type == TokenType.NUMBER:
            num_tok = self._advance()
            d = float(num_tok.value)
            return SetbackCommand(front=d, rear=d, left=d, right=d, line=tok.line)

        # Directional: SETBACK front 3000 rear 2000 side 1500
        front = rear = left = right = 0.0
        DIRS = {"FRONT", "REAR", "LEFT", "RIGHT", "SIDE"}

        while not self._at_end() and self._peek().type == TokenType.KEYWORD:
            kw = self._peek().value.upper()
            if kw not in DIRS:
                break
            self._advance()
            num_tok = self._expect(TokenType.NUMBER, "setback distance")
            if num_tok is None:
                break
            val = float(num_tok.value)
            if kw == "FRONT":
                front = val
            elif kw == "REAR":
                rear = val
            elif kw == "LEFT":
                left = val
            elif kw == "RIGHT":
                right = val
            elif kw == "SIDE":
                left = right = val

        return SetbackCommand(front=front, rear=rear, left=left, right=right, line=tok.line)

    def _parse_north(self) -> NorthCommand | None:
        tok = self._advance()  # consume NORTH
        num_tok = self._expect(TokenType.NUMBER, "angle in degrees")
        if num_tok is None:
            return None
        return NorthCommand(angle=float(num_tok.value), line=tok.line)

    def _parse_room(self) -> RoomCommand | None:
        tok = self._advance()  # consume ROOM
        pos = self._expect_coord()
        if pos is None:
            return None
        text_tok = self._expect(TokenType.STRING, "room name")
        if text_tok is None:
            return None
        color = ""
        if self._match_keyword("COLOR"):
            color_tok = self._expect(TokenType.HEX_COLOR, "hex color like #f5e6d3")
            if color_tok:
                color = color_tok.value
        return RoomCommand(position=pos, text=text_tok.value, color=color, line=tok.line)

    def _parse_floor(self) -> FloorCommand | None:
        tok = self._advance()  # consume FLOOR
        level_tok = self._expect(TokenType.NUMBER, "floor level (e.g. 1, 2)")
        if level_tok is None:
            return None
        level = int(float(level_tok.value))
        return FloorCommand(level=level, line=tok.line)

    def _parse_furniture(self) -> FurnitureCommand | None:
        tok = self._advance()  # consume FURNITURE
        pos = self._expect_coord()
        if pos is None:
            return None
        type_tok = self._expect(TokenType.STRING, 'fixture type e.g. "toilet"')
        if type_tok is None:
            return None
        rotation = 0.0
        if self._match_keyword("ROT"):
            rot_tok = self._expect(TokenType.NUMBER, "rotation angle in degrees")
            if rot_tok:
                rotation = float(rot_tok.value)
        return FurnitureCommand(position=pos, fixture_type=type_tok.value, rotation=rotation, line=tok.line)

    # ── Helper methods ──

    def _expect_ident_or_keyword(self, description: str) -> Token | None:
        """Accept either IDENT or KEYWORD — needed when a word is both a keyword and a valid value."""
        if self._at_end():
            self._error(f"Expected {description}, got end of input", self.tokens[-1])
            return None
        tok = self._peek()
        if tok.type in (TokenType.IDENT, TokenType.KEYWORD):
            return self._advance()
        self._error(f"Expected {description}, got '{tok.value}'", tok)
        return None

    def _expect_coord(self) -> tuple[float, float] | None:
        tok = self._expect(TokenType.COORD, "coordinate (x,y)")
        if tok is None:
            return None
        # Parse "(x, y)" string
        m = re.match(r"\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)", tok.value)
        if not m:
            self._error(f"Malformed coordinate: {tok.value}", tok)
            return None
        return (float(m.group(1)), float(m.group(2)))

    def _peek(self) -> Token:
        return self.tokens[self.pos]

    def _advance(self) -> Token:
        tok = self.tokens[self.pos]
        self.pos += 1
        return tok

    def _at_end(self) -> bool:
        return self.pos >= len(self.tokens) or self.tokens[self.pos].type == TokenType.EOF

    def _expect(self, tok_type: TokenType, description: str) -> Token | None:
        if self._at_end():
            self._error(f"Expected {description}, got end of input", self.tokens[-1])
            return None
        tok = self._peek()
        if tok.type != tok_type:
            self._error(f"Expected {description}, got '{tok.value}'", tok)
            return None
        return self._advance()

    def _match_keyword(self, keyword: str) -> bool:
        if self._at_end():
            return False
        tok = self._peek()
        if tok.type == TokenType.KEYWORD and tok.value.upper() == keyword:
            self._advance()
            return True
        return False

    def _skip_newlines(self):
        while not self._at_end() and self._peek().type == TokenType.NEWLINE:
            self._advance()

    def _skip_to_newline(self):
        while not self._at_end() and self._peek().type != TokenType.NEWLINE:
            self._advance()

    def _error(self, message: str, token: Token):
        self.errors.append(ParseError(message=message, line=token.line, col=token.col))


def parse(tokens: list[Token]) -> ParseResult:
    """Convenience function to parse tokens into AST."""
    return Parser(tokens).parse()
