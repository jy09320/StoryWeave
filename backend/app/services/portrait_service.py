from __future__ import annotations

import logging
import os
from pathlib import Path

import httpx
from openai import AsyncOpenAI
from openai.types import Model

logger = logging.getLogger(__name__)

PORTRAITS_DIR = Path("data/portraits")

# Image models in priority order
IMAGE_MODELS = [
    {"id": "dall-e-3", "size": "1024x1024", "quality": "standard"},
    {"id": "dall-e-2", "size": "1024x1024", "quality": None},
]

STYLE_PROMPT = (
    "A character portrait illustration for a novel. "
    "Semi-realistic anime style, detailed, warm lighting, "
    "upper body shot, clean background, high quality."
)


def _build_prompt(
    name: str,
    description: str | None,
    personality: str | None,
    profile: str | None,
) -> str:
    parts = [STYLE_PROMPT, f"Character name: {name}."]

    if description:
        parts.append(f"Description: {description}.")
    if personality:
        parts.append(f"Personality: {personality}.")
    if profile:
        parts.append(f"Appearance and background: {profile}.")

    parts.append("The portrait should reflect the character's personality and background.")
    return " ".join(parts)


async def _detect_image_models(client: AsyncOpenAI) -> list[dict]:
    """Try to list available models and filter for image generation ones."""
    try:
        models_response = await client.models.list()
        available_ids = {m.id for m in models_response.data}

        detected = []
        for model in IMAGE_MODELS:
            if model["id"] in available_ids:
                detected.append(model)

        if detected:
            logger.info("Detected available image models: %s", [m["id"] for m in detected])
        return detected
    except Exception as e:
        logger.warning("Failed to list models: %s. Using fallback list.", e)
        return []


async def _try_generate(
    client: AsyncOpenAI,
    prompt: str,
    model_id: str,
    size: str,
    quality: str | None,
) -> str | None:
    """Try to generate an image with a specific model. Returns image URL or None."""
    kwargs = {
        "model": model_id,
        "prompt": prompt,
        "size": size,
        "n": 1,
    }
    if quality:
        kwargs["quality"] = quality

    try:
        response = await client.images.generate(**kwargs)
        image_url = response.data[0].url
        if image_url:
            return image_url
    except Exception as e:
        logger.warning("Image generation with %s failed: %s", model_id, e)
    return None


class PortraitService:
    async def generate(
        self,
        *,
        character_id: str,
        character_name: str,
        character_description: str | None = None,
        character_personality: str | None = None,
        character_profile: str | None = None,
        api_key: str,
        base_url: str | None = None,
        model_id: str | None = None,
    ) -> str:
        """Generate a character portrait using available image models.

        If model_id is specified, use it directly. Otherwise auto-detects
        available models and tries them in priority order.
        Returns the relative URL path to the saved image.
        """
        client = AsyncOpenAI(api_key=api_key, base_url=base_url)

        prompt = _build_prompt(
            character_name,
            character_description,
            character_personality,
            character_profile,
        )

        if model_id:
            # Use the specified model directly; find its size config or use defaults
            known = next((m for m in IMAGE_MODELS if m["id"] == model_id), None)
            models_to_try = [known] if known else [{"id": model_id, "size": "1024x1024", "quality": None}]
        else:
            # Auto-detect available image models
            models_to_try = await _detect_image_models(client)
            if not models_to_try:
                models_to_try = IMAGE_MODELS
                logger.info("Using fallback image model list: %s", [m["id"] for m in models_to_try])

        # Try each model in priority order
        image_url: str | None = None
        used_model: str | None = None

        for model in models_to_try:
            logger.info("Trying image model: %s for character %s", model["id"], character_id)
            image_url = await _try_generate(
                client,
                prompt,
                model["id"],
                model["size"],
                model["quality"],
            )
            if image_url:
                used_model = model["id"]
                break

        if not image_url:
            raise RuntimeError(
                "没有可用的图像生成模型。请确认你的 API Key 已开通图像生成权限（如 DALL-E），"
                "或在设置中配置支持图像生成的 API。"
            )

        logger.info("Generated portrait with model %s for character %s", used_model, character_id)

        # Download the image
        async with httpx.AsyncClient(timeout=60) as http:
            img_response = await http.get(image_url)
            img_response.raise_for_status()
            image_bytes = img_response.content

        # Save to disk
        PORTRAITS_DIR.mkdir(parents=True, exist_ok=True)
        file_path = PORTRAITS_DIR / f"{character_id}.png"
        file_path.write_bytes(image_bytes)

        logger.info("Portrait saved to %s", file_path)

        return f"/static/portraits/{character_id}.png"

    async def get_available_models(
        self,
        api_key: str,
        base_url: str | None = None,
    ) -> list[str]:
        """Return list of available image model IDs for the given API config."""
        client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        available = await _detect_image_models(client)
        if not available:
            return []
        return [m["id"] for m in available]


portrait_service = PortraitService()
