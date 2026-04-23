from datetime import datetime

from pydantic import BaseModel, Field, field_validator

PROJECT_TYPE_VALUES = {"original", "fanfiction", "acg", "tv_movie"}
PROJECT_STATUS_VALUES = {"draft", "active", "paused", "completed"}
CHAPTER_STATUS_VALUES = {"draft", "writing", "review", "done"}
AI_PROVIDER_VALUES = {"openai", "anthropic"}


def normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None

    stripped = value.strip()
    return stripped or None


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    type: str = Field(default="original")
    source_work: str | None = Field(default=None, max_length=200)
    default_model_provider: str | None = Field(default=None, max_length=50)
    default_model_id: str | None = Field(default=None, max_length=100)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Project title cannot be empty")
        return stripped

    @field_validator("description", "source_work", "default_model_provider", "default_model_id", mode="before")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)

    @field_validator("type")
    @classmethod
    def validate_type(cls, value: str) -> str:
        if value not in PROJECT_TYPE_VALUES:
            raise ValueError("Invalid project type")
        return value


class ProjectUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    type: str | None = None
    source_work: str | None = Field(default=None, max_length=200)
    status: str | None = None
    default_model_provider: str | None = Field(default=None, max_length=50)
    default_model_id: str | None = Field(default=None, max_length=100)

    @field_validator("title")
    @classmethod
    def validate_optional_title(cls, value: str | None) -> str | None:
        if value is None:
            return None

        stripped = value.strip()
        if not stripped:
            raise ValueError("Project title cannot be empty")
        return stripped

    @field_validator("description", "source_work", "default_model_provider", "default_model_id", mode="before")
    @classmethod
    def normalize_optional_update_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)

    @field_validator("type")
    @classmethod
    def validate_optional_type(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if value not in PROJECT_TYPE_VALUES:
            raise ValueError("Invalid project type")
        return value

    @field_validator("status")
    @classmethod
    def validate_project_status(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if value not in PROJECT_STATUS_VALUES:
            raise ValueError("Invalid project status")
        return value


class ChapterCreate(BaseModel):
    project_id: str = Field(min_length=26, max_length=26)
    title: str = Field(min_length=1, max_length=200)
    order_index: int = Field(default=0, ge=0)
    content: str | None = None
    plain_text: str | None = None
    notes: str | None = Field(default=None, max_length=4000)

    @field_validator("title")
    @classmethod
    def validate_chapter_title(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Chapter title cannot be empty")
        return stripped

    @field_validator("content", "plain_text", "notes", mode="before")
    @classmethod
    def normalize_chapter_optional_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)


class ChapterUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    order_index: int | None = Field(default=None, ge=0)
    content: str | None = None
    plain_text: str | None = None
    summary: str | None = Field(default=None, max_length=4000)
    word_count: int | None = Field(default=None, ge=0)
    status: str | None = None
    notes: str | None = Field(default=None, max_length=4000)

    @field_validator("title")
    @classmethod
    def validate_optional_chapter_title(cls, value: str | None) -> str | None:
        if value is None:
            return None

        stripped = value.strip()
        if not stripped:
            raise ValueError("Chapter title cannot be empty")
        return stripped

    @field_validator("content", "plain_text", "summary", "notes", mode="before")
    @classmethod
    def normalize_chapter_update_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)

    @field_validator("status")
    @classmethod
    def validate_chapter_status(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if value not in CHAPTER_STATUS_VALUES:
            raise ValueError("Invalid chapter status")
        return value


class ChapterReorderItem(BaseModel):
    id: str = Field(min_length=26, max_length=26)
    order_index: int = Field(ge=1)


class CharacterCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    alias: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    profile: str | None = Field(default=None, max_length=4000)
    personality: str | None = Field(default=None, max_length=4000)
    background: str | None = Field(default=None, max_length=4000)
    relationship_notes: str | None = Field(default=None, max_length=4000)
    tags: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def validate_character_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Character name cannot be empty")
        return stripped

    @field_validator(
        "alias",
        "description",
        "profile",
        "personality",
        "background",
        "relationship_notes",
        "tags",
        mode="before",
    )
    @classmethod
    def normalize_character_optional_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)


class CharacterUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    alias: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    profile: str | None = Field(default=None, max_length=4000)
    personality: str | None = Field(default=None, max_length=4000)
    background: str | None = Field(default=None, max_length=4000)
    relationship_notes: str | None = Field(default=None, max_length=4000)
    tags: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def validate_optional_character_name(cls, value: str | None) -> str | None:
        if value is None:
            return None

        stripped = value.strip()
        if not stripped:
            raise ValueError("Character name cannot be empty")
        return stripped

    @field_validator(
        "alias",
        "description",
        "profile",
        "personality",
        "background",
        "relationship_notes",
        "tags",
        mode="before",
    )
    @classmethod
    def normalize_character_update_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)


class ProjectCharacterCreate(BaseModel):
    character_id: str = Field(min_length=26, max_length=26)
    role_label: str | None = Field(default=None, max_length=100)
    summary: str | None = Field(default=None, max_length=2000)
    sort_order: int = Field(default=0, ge=0)

    @field_validator("role_label", "summary", mode="before")
    @classmethod
    def normalize_project_character_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)


class ProjectCharacterUpdate(BaseModel):
    role_label: str | None = Field(default=None, max_length=100)
    summary: str | None = Field(default=None, max_length=2000)
    sort_order: int | None = Field(default=None, ge=0)

    @field_validator("role_label", "summary", mode="before")
    @classmethod
    def normalize_project_character_update_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)


class WorldSettingUpsert(BaseModel):
    title: str = Field(default="世界观设定", min_length=1, max_length=200)
    overview: str | None = Field(default=None, max_length=8000)
    rules: str | None = Field(default=None, max_length=8000)
    factions: str | None = Field(default=None, max_length=8000)
    locations: str | None = Field(default=None, max_length=8000)
    timeline: str | None = Field(default=None, max_length=8000)
    extra_notes: str | None = Field(default=None, max_length=8000)

    @field_validator("title")
    @classmethod
    def validate_world_setting_title(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("World setting title cannot be empty")
        return stripped

    @field_validator("overview", "rules", "factions", "locations", "timeline", "extra_notes", mode="before")
    @classmethod
    def normalize_world_setting_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)


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


class ChapterVersionResponse(BaseModel):
    id: str
    chapter_id: str
    content: str
    plain_text: str | None
    word_count: int | None
    change_note: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CharacterResponse(BaseModel):
    id: str
    name: str
    alias: str | None
    description: str | None
    profile: str | None
    personality: str | None
    background: str | None
    relationship_notes: str | None
    tags: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectCharacterResponse(BaseModel):
    id: str
    project_id: str
    character_id: str
    role_label: str | None
    summary: str | None
    sort_order: int
    created_at: datetime
    updated_at: datetime
    character: CharacterResponse

    model_config = {"from_attributes": True}


class WorldSettingResponse(BaseModel):
    id: str
    project_id: str
    title: str
    overview: str | None
    rules: str | None
    factions: str | None
    locations: str | None
    timeline: str | None
    extra_notes: str | None
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
    project_characters: list[ProjectCharacterResponse] = []
    world_setting: WorldSettingResponse | None = None


class AIRuntimeSettingUpdate(BaseModel):
    provider: str = Field(default="openai", max_length=50)
    model_id: str = Field(min_length=1, max_length=100)
    base_url: str | None = Field(default=None, max_length=500)
    api_key: str | None = None

    @field_validator("provider")
    @classmethod
    def validate_provider(cls, value: str) -> str:
        stripped = value.strip()
        if stripped not in AI_PROVIDER_VALUES:
            raise ValueError("Invalid AI provider")
        return stripped

    @field_validator("model_id")
    @classmethod
    def validate_model_id(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Model id cannot be empty")
        return stripped

    @field_validator("base_url", "api_key", mode="before")
    @classmethod
    def normalize_runtime_setting_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)


class AIRuntimeSettingResponse(BaseModel):
    provider: str
    model_id: str
    base_url: str | None
    api_key_masked: str | None
    source: str
    updated_at: datetime | None = None


class AIModelOptionResponse(BaseModel):
    id: str
    owned_by: str | None = None


class AIModelListResponse(BaseModel):
    provider: str
    source: str
    models: list[AIModelOptionResponse]


class AIGenerateRequest(BaseModel):
    project_id: str
    chapter_id: str | None = None
    text: str
    instruction: str = "请续写以下内容，保持风格一致"
    model_provider: str = "openai"
    model_id: str = "gpt-4o"
    temperature: float = 0.8
    max_tokens: int = 2000
