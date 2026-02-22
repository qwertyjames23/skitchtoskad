"""Tests for the script parser."""

import pytest
from app.core.parser.tokenizer import tokenize, TokenizeError, TokenType
from app.core.parser.parser import parse
from app.core.parser.validator import validate
from app.core.parser.ast_nodes import (
    WallCommand, DoorCommand, WindowCommand, LabelCommand, UnitCommand,
)


class TestTokenizer:
    def test_simple_wall(self):
        tokens = tokenize('WALL (0,0) -> (5000,0) THICK 200')
        types = [t.type for t in tokens if t.type not in (TokenType.NEWLINE, TokenType.EOF)]
        assert types == [
            TokenType.KEYWORD,  # WALL
            TokenType.COORD,    # (0,0)
            TokenType.ARROW,    # ->
            TokenType.COORD,    # (5000,0)
            TokenType.KEYWORD,  # THICK
            TokenType.NUMBER,   # 200
        ]

    def test_string_literal(self):
        tokens = tokenize('LABEL (100,200) "Kitchen"')
        string_tokens = [t for t in tokens if t.type == TokenType.STRING]
        assert len(string_tokens) == 1
        assert string_tokens[0].value == "Kitchen"

    def test_comment_ignored(self):
        tokens = tokenize('# this is a comment\nWALL (0,0) -> (100,0)')
        keywords = [t for t in tokens if t.type == TokenType.KEYWORD]
        assert len(keywords) == 1
        assert keywords[0].value == "WALL"

    def test_negative_coords(self):
        tokens = tokenize('WALL (-100,-200) -> (300,400)')
        coords = [t for t in tokens if t.type == TokenType.COORD]
        assert len(coords) == 2
        assert coords[0].value == "(-100,-200)"

    def test_decimal_coords(self):
        tokens = tokenize('WALL (100.5,200.3) -> (300,400)')
        coords = [t for t in tokens if t.type == TokenType.COORD]
        assert "100.5" in coords[0].value

    def test_empty_input(self):
        tokens = tokenize('')
        assert tokens[-1].type == TokenType.EOF

    def test_multiple_lines(self):
        script = """WALL (0,0) -> (100,0)
WALL (100,0) -> (100,100)"""
        tokens = tokenize(script)
        keywords = [t for t in tokens if t.type == TokenType.KEYWORD]
        assert len(keywords) == 2


class TestParser:
    def test_parse_wall(self):
        tokens = tokenize('WALL (0,0) -> (5000,0) THICK 200')
        result = parse(tokens)
        assert result.ok
        assert len(result.ast.commands) == 1
        cmd = result.ast.commands[0]
        assert isinstance(cmd, WallCommand)
        assert cmd.start == (0, 0)
        assert cmd.end == (5000, 0)
        assert cmd.thickness == 200

    def test_parse_wall_default_thickness(self):
        tokens = tokenize('WALL (0,0) -> (5000,0)')
        result = parse(tokens)
        assert result.ok
        cmd = result.ast.commands[0]
        assert isinstance(cmd, WallCommand)
        assert cmd.thickness == 200.0  # default

    def test_parse_door(self):
        tokens = tokenize('DOOR (100,0) -> (900,0) SWING right')
        result = parse(tokens)
        assert result.ok
        cmd = result.ast.commands[0]
        assert isinstance(cmd, DoorCommand)
        assert cmd.swing == "right"

    def test_parse_window(self):
        tokens = tokenize('WINDOW (100,0) -> (1100,0) HEIGHT 1200')
        result = parse(tokens)
        assert result.ok
        cmd = result.ast.commands[0]
        assert isinstance(cmd, WindowCommand)

    def test_parse_label(self):
        tokens = tokenize('LABEL (2500,2000) "Living Room"')
        result = parse(tokens)
        assert result.ok
        cmd = result.ast.commands[0]
        assert isinstance(cmd, LabelCommand)
        assert cmd.text == "Living Room"
        assert cmd.position == (2500, 2000)

    def test_parse_unit(self):
        tokens = tokenize('UNIT mm')
        result = parse(tokens)
        assert result.ok
        assert result.ast.unit == "mm"

    def test_parse_full_script(self):
        script = """UNIT mm
WALL (0,0) -> (5000,0) THICK 200
WALL (5000,0) -> (5000,4000) THICK 200
WALL (5000,4000) -> (0,4000) THICK 200
WALL (0,4000) -> (0,0) THICK 200
DOOR (2500,0) -> (2500,900) SWING left
WINDOW (1000,4000) -> (2000,4000)
LABEL (2500,2000) "Main Room"
"""
        tokens = tokenize(script)
        result = parse(tokens)
        assert result.ok
        assert len(result.ast.walls) == 4
        assert len(result.ast.doors) == 1
        assert len(result.ast.windows) == 1
        assert len(result.ast.labels) == 1

    def test_parse_error_missing_coord(self):
        tokens = tokenize('WALL -> (5000,0)')
        result = parse(tokens)
        assert not result.ok
        assert len(result.errors) > 0

    def test_parse_error_unknown_keyword(self):
        tokens = tokenize('FLOOR 1')
        result = parse(tokens)
        assert not result.ok


class TestValidator:
    def test_valid_plan(self):
        tokens = tokenize('WALL (0,0) -> (5000,0) THICK 200')
        result = parse(tokens)
        errors = validate(result.ast)
        assert len(errors) == 0

    def test_no_walls(self):
        tokens = tokenize('LABEL (100,200) "Room"')
        result = parse(tokens)
        errors = validate(result.ast)
        assert any("No walls" in e.message for e in errors)

    def test_zero_length_wall(self):
        tokens = tokenize('WALL (100,100) -> (100,100)')
        result = parse(tokens)
        errors = validate(result.ast)
        assert any("zero length" in e.message for e in errors)

    def test_excessive_thickness(self):
        tokens = tokenize('WALL (0,0) -> (5000,0) THICK 2000')
        result = parse(tokens)
        errors = validate(result.ast)
        assert any("too large" in e.message for e in errors)

    def test_invalid_swing(self):
        script = """WALL (0,0) -> (5000,0)
DOOR (100,0) -> (900,0) SWING up"""
        tokens = tokenize(script)
        result = parse(tokens)
        errors = validate(result.ast)
        assert any("swing" in e.message.lower() for e in errors)

    def test_duplicate_labels(self):
        script = """WALL (0,0) -> (5000,0)
LABEL (100,200) "Kitchen"
LABEL (300,400) "Kitchen"
"""
        tokens = tokenize(script)
        result = parse(tokens)
        errors = validate(result.ast)
        assert any("Duplicate" in e.message for e in errors)
