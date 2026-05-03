"""Schemas for project asset AI endpoints (file upload, analyze, apply)."""
from pydantic import BaseModel, Field, field_validator


class ProjectAssetFileUploadResponse(BaseModel):
    file_id: str
    filename: str
    extracted_text: str
    preview: str
    token_estimate: int


# ---------------------------------------------------------------------------
# World setting
# ---------------------------------------------------------------------------

class WorldSettingPatch(BaseModel):
    title: str | None = None
    overview: str | None = None
    rules: str | None = None
    factions: str | None = None
    locations: str | None = None
    timeline: str | None = None
    extra_notes: str | None = None


class WorldSettingAnalyzeRequest(BaseModel):
    message: str = Field(default="", max_length=4000)
    source_text: str | None = None
    command: str | None = None
    guidance: str | None = None
    file_ids: list[str] = Field(default_factory=list)


class WorldSettingAnalyzeResponse(BaseModel):
    patch: WorldSettingPatch
    notes: list[str] = Field(default_factory=list)
    applied_sources: list[str] = Field(default_factory=list)
    tool_trace: list[str] = Field(default_factory=list)


class WorldSettingApplyRequest(BaseModel):
    patch: WorldSettingPatch


# ---------------------------------------------------------------------------
# Characters
# ---------------------------------------------------------------------------

class CharacterActionItem(BaseModel):
    action: str  # "create_and_attach" | "update_project_character"
    name: str
    alias: str | None = None
    description: str | None = None
    profile: str | None = None
    personality: str | None = None
    background: str | None = None
    relationship_notes: str | None = None
    tags: str | None = None
    role_label: str | None = None
    summary: str | None = None

    @field_validator("tags", mode="before")
    @classmethod
    def coerce_tags(cls, v):
        if isinstance(v, list):
            return ", ".join(str(i) for i in v) if v else None
        return v


class CharacterAnalyzeRequest(BaseModel):
    message: str = Field(default="", max_length=4000)
    source_text: str | None = None
    command: str | None = None
    guidance: str | None = None
    file_ids: list[str] = Field(default_factory=list)


class CharacterAnalyzeResponse(BaseModel):
    actions: list[CharacterActionItem] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    tool_trace: list[str] = Field(default_factory=list)


class CharacterApplyRequest(BaseModel):
    actions: list[CharacterActionItem]


class CharacterApplyResponse(BaseModel):
    applied: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
