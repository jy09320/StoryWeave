from asyncio import to_thread
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.database import Base, engine
from app.models import AIRuntimeSetting, Chapter, ChapterVersion, Character, Project, ProjectCharacter, User, WorldSetting


def _build_alembic_config() -> Config:
    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    return config


async def _ensure_alembic_version_capacity(target_engine: AsyncEngine) -> None:
    async with target_engine.begin() as conn:
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS alembic_version (
                    version_num VARCHAR(255) NOT NULL PRIMARY KEY
                )
                """
            )
        )
        await conn.execute(text("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(255)"))


async def _run_migrations(target_engine: AsyncEngine) -> None:
    await _ensure_alembic_version_capacity(target_engine)
    config = _build_alembic_config()
    await to_thread(command.upgrade, config, "head")


async def _ensure_legacy_schema_compatibility(target_engine: AsyncEngine) -> bool:
    async with target_engine.begin() as conn:
        table_names = set(await conn.run_sync(lambda sync_conn: inspect(sync_conn).get_table_names()))

        if "alembic_version" in table_names:
            return False

        if not table_names:
            return False

        await conn.run_sync(Base.metadata.create_all)

        async def ensure_column(table_name: str, column_name: str, ddl: str) -> None:
            columns = await conn.run_sync(lambda sync_conn: {item["name"] for item in inspect(sync_conn).get_columns(table_name)})
            if column_name not in columns:
                await conn.execute(text(f'ALTER TABLE "{table_name}" ADD COLUMN {ddl}'))

        if "projects" in table_names:
            await ensure_column("projects", "owner_id", 'owner_id VARCHAR(26)')
        if "characters" in table_names:
            await ensure_column("characters", "owner_id", 'owner_id VARCHAR(26)')
        if "ai_runtime_settings" in table_names:
            await ensure_column("ai_runtime_settings", "owner_id", 'owner_id VARCHAR(26)')

    config = _build_alembic_config()
    await to_thread(command.stamp, config, "head")
    return True


async def init_db(async_engine: AsyncEngine | None = None) -> None:
    target_engine = async_engine or engine

    if not await _ensure_legacy_schema_compatibility(target_engine):
        await _run_migrations(target_engine)

    # 开发环境兜底：确保全量模型都已注册，缺失的新表仍可被创建。
    async with target_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
