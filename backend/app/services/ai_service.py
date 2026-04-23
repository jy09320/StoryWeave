from openai import AsyncOpenAI
from anthropic import AsyncAnthropic
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.runtime_ai_config import runtime_ai_config_service


class AIService:
    def __init__(self):
        self._openai_clients: dict[tuple[str | None, str | None], AsyncOpenAI] = {}
        self._anthropic_clients: dict[tuple[str | None, str | None], AsyncAnthropic] = {}

    def get_openai_client(self, api_key: str | None, base_url: str | None) -> AsyncOpenAI:
        cache_key = (api_key, base_url)
        client = self._openai_clients.get(cache_key)
        if client is None:
            client = AsyncOpenAI(api_key=api_key, base_url=base_url)
            self._openai_clients[cache_key] = client
        return client

    def get_anthropic_client(self, api_key: str | None, base_url: str | None) -> AsyncAnthropic:
        cache_key = (api_key, base_url)
        client = self._anthropic_clients.get(cache_key)
        if client is None:
            client = AsyncAnthropic(api_key=api_key, base_url=base_url)
            self._anthropic_clients[cache_key] = client
        return client

    async def resolve_runtime_config(self, db: AsyncSession, requested_provider: str, requested_model_id: str) -> dict[str, str | None]:
        config = await runtime_ai_config_service.get_effective_config(db)
        provider = requested_provider or str(config["provider"] or "openai")
        model_id = requested_model_id or str(config["model_id"] or "gpt-4o")

        if provider == "anthropic":
            return {
                "provider": provider,
                "model_id": model_id,
                "api_key": settings.ANTHROPIC_API_KEY,
                "base_url": settings.ANTHROPIC_BASE_URL,
            }

        return {
            "provider": provider,
            "model_id": model_id,
            "api_key": str(config["api_key"] or settings.OPENAI_API_KEY),
            "base_url": str(config["base_url"] or settings.OPENAI_BASE_URL) if (config["base_url"] or settings.OPENAI_BASE_URL) else None,
        }

    async def generate_stream_openai(
        self,
        *,
        api_key: str | None,
        base_url: str | None,
        text: str,
        instruction: str,
        model: str,
        temperature: float,
        max_tokens: int,
    ):
        client = self.get_openai_client(api_key, base_url)
        stream = await client.chat.completions.create(
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

    async def generate_stream_anthropic(
        self,
        *,
        api_key: str | None,
        base_url: str | None,
        text: str,
        instruction: str,
        model: str,
        temperature: float,
        max_tokens: int,
    ):
        client = self.get_anthropic_client(api_key, base_url)
        async with client.messages.stream(
            model=model,
            system=instruction,
            messages=[{"role": "user", "content": text}],
            temperature=temperature,
            max_tokens=max_tokens,
        ) as stream:
            async for text_chunk in stream.text_stream:
                yield text_chunk

    async def generate_stream(
        self,
        db: AsyncSession,
        *,
        text: str,
        instruction: str,
        model_provider: str,
        model_id: str,
        temperature: float,
        max_tokens: int,
    ):
        runtime_config = await self.resolve_runtime_config(db, model_provider, model_id)
        provider = str(runtime_config["provider"])
        resolved_model_id = str(runtime_config["model_id"])
        api_key = runtime_config["api_key"]
        base_url = runtime_config["base_url"]

        if provider == "anthropic":
            async for chunk in self.generate_stream_anthropic(
                api_key=api_key,
                base_url=base_url,
                text=text,
                instruction=instruction,
                model=resolved_model_id,
                temperature=temperature,
                max_tokens=max_tokens,
            ):
                yield chunk
            return

        async for chunk in self.generate_stream_openai(
            api_key=api_key,
            base_url=base_url,
            text=text,
            instruction=instruction,
            model=resolved_model_id,
            temperature=temperature,
            max_tokens=max_tokens,
        ):
            yield chunk


ai_service = AIService()
