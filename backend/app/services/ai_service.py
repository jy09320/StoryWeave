from openai import AsyncOpenAI
from anthropic import AsyncAnthropic

from app.core.config import settings


class AIService:
    def __init__(self):
        self._openai: AsyncOpenAI | None = None
        self._anthropic: AsyncAnthropic | None = None

    @property
    def openai(self) -> AsyncOpenAI:
        if not self._openai:
            self._openai = AsyncOpenAI(
                api_key=settings.OPENAI_API_KEY,
                base_url=settings.OPENAI_BASE_URL,
            )
        return self._openai

    @property
    def anthropic(self) -> AsyncAnthropic:
        if not self._anthropic:
            self._anthropic = AsyncAnthropic(
                api_key=settings.ANTHROPIC_API_KEY,
                base_url=settings.ANTHROPIC_BASE_URL,
            )
        return self._anthropic

    async def generate_stream_openai(self, text: str, instruction: str, model: str, temperature: float, max_tokens: int):
        stream = await self.openai.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": instruction},
                {"role": "user", "content": text},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield delta.content

    async def generate_stream_anthropic(self, text: str, instruction: str, model: str, temperature: float, max_tokens: int):
        async with self.anthropic.messages.stream(
            model=model,
            system=instruction,
            messages=[{"role": "user", "content": text}],
            temperature=temperature,
            max_tokens=max_tokens,
        ) as stream:
            async for text_chunk in stream.text_stream:
                yield text_chunk

    async def generate_stream(self, text: str, instruction: str, model_provider: str, model_id: str, temperature: float, max_tokens: int):
        if model_provider == "anthropic":
            async for chunk in self.generate_stream_anthropic(text, instruction, model_id, temperature, max_tokens):
                yield chunk
        else:
            async for chunk in self.generate_stream_openai(text, instruction, model_id, temperature, max_tokens):
                yield chunk


ai_service = AIService()
