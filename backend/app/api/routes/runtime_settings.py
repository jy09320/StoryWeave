import json
from urllib.parse import urlsplit, urlunsplit

from fastapi import APIRouter, Depends, HTTPException
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.project import (
    AIRuntimeSettingResponse,
    AIRuntimeSettingUpdate,
    AIModelOptionResponse,
    AIModelListResponse,
)
from app.services.runtime_ai_config import runtime_ai_config_service

router = APIRouter()


def build_models_url(base_url: str | None) -> str:
    if not base_url:
        raise HTTPException(status_code=400, detail="Base URL is required to load models")

    parsed = urlsplit(base_url.strip())
    path = parsed.path.rstrip("/")
    if path.endswith("/v1"):
        path = f"{path}/models"
    else:
        path = f"{path}/v1/models" if path else "/v1/models"
    return urlunsplit((parsed.scheme, parsed.netloc, path, parsed.query, parsed.fragment))


@router.get("/runtime-settings", response_model=AIRuntimeSettingResponse)
async def get_ai_runtime_settings(db: AsyncSession = Depends(get_db)):
    config = await runtime_ai_config_service.get_effective_config(db)
    return AIRuntimeSettingResponse(
        provider=str(config["provider"]),
        model_id=str(config["model_id"]),
        base_url=config["base_url"],
        api_key_masked=config["api_key_masked"],
        source=str(config["source"]),
        updated_at=config["updated_at"],
    )


@router.put("/runtime-settings", response_model=AIRuntimeSettingResponse)
async def update_ai_runtime_settings(data: AIRuntimeSettingUpdate, db: AsyncSession = Depends(get_db)):
    saved = await runtime_ai_config_service.save_active_setting(
        db,
        provider=data.provider,
        model_id=data.model_id,
        base_url=data.base_url,
        api_key=data.api_key,
    )
    return AIRuntimeSettingResponse(
        provider=saved.provider,
        model_id=saved.model_id,
        base_url=saved.base_url,
        api_key_masked="已更新" if saved.api_key else None,
        source="database",
        updated_at=saved.updated_at,
    )


@router.get("/runtime-settings/models", response_model=AIModelListResponse)
async def list_ai_runtime_models(db: AsyncSession = Depends(get_db)):
    config = await runtime_ai_config_service.get_effective_config(db)
    provider = str(config["provider"] or "openai")
    base_url = config["base_url"]
    api_key = config["api_key"]

    if provider != "openai":
        raise HTTPException(status_code=400, detail="Only OpenAI Compatible provider supports automatic model discovery now")

    if not api_key:
        raise HTTPException(status_code=400, detail="API key is required to load models")

    try:
        client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        response = await client.models.list()
        items = sorted(
            [AIModelOptionResponse(id=model.id, owned_by=getattr(model, "owned_by", None)) for model in response.data],
            key=lambda item: item.id,
        )
        return AIModelListResponse(provider=provider, source="remote", models=items)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Load remote models failed: {exc}") from exc
