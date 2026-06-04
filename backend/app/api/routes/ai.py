import asyncio
import json
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.project import (
    AIGenerateRequest,
    AIContextPreviewResponse,
    AIContinuationDebugResponse,
    AIContinuationGenerateResponse,
    AIRetrievalPreviewResponse,
    StoryQARequest,
    StoryQAResponse,
)
from app.services.ai_service import ai_service
from app.services.continuation_pipeline_service import continuation_pipeline_service
from app.services.context_retrieval_service import context_retrieval_service

router = APIRouter()


@router.post("/generate")
async def generate_text(
    req: AIGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
                owner_id=current_user.id,
            ):
                yield {"event": "message", "data": json.dumps({"content": chunk})}
            yield {"event": "done", "data": json.dumps({"status": "complete"})}
        except Exception as e:
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(event_generator())


@router.post("/generate-once")
async def generate_text_once(
    req: AIGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content = await ai_service.generate_text(
        db,
        project_id=req.project_id,
        chapter_id=req.chapter_id,
        text=req.text,
        instruction=req.instruction,
        model_provider=req.model_provider,
        model_id=req.model_id,
        temperature=req.temperature,
        max_tokens=req.max_tokens,
        owner_id=current_user.id,
    )
    return {"content": content}


@router.post("/context-preview", response_model=AIContextPreviewResponse)
async def generate_context_preview(
    req: AIGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    preview = await ai_service.build_generation_context_preview(
        db,
        project_id=req.project_id,
        chapter_id=req.chapter_id,
        text=req.text,
        instruction=req.instruction,
        owner_id=current_user.id,
    )
    return AIContextPreviewResponse(**preview)


@router.post("/retrieval-preview", response_model=AIRetrievalPreviewResponse)
async def generate_retrieval_preview(
    req: AIGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    loaded = await ai_service.load_generation_context(
        db,
        project_id=req.project_id,
        chapter_id=req.chapter_id,
        owner_id=current_user.id,
    )
    if not loaded:
        return AIRetrievalPreviewResponse(query_terms=[], chunks=[], metadata={"project_found": False})

    retrieval = await context_retrieval_service.retrieve_for_generation(
        db,
        project_id=req.project_id,
        chapter=loaded["chapter"],
        text=req.text,
        instruction=req.instruction,
        recent_memories=loaded["recent_memories"],
        story_memory=loaded["story_memory"],
        limit=8,
    )
    retrieval["metadata"] = {
        **retrieval.get("metadata", {}),
        "project_found": True,
        "chapter_found": loaded["chapter"] is not None,
    }
    return AIRetrievalPreviewResponse(**retrieval)


@router.post("/continuation/generate", response_model=AIContinuationGenerateResponse)
async def generate_with_continuation_pipeline(
    req: AIGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await continuation_pipeline_service.run(
        db,
        project_id=req.project_id,
        chapter_id=req.chapter_id,
        user_text=req.text,
        user_instruction=req.instruction,
        model_provider=req.model_provider,
        model_id=req.model_id,
        temperature=req.temperature,
        max_tokens=req.max_tokens,
        owner_id=current_user.id,
        debug=False,
    )
    return AIContinuationGenerateResponse(
        final_content=result["final_content"],
        continuity_report=result["continuity_report"],
        warnings=result["warnings"],
        fallbacks=result["fallbacks"],
        trace=result["trace"],
        metadata=result["metadata"],
    )


@router.post("/continuation/stream")
async def stream_continuation_pipeline(
    req: AIGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    queue: asyncio.Queue[dict[str, str] | None] = asyncio.Queue()

    async def push_progress(payload: dict):
        await queue.put({"event": "progress", "data": json.dumps(payload)})

    async def run_pipeline():
        try:
            result = await continuation_pipeline_service.run(
                db,
                project_id=req.project_id,
                chapter_id=req.chapter_id,
                user_text=req.text,
                user_instruction=req.instruction,
                model_provider=req.model_provider,
                model_id=req.model_id,
                temperature=req.temperature,
                max_tokens=req.max_tokens,
                owner_id=current_user.id,
                debug=False,
                progress_callback=push_progress,
            )
            response_payload = AIContinuationGenerateResponse(
                final_content=result["final_content"],
                continuity_report=result["continuity_report"],
                warnings=result["warnings"],
                fallbacks=result["fallbacks"],
                trace=result["trace"],
                metadata=result["metadata"],
            )
            await queue.put({"event": "complete", "data": response_payload.model_dump_json()})
        except Exception as exc:
            await queue.put({"event": "error", "data": json.dumps({"error": str(exc)})})
        finally:
            await queue.put(None)

    async def event_generator():
        task = asyncio.create_task(run_pipeline())
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                yield item
        finally:
            if not task.done():
                task.cancel()

    return EventSourceResponse(event_generator())


@router.post("/continuation/debug", response_model=AIContinuationDebugResponse)
async def debug_continuation_pipeline(
    req: AIGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await continuation_pipeline_service.run(
        db,
        project_id=req.project_id,
        chapter_id=req.chapter_id,
        user_text=req.text,
        user_instruction=req.instruction,
        model_provider=req.model_provider,
        model_id=req.model_id,
        temperature=req.temperature,
        max_tokens=req.max_tokens,
        owner_id=current_user.id,
        debug=True,
    )
    return AIContinuationDebugResponse(**result)


@router.post("/story-qa", response_model=StoryQAResponse)
async def story_qa(
    req: StoryQARequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await ai_service.story_qa(
        db,
        project_id=req.project_id,
        question=req.question,
        model_provider=req.model_provider,
        model_id=req.model_id,
        owner_id=current_user.id,
    )
    return StoryQAResponse(**result)
