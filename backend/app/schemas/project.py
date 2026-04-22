from datetime import datetime

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    title: str
    description: str | None = None
    type: str = "original"
    source_work: str | None = None
    default_model_provider: str | None = None
    default_model_id: str | None = None


class ProjectUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    type: str | None = None
    source_work: str | None = None
    status: str | None = None
    default_model_provider: str | None = None
    default_model_id: str | None = None


class ChapterCreate(BaseModel):
    project_id: str
    title: str
    order_index: int = 0
    content: str | None = None
    plain_text: str | None = None
    notes: str | None = None


class ChapterUpdate(BaseModel):
    title: str | None = None
    order_index: int | None = None
    content: str | None = None
    plain_text: str | None = None
    summary: str | None = None
    word_count: int | None = None
    status: str | None = None
    notes: str | None = None


class ChapterReorderItem(BaseModel):
    id: str
    order_index: int = Field(ge=0)


class ChapterResponse(BaseModel):
    id: str
    project_id: str
    title: str
    order_index: int
    content: str | None
    plain_text: str | None
    summary: str | None
    word_count: int
    status: str
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectResponse(BaseModel):
    id: str
    title: str
    description: str | None
    type: str
    source_work: str | None
    status: str
    default_model_provider: str | None
    default_model_id: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectDetailResponse(ProjectResponse):
    chapters: list[ChapterResponse]


class AIGenerateRequest(BaseModel):
    project_id: str
    chapter_id: str | None = None
    text: str
    instruction: str = "请续写以下内容，保持风格一致"
    model_provider: str = "openai"
    model_id: str = "gpt-4o"
    temperature: float = 0.8
    max_tokens: int = 2000
