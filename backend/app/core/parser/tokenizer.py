"""Tokenizer for the SKAD floor plan scripting language."""

from __future__ import annotations

import re
from enum import Enum, auto
from dataclasses import dataclass


class TokenType(Enum):
    KEYWORD = auto()   # WALL, DOOR, WINDOW, UNIT, LABEL, THICK, SWING, HEIGHT
    COORD = auto()     # (0,0) or (100.5, 200)
    ARROW = auto()     # ->
    NUMBER = auto()    # 200, 3.5
    STRING = auto()    # "Kitchen"
    IDENT = auto()     # left, right, mm, cm
    NEWLINE = auto()
    EOF = auto()


KEYWORDS = {
    "WALL", "DOOR", "WINDOW", "UNIT", "LABEL",
    "THICK", "SWING", "HEIGHT", "SILL",
    # Lot plan commands
    "LOT", "SETBACK", "NORTH",
    "FRONT", "REAR", "SIDE", "LEFT", "RIGHT",
}

# Regex patterns for tokens
_COORD_RE = re.compile(r"\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)")
_NUMBER_RE = re.compile(r"-?\d+(?:\.\d+)?")
_STRING_RE = re.compile(r'"([^"]*)"')
_IDENT_RE = re.compile(r"[A-Za-z_]\w*")


@dataclass(frozen=True)
class Token:
    type: TokenType
    value: str
    line: int
    col: int


class TokenizeError(Exception):
    def __init__(self, message: str, line: int, col: int):
        self.line = line
        self.col = col
        super().__init__(f"Line {line}, col {col}: {message}")


def tokenize(source: str) -> list[Token]:
    """Convert script source text into a list of tokens."""
    tokens: list[Token] = []

    for line_num, line in enumerate(source.splitlines(), 1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        pos = 0
        while pos < len(stripped):
            # Skip whitespace
            if stripped[pos].isspace():
                pos += 1
                continue

            # Arrow ->
            if stripped[pos:pos + 2] == "->":
                tokens.append(Token(TokenType.ARROW, "->", line_num, pos))
                pos += 2
                continue

            # Coordinate (x, y)
            m = _COORD_RE.match(stripped, pos)
            if m:
                tokens.append(Token(TokenType.COORD, m.group(0), line_num, pos))
                pos = m.end()
                continue

            # String literal "..."
            m = _STRING_RE.match(stripped, pos)
            if m:
                tokens.append(Token(TokenType.STRING, m.group(1), line_num, pos))
                pos = m.end()
                continue

            # Identifier or keyword
            m = _IDENT_RE.match(stripped, pos)
            if m:
                word = m.group(0)
                tok_type = TokenType.KEYWORD if word.upper() in KEYWORDS else TokenType.IDENT
                tokens.append(Token(tok_type, word, line_num, pos))
                pos = m.end()
                continue

            # Number (must come after coord check)
            m = _NUMBER_RE.match(stripped, pos)
            if m:
                tokens.append(Token(TokenType.NUMBER, m.group(0), line_num, pos))
                pos = m.end()
                continue

            raise TokenizeError(f"Unexpected character '{stripped[pos]}'", line_num, pos)

        tokens.append(Token(TokenType.NEWLINE, "\\n", line_num, len(stripped)))

    tokens.append(Token(TokenType.EOF, "", 0, 0))
    return tokens
