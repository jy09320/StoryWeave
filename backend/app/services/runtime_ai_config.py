from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.project import AIRuntimeSetting


def mask_api_key(api_key: str | None) -> str | None:
    if not api_key:
        return None
    if len(api_key) <= 8:
        return "*" * len(api_key)
    return f"{api_key[:4]}***{api_key[-4:]}"


class RuntimeAIConfigService:
    async def get_active_setting(self, db: AsyncSession) -> AIRuntimeSetting | None:
        result = await db.execute(
            select(AIRuntimeSetting)
            .where(AIRuntimeSetting.is_active.is_(True))
            .order_by(AIRuntimeSetting.updated_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_effective_config(self, db: AsyncSession) -> dict[str, str | None]:
        active = await self.get_active_setting(db)
        if active:
            return {
                "provider": active.provider,
                "model_id": active.model_id,
                "base_url": active.base_url,
                "api_key": active.api_key,
                "api_key_masked": mask_api_key(active.api_key),
                "source": "database",
                "updated_at": active.updated_at,
            }

        return {
            "provider": "openai",
            "model_id": "gpt-4o",
            "base_url": settings.OPENAI_BASE_URL,
            "api_key": settings.OPENAI_API_KEY,
            "api_key_masked": mask_api_key(settings.OPENAI_API_KEY),
            "source": "environment",
            "updated_at": None,
        }

    async def save_active_setting(
        self,
        db: AsyncSession,
        *,
        provider: str,
        model_id: str,
        base_url: str | None,
        api_key: str | None,
    ) -> AIRuntimeSetting:
        current = await self.get_active_setting(db)
        if current:
            current.is_active = False

        next_setting = AIRuntimeSetting(
            provider=provider,
            model_id=model_id,
            base_url=base_url,
            api_key=api_key,
            is_active=True,
        )
        db.add(next_setting)
        await db.commit()
        await db.refresh(next_setting)
        return next_setting


runtime_ai_config_service = RuntimeAIConfigService()
