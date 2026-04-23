from collections.abc import AsyncIterator
import json
import logging

from anthropic import AsyncAnthropic
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.runtime_ai_config import runtime_ai_config_service

logger = logging.getLogger(__name__)


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

    def _extract_openai_delta_text(self, chunk: object) -> list[str]:
        choices = getattr(chunk, "choices", None) or []
        if not choices:
            return []

        texts: list[str] = []
        for choice in choices:
            delta = getattr(choice, "delta", None)
            if delta is None:
                continue

            content = getattr(delta, "content", None)
            if isinstance(content, str):
                if content:
                    texts.append(content)
                continue

            if isinstance(content, list):
                for item in content:
                    if isinstance(item, str):
                        if item:
                            texts.append(item)
                        continue

                    text_value = getattr(item, "text", None)
                    if isinstance(text_value, str) and text_value:
                        texts.append(text_value)
        return texts

    async def _generate_openai_stream_chunks(
        self,
        *,
        api_key: str | None,
        base_url: str | None,
        text: str,
        instruction: str,
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> AsyncIterator[str]:
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
            texts = self._extract_openai_delta_text(chunk)
            if texts:
                for item in texts:
                    yield item
                continue

            choices = getattr(chunk, "choices", None) or []
            logger.debug(
                "Skipped OpenAI-compatible stream chunk without text: chunk_type=%s choices=%s",
                type(chunk).__name__,
                len(choices),
            )

    async def _generate_openai_non_stream_text(
        self,
        *,
        api_key: str | None,
        base_url: str | None,
        text: str,
        instruction: str,
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> str:
        client = self.get_openai_client(api_key, base_url)
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": instruction},
                {"role": "user", "content": text},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            stream=False,
        )

        choices = getattr(response, "choices", None) or []
        if not choices:
            raise RuntimeError("OpenAI Compatible 响应中未返回 choices")

        message = getattr(choices[0], "message", None)
        if message is None:
            raise RuntimeError("OpenAI Compatible 响应中未返回 message")

        content = getattr(message, "content", None)
        if isinstance(content, str):
            return content

        if isinstance(content, list):
            texts: list[str] = []
            for item in content:
                if isinstance(item, str):
                    if item:
                        texts.append(item)
                    continue

                text_value = getattr(item, "text", None)
                if isinstance(text_value, str) and text_value:
                    texts.append(text_value)
            if texts:
                return "".join(texts)

        raise RuntimeError("OpenAI Compatible 响应内容为空或格式不受支持")

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
        streamed_any = False
        try:
            async for chunk_text in self._generate_openai_stream_chunks(
                api_key=api_key,
                base_url=base_url,
                text=text,
                instruction=instruction,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
            ):
                streamed_any = True
                yield chunk_text
        except Exception as exc:
            logger.warning(
                "OpenAI-compatible stream failed, fallback to non-stream mode: model=%s base_url=%s error=%s",
                model,
                base_url,
                exc,
            )
            fallback_text = await self._generate_openai_non_stream_text(
                api_key=api_key,
                base_url=base_url,
                text=text,
                instruction=instruction,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            if fallback_text:
                yield fallback_text
            return

        if streamed_any:
            return

        logger.warning(
            "OpenAI-compatible stream returned no text chunks, fallback to non-stream mode: model=%s base_url=%s",
            model,
            base_url,
        )
        fallback_text = await self._generate_openai_non_stream_text(
            api_key=api_key,
            base_url=base_url,
            text=text,
            instruction=instruction,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        if fallback_text:
            yield fallback_text

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
