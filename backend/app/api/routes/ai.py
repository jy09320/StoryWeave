import json
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.core.database import get_db
from app.schemas.project import AIGenerateRequest
from app.services.ai_service import ai_service

router = APIRouter()


@router.post("/generate")
async def generate_text(req: AIGenerateRequest, db: AsyncSession = Depends(get_db)):
    async def event_generator():
        try:
            async for chunk in ai_service.generate_stream(
                db,
                project_id=req.project_id,
                chapter_id=req.chapter_id,
                text=req.text,
                instruction=req.instruction,
                model_provider=req.model_provider,
                model_id=req.model_id,
                temperature=req.temperature,
                max_tokens=req.max_tokens,
            ):
                yield {"event": "message", "data": json.dumps({"content": chunk})}
            yield {"event": "done", "data": json.dumps({"status": "complete"})}
        except Exception as e:
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(event_generator())
