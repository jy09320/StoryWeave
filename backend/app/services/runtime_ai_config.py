from sqlalchemy import select, update
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
    async def get_latest_saved_api_key(self, db: AsyncSession, owner_id: str) -> str | None:
        result = await db.execute(
            select(AIRuntimeSetting.api_key)
            .where(AIRuntimeSetting.owner_id == owner_id, AIRuntimeSetting.api_key.is_not(None))
            .order_by(AIRuntimeSetting.updated_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_active_setting(self, db: AsyncSession, owner_id: str) -> AIRuntimeSetting | None:
        result = await db.execute(
            select(AIRuntimeSetting)
            .where(AIRuntimeSetting.owner_id == owner_id, AIRuntimeSetting.is_active.is_(True))
            .order_by(AIRuntimeSetting.updated_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_config_by_id(self, db: AsyncSession, config_id: str, owner_id: str) -> AIRuntimeSetting | None:
        result = await db.execute(
            select(AIRuntimeSetting)
            .where(AIRuntimeSetting.id == config_id, AIRuntimeSetting.owner_id == owner_id)
        )
        return result.scalar_one_or_none()

    async def list_configs(self, db: AsyncSession, owner_id: str) -> list[AIRuntimeSetting]:
        result = await db.execute(
            select(AIRuntimeSetting)
            .where(AIRuntimeSetting.owner_id == owner_id)
            .order_by(AIRuntimeSetting.is_active.desc(), AIRuntimeSetting.updated_at.desc())
        )
        return list(result.scalars().all())

    async def get_effective_config(self, db: AsyncSession, owner_id: str) -> dict[str, str | None]:
        active = await self.get_active_setting(db, owner_id)
        latest_saved_api_key = await self.get_latest_saved_api_key(db, owner_id)
        if active:
            effective_api_key = active.api_key or latest_saved_api_key or settings.OPENAI_API_KEY
            return {
                "provider": active.provider,
                "model_id": active.model_id,
                "base_url": active.base_url,
                "api_key": effective_api_key,
                "api_key_masked": mask_api_key(effective_api_key),
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

    async def create_config(
        self,
        db: AsyncSession,
        *,
        owner_id: str,
        name: str,
        provider: str,
        model_id: str,
        base_url: str | None,
        api_key: str | None,
    ) -> AIRuntimeSetting:
        existing_configs = await self.list_configs(db, owner_id)
        is_first = len(existing_configs) == 0

        new_config = AIRuntimeSetting(
            owner_id=owner_id,
            name=name,
            provider=provider,
            model_id=model_id,
            base_url=base_url,
            api_key=api_key,
            is_active=is_first,
        )
        db.add(new_config)
        await db.commit()
        await db.refresh(new_config)
        return new_config

    async def update_config(
        self,
        db: AsyncSession,
        *,
        config_id: str,
        owner_id: str,
        name: str | None = None,
        provider: str | None = None,
        model_id: str | None = None,
        base_url: str | None = None,
        api_key: str | None = None,
    ) -> AIRuntimeSetting | None:
        config = await self.get_config_by_id(db, config_id, owner_id)
        if not config:
            return None

        if name is not None:
            config.name = name
        if provider is not None:
            config.provider = provider
        if model_id is not None:
            config.model_id = model_id
        if base_url is not None:
            config.base_url = base_url
        if api_key is not None:
            config.api_key = api_key

        await db.commit()
        await db.refresh(config)
        return config

    async def delete_config(self, db: AsyncSession, *, config_id: str, owner_id: str) -> bool:
        config = await self.get_config_by_id(db, config_id, owner_id)
        if not config:
            return False
        if config.is_active:
            return False

        await db.delete(config)
        await db.commit()
        return True

    async def set_active(self, db: AsyncSession, *, config_id: str, owner_id: str) -> AIRuntimeSetting | None:
        config = await self.get_config_by_id(db, config_id, owner_id)
        if not config:
            return None

        await db.execute(
            update(AIRuntimeSetting)
            .where(AIRuntimeSetting.owner_id == owner_id, AIRuntimeSetting.is_active.is_(True))
            .values(is_active=False)
        )

        config.is_active = True
        await db.commit()
        await db.refresh(config)
        return config

    async def save_active_setting(
        self,
        db: AsyncSession,
        *,
        owner_id: str,
        provider: str,
        model_id: str,
        base_url: str | None,
        api_key: str | None,
    ) -> AIRuntimeSetting:
        current = await self.get_active_setting(db, owner_id)
        latest_saved_api_key = await self.get_latest_saved_api_key(db, owner_id)
        resolved_api_key = api_key or (current.api_key if current else None) or latest_saved_api_key

        await db.execute(
            update(AIRuntimeSetting)
            .where(AIRuntimeSetting.owner_id == owner_id, AIRuntimeSetting.is_active.is_(True))
            .values(is_active=False)
        )

        if current:
            current.provider = provider
            current.model_id = model_id
            current.base_url = base_url
            current.api_key = resolved_api_key
            current.is_active = True
            await db.commit()
            await db.refresh(current)
            return current

        next_setting = AIRuntimeSetting(
            owner_id=owner_id,
            provider=provider,
            model_id=model_id,
            base_url=base_url,
            api_key=resolved_api_key,
            is_active=True,
        )
        db.add(next_setting)
        await db.commit()
        await db.refresh(next_setting)
        return next_setting


runtime_ai_config_service = RuntimeAIConfigService()
