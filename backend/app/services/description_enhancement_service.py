from __future__ import annotations

import logging

from app.services.ai_service import ai_service


logger = logging.getLogger(__name__)

PROJECT_TYPE_DISPLAY = {
    "fanfiction": "同人",
    "acg": "ACG 二创",
    "tv_movie": "影视衍生",
}

ENHANCE_PROMPT_TEMPLATE = """你是一个专业的角色外貌描述助手。

项目类型：{project_type_display}
原作名称：《{source_work}》
角色姓名：{character_name}

当前外貌描述：
{current_description}

请根据《{source_work}》中 {character_name} 的官方形象，生成详细的外貌描述。
要求：
1. 包含发色、发型、瞳色、服装等关键特征
2. 描述应具体、准确，符合原作设定
3. 如果有当前描述，在其基础上补充原作特征
4. 使用中文，语言简洁生动

请直接输出外貌描述，不要添加额外说明。"""


class DescriptionEnhancementService:
    async def enhance(
        self,
        *,
        character_name: str,
        current_description: str | None,
        source_work: str,
        project_type: str,
        api_key: str,
        base_url: str | None = None,
    ) -> str:
        """用 LLM 增强角色外貌描述。"""
        project_type_display = PROJECT_TYPE_DISPLAY.get(project_type, project_type)
        current_desc = current_description or "（暂无）"

        prompt = ENHANCE_PROMPT_TEMPLATE.format(
            project_type_display=project_type_display,
            source_work=source_work,
            character_name=character_name,
            current_description=current_desc,
        )

        result = await ai_service._generate_openai_non_stream_text(
            api_key=api_key,
            base_url=base_url,
            text="",
            instruction=prompt,
            model="gpt-4o-mini",
            temperature=0.7,
            max_tokens=500,
        )

        if not result or not result.strip():
            raise RuntimeError("AI 未能生成有效的外貌描述")

        # 截断到合理长度
        max_length = 500
        if len(result) > max_length:
            result = result[:max_length].rstrip() + "..."

        return result.strip()


description_enhancement_service = DescriptionEnhancementService()
