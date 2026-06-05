from __future__ import annotations

import asyncio
import logging
import os
import random
import time
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

PORTRAITS_DIR = Path("data/portraits")

DASHSCOPE_API_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation"
DASHSCOPE_TASK_URL = "https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}"

IMAGE_MODELS = [
    {"id": "wan2.7-image-pro", "label": "万相2.7 专业版"},
    {"id": "wan2.7-image", "label": "万相2.7 标准版"},
]

STYLE_PROMPT = (
    "日系动漫风格角色立绘，精致赛璐璐上色，清晰线条，柔和光影，上半身构图，纯净背景，高画质。"
)


def _build_prompt(
    name: str,
    description: str | None,
    personality: str | None,
    profile: str | None,
    source_work: str | None = None,
) -> str:
    parts = [STYLE_PROMPT]

    if source_work:
        parts.append(
            f"该角色出自《{source_work}》。"
            f"请严格参考该作品中 {name} 的官方形象、发色、瞳色、服装等特征进行绘制。"
        )

    parts.append(f"角色姓名：{name}。")

    if description:
        parts.append(f"外貌描述：{description}。")
    if personality:
        parts.append(f"性格特点：{personality}。")
    if profile:
        parts.append(f"人物背景与外貌：{profile}。")

    parts.append("肖像应充分体现该角色的性格与背景。")
    return " ".join(parts)


async def _submit_task(
    http: httpx.AsyncClient,
    api_key: str,
    model_id: str,
    prompt: str,
) -> str | None:
    """Submit async image generation task, return task_id or None on failure."""
    payload = {
        "model": model_id,
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": [{"text": prompt}],
                }
            ]
        },
        "parameters": {
            "size": "1K",
            "n": 1,
            "watermark": False,
            "seed": random.randint(1, 2**31 - 1),
        },
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "X-DashScope-Async": "enable",
    }
    try:
        resp = await http.post(DASHSCOPE_API_URL, json=payload, headers=headers)
        data = resp.json()
        if resp.status_code == 200:
            return data["output"]["task_id"]
        logger.warning("Submit task failed for %s: %s", model_id, data)
    except Exception as e:
        logger.warning("Submit task error for %s: %s", model_id, e)
    return None


async def _poll_task(
    http: httpx.AsyncClient,
    api_key: str,
    task_id: str,
    max_wait: int = 180,
    interval: int = 3,
) -> str | None:
    """Poll task until SUCCEEDED or timeout. Returns image URL or None."""
    url = DASHSCOPE_TASK_URL.format(task_id=task_id)
    headers = {"Authorization": f"Bearer {api_key}"}
    elapsed = 0
    while elapsed < max_wait:
        await asyncio.sleep(interval)
        elapsed += interval
        try:
            resp = await http.get(url, headers=headers)
            data = resp.json()
            status = data.get("output", {}).get("task_status")
            if status == "SUCCEEDED":
                choices = data["output"].get("choices", [])
                for choice in choices:
                    for content in choice.get("message", {}).get("content", []):
                        if content.get("type") == "image":
                            return content["image"]
            elif status in ("FAILED", "CANCELED"):
                logger.warning("Task %s ended with status %s", task_id, status)
                return None
        except Exception as e:
            logger.warning("Poll task %s error: %s", task_id, e)
    logger.warning("Task %s timed out after %ds", task_id, max_wait)
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
        source_work: str | None = None,
        api_key: str,
        base_url: str | None = None,
        model_id: str | None = None,
    ) -> str:
        """Generate a character portrait using Wan2.7 image generation.

        Returns the relative URL path to the saved image.
        """
        prompt = _build_prompt(
            character_name,
            character_description,
            character_personality,
            character_profile,
            source_work=source_work,
        )

        models_to_try = [model_id] if model_id else [m["id"] for m in IMAGE_MODELS]

        async with httpx.AsyncClient(timeout=30) as http:
            image_url: str | None = None
            used_model: str | None = None

            for mid in models_to_try:
                logger.info("Submitting portrait task with model %s for character %s", mid, character_id)
                task_id = await _submit_task(http, api_key, mid, prompt)
                if not task_id:
                    continue

                logger.info("Polling task %s for character %s", task_id, character_id)
                image_url = await _poll_task(http, api_key, task_id)
                if image_url:
                    used_model = mid
                    break

        if not image_url:
            raise RuntimeError(
                "没有可用的图像生成模型。请确认你的 API Key 已开通万象图像生成权限，"
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
        """Return list of available image model IDs."""
        return [m["id"] for m in IMAGE_MODELS]


portrait_service = PortraitService()
