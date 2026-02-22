"""Export endpoints — generate DXF files for download."""

import io
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.models.schemas import ScriptRequest, CoordsRequest
from app.core.parser.tokenizer import tokenize, TokenizeError
from app.core.parser.parser import parse
from app.core.parser.validator import validate
from app.models.plan_model import ast_to_plan
from app.core.geometry.plan import build_plan_from_coords
from app.core.exporter.dxf_writer import DXFExporter

router = APIRouter(tags=["export"])


def _build_dxf_response(built_plan, unit: str) -> StreamingResponse:
    """Shared logic: render plan to DXF and return as streaming download."""
    exporter = DXFExporter(unit=unit)
    built_plan.write_to_dxf(exporter)
    dxf_bytes = exporter.to_bytes()

    return StreamingResponse(
        io.BytesIO(dxf_bytes),
        media_type="application/dxf",
        headers={"Content-Disposition": 'attachment; filename="floorplan.dxf"'},
    )


@router.post("/export/dxf/from-script")
async def export_dxf_from_script(req: ScriptRequest):
    """Parse script and export as DXF file."""
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
    return _build_dxf_response(built, req.unit)


@router.post("/export/dxf/from-coords")
async def export_dxf_from_coords(req: CoordsRequest):
    """Generate DXF from raw coordinates."""
    data = req.model_dump()
    built = build_plan_from_coords(data)
    return _build_dxf_response(built, req.unit)
