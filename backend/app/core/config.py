from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/mydaodun"
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    OPENAI_BASE_URL: str | None = None
    ANTHROPIC_BASE_URL: str | None = None

    class Config:
        env_file = ".env"


settings = Settings()
