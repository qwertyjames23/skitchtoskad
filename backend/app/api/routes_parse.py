"""Parse endpoint — validates script syntax without generating geometry."""

from fastapi import APIRouter, HTTPException

from app.models.schemas import ScriptRequest
from app.core.parser.tokenizer import tokenize, TokenizeError
from app.core.parser.parser import parse
from app.core.parser.validator import validate

router = APIRouter(tags=["parse"])


@router.post("/parse")
async def parse_script(req: ScriptRequest):
    """Parse and validate a SKAD script. Returns AST summary or errors."""
    try:
        tokens = tokenize(req.script)
    except TokenizeError as e:
        raise HTTPException(
            status_code=422,
            detail=[{"message": str(e), "line": e.line, "col": e.col}],
        )

    result = parse(tokens)
    if not result.ok:
        raise HTTPException(
            status_code=422,
            detail=[{"message": e.message, "line": e.line, "col": e.col} for e in result.errors],
        )

    validation_errors = validate(result.ast)
    if validation_errors:
        raise HTTPException(
            status_code=422,
            detail=[{"message": e.message, "line": e.line} for e in validation_errors],
        )

    ast = result.ast
    return {
        "valid": True,
        "unit": ast.unit,
        "wall_count": len(ast.walls),
        "door_count": len(ast.doors),
        "window_count": len(ast.windows),
        "label_count": len(ast.labels),
    }
