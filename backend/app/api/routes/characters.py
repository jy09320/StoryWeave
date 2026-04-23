from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.project import Character
from app.schemas.project import CharacterCreate, CharacterResponse, CharacterUpdate

router = APIRouter()


@router.get("/", response_model=list[CharacterResponse])
async def list_characters(
    keyword: str | None = Query(default=None, max_length=100),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Character).order_by(Character.updated_at.desc(), Character.created_at.desc())

    if keyword:
        search = f"%{keyword.strip()}%"
        if search != "%%":
            stmt = stmt.where(
                or_(
                    Character.name.ilike(search),
                    Character.alias.ilike(search),
                    Character.tags.ilike(search),
                )
            )

    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/", response_model=CharacterResponse)
async def create_character(data: CharacterCreate, db: AsyncSession = Depends(get_db)):
    character = Character(**data.model_dump())
    db.add(character)
    await db.commit()
    await db.refresh(character)
    return character


@router.get("/{character_id}", response_model=CharacterResponse)
async def get_character(character_id: str, db: AsyncSession = Depends(get_db)):
    character = await db.get(Character, character_id)
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    return character


@router.put("/{character_id}", response_model=CharacterResponse)
async def update_character(character_id: str, data: CharacterUpdate, db: AsyncSession = Depends(get_db)):
    character = await db.get(Character, character_id)
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(character, key, value)

    await db.commit()
    await db.refresh(character)
    return character


@router.delete("/{character_id}")
async def delete_character(character_id: str, db: AsyncSession = Depends(get_db)):
    character = await db.get(Character, character_id)
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    await db.delete(character)
    await db.commit()
    return {"detail": "Deleted"}
