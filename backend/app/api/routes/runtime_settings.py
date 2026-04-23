from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.project import AIRuntimeSettingResponse, AIRuntimeSettingUpdate
from app.services.runtime_ai_config import runtime_ai_config_service

router = APIRouter()


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
