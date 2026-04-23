from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import ai, chapters, characters, project_settings, projects, runtime_settings
from app.core.config import settings
from app.core.error_handlers import register_exception_handlers
from app.core.init_db import init_db


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    yield


app = FastAPI(title="StoryWeave - AI 同人文写作平台", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(project_settings.router, prefix="/api/projects", tags=["project-settings"])
app.include_router(chapters.router, prefix="/api/chapters", tags=["chapters"])
app.include_router(characters.router, prefix="/api/characters", tags=["characters"])
app.include_router(ai.router, prefix="/api/ai", tags=["ai"])
app.include_router(runtime_settings.router, prefix="/api/ai", tags=["ai-runtime-settings"])


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
