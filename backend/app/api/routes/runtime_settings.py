import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.project import (
    AIRuntimeCapabilityCheckRequest,
    AIRuntimeCapabilityCheckResponse,
    AIRuntimeCapabilityItemResponse,
    AIRuntimeSettingResponse,
    AIRuntimeSettingUpdate,
    AIModelListResponse,
    AIModelOptionResponse,
)
from app.services.ai_service import ai_service
from app.services.runtime_ai_config import mask_api_key, runtime_ai_config_service

router = APIRouter()


def _capability_available(summary: str, detail: str | None = None) -> AIRuntimeCapabilityItemResponse:
    return AIRuntimeCapabilityItemResponse(status="available", summary=summary, detail=detail)


def _capability_failed(summary: str, detail: str | None = None) -> AIRuntimeCapabilityItemResponse:
    return AIRuntimeCapabilityItemResponse(status="failed", summary=summary, detail=detail)


def _capability_unsupported(summary: str, detail: str | None = None) -> AIRuntimeCapabilityItemResponse:
    return AIRuntimeCapabilityItemResponse(status="unsupported", summary=summary, detail=detail)


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


@router.post("/runtime-settings/capabilities/check", response_model=AIRuntimeCapabilityCheckResponse)
async def check_ai_runtime_capabilities(
    payload: AIRuntimeCapabilityCheckRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    checked_at = datetime.now(timezone.utc)

    try:
        text_probe = await ai_service.generate_runtime_probe_text(
            db,
            owner_id=current_user.id,
            requested_provider=payload.provider,
            requested_model_id=payload.model_id,
            instruction="你是运行时能力探测器。请只返回 OK。",
            text="请返回 OK",
            max_tokens=32,
        )
        text_generation = _capability_available("可用", "基础文本生成请求已成功返回。")
    except Exception as exc:
        detail = str(exc)
        fallback_provider = payload.provider or "openai"
        fallback_model_id = payload.model_id or "gpt-4o"
        return AIRuntimeCapabilityCheckResponse(
            provider=fallback_provider,
            model_id=fallback_model_id,
            checked_at=checked_at,
            text_generation=_capability_failed("失败", detail),
            structured_output=_capability_failed("不可用", "基础文本生成未通过，无法继续验证结构化输出。"),
            tool_calling=_capability_unsupported("不推荐", "当前应用已对三个助手避开 tool calling 依赖，运行时保持保守标记。"),
        )

    provider = str(text_probe["provider"])
    model_id = str(text_probe["model_id"])

    try:
        structured_probe = await ai_service.generate_runtime_probe_text(
            db,
            owner_id=current_user.id,
            requested_provider=provider,
            requested_model_id=model_id,
            instruction=(
                "你是结构化输出探测器。"
                "只返回单行 JSON，对象必须包含 ok、provider、mode 三个字段。"
                "不要输出 Markdown，不要输出解释。"
            ),
            text='返回 JSON：{"ok":true,"provider":"runtime","mode":"structured"}',
            max_tokens=120,
        )
        parsed = json.loads(str(structured_probe["content"]).strip())
        if not isinstance(parsed, dict) or "ok" not in parsed:
            raise ValueError("结构化探测返回了非预期 JSON 结构")
        structured_output = _capability_available("可用", "模型可以稳定返回可解析 JSON，适合当前结构化助手链路。")
    except Exception as exc:
        structured_output = _capability_failed("不稳定", str(exc))

    return AIRuntimeCapabilityCheckResponse(
        provider=provider,
        model_id=model_id,
        checked_at=checked_at,
        text_generation=text_generation,
        structured_output=structured_output,
        tool_calling=_capability_unsupported(
            "不推荐",
            "兼容网关对 tool calling 的字段和流式行为差异较大，当前版本不把它作为三类助手的可用性前提。",
        ),
    )
