"""Schemas for conversational AI chat endpoint."""
from typing import Literal
from pydantic import BaseModel, Field


class AssetChatRequest(BaseModel):
    message: str = Field(max_length=8000)
    asset_type: Literal["world_setting", "project_character"]
    session_id: str = Field(max_length=200)
    file_ids: list[str] = Field(default_factory=list)
