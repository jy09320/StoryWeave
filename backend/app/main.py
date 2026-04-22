from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import projects, chapters, ai

app = FastAPI(title="MyDaoDun - AI 同人文写作平台", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(chapters.router, prefix="/api/chapters", tags=["chapters"])
app.include_router(ai.router, prefix="/api/ai", tags=["ai"])


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
