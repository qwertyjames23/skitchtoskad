"""Generate endpoints — produce floor plan geometry from script or coordinates."""

from fastapi import APIRouter, HTTPException

from app.models.schemas import ScriptRequest, CoordsRequest, GenerateResponse
from app.core.parser.tokenizer import tokenize, TokenizeError
from app.core.parser.parser import parse
from app.core.parser.validator import validate
from app.models.plan_model import ast_to_plan
from app.core.geometry.plan import build_plan_from_coords

router = APIRouter(tags=["generate"])


@router.post("/generate/from-script", response_model=GenerateResponse)
async def generate_from_script(req: ScriptRequest):
    """Parse a SKAD script and generate floor plan geometry."""
    try:
        tokens = tokenize(req.script)
    except TokenizeError as e:
        raise HTTPException(422, detail=[{"message": str(e), "line": e.line}])

    result = parse(tokens)
    if not result.ok:
        raise HTTPException(422, detail=[
            {"message": e.message, "line": e.line, "col": e.col}
            for e in result.errors
        ])

    errors = validate(result.ast)
    if errors:
        raise HTTPException(422, detail=[
            {"message": e.message, "line": e.line}
            for e in errors
        ])

    built = ast_to_plan(result.ast)
    return built.to_response()


@router.post("/generate/from-coords", response_model=GenerateResponse)
async def generate_from_coords(req: CoordsRequest):
    """Generate floor plan geometry from raw coordinate data."""
    data = req.model_dump()
    built = build_plan_from_coords(data)
    return built.to_response()
