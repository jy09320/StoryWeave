from fastapi import APIRouter, Depends, HTTPException
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.project import (
    AIRuntimeSettingResponse,
    AIRuntimeSettingUpdate,
    AIModelListResponse,
    AIModelOptionResponse,
)
from app.services.runtime_ai_config import mask_api_key, runtime_ai_config_service

router = APIRouter()


@router.get("/runtime-settings", response_model=AIRuntimeSettingResponse)
async def get_ai_runtime_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = await runtime_ai_config_service.get_effective_config(db, current_user.id)
    return AIRuntimeSettingResponse(
        provider=str(config["provider"]),
        model_id=str(config["model_id"]),
        base_url=config["base_url"],
        api_key_masked=config["api_key_masked"],
        source=str(config["source"]),
        updated_at=config["updated_at"],
    )


@router.put("/runtime-settings", response_model=AIRuntimeSettingResponse)
async def update_ai_runtime_settings(
    data: AIRuntimeSettingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    saved = await runtime_ai_config_service.save_active_setting(
        db,
        owner_id=current_user.id,
        provider=data.provider,
        model_id=data.model_id,
        base_url=data.base_url,
        api_key=data.api_key,
    )
    return AIRuntimeSettingResponse(
        provider=saved.provider,
        model_id=saved.model_id,
        base_url=saved.base_url,
        api_key_masked=mask_api_key(saved.api_key),
        source="database",
        updated_at=saved.updated_at,
    )


@router.get("/runtime-settings/models", response_model=AIModelListResponse)
async def list_ai_runtime_models(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = await runtime_ai_config_service.get_effective_config(db, current_user.id)
    provider = str(config["provider"] or "openai")
    base_url = config["base_url"]
    api_key = config["api_key"]

    if provider != "openai":
        raise HTTPException(status_code=400, detail="Only OpenAI-compatible provider supports automatic model discovery")

    if not api_key:
        raise HTTPException(status_code=400, detail="API key is required to load models")

    try:
        client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        response = await client.models.list()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Load remote models failed: {exc}") from exc

    items = sorted(
        [AIModelOptionResponse(id=model.id, owned_by=getattr(model, "owned_by", None)) for model in response.data],
        key=lambda item: item.id,
    )
    return AIModelListResponse(provider=provider, source="remote", models=items)
