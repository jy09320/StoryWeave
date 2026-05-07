from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict


def serialize_datetime_utc(value: datetime) -> str:
    normalized = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return normalized.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class ORMResponseModel(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_encoders={datetime: serialize_datetime_utc},
    )
