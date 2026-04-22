import json
from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from app.schemas.project import AIGenerateRequest
from app.services.ai_service import ai_service

router = APIRouter()


@router.post("/generate")
async def generate_text(req: AIGenerateRequest):
    async def event_generator():
        try:
            async for chunk in ai_service.generate_stream(
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
