"""Application configuration using Pydantic settings."""

from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional


class Settings(BaseSettings):
    """ML service configuration loaded from environment variables."""

    # Server
    host: str = Field(default="0.0.0.0", alias="HOST")
    port: int = Field(default=8000, alias="PORT")
    log_level: str = Field(default="info", alias="LOG_LEVEL")
    environment: str = Field(default="development", alias="NODE_ENV")

    # Redis
    redis_host: str = Field(default="localhost", alias="REDIS_HOST")
    redis_port: int = Field(default=6379, alias="REDIS_PORT")
    redis_password: Optional[str] = Field(default=None, alias="REDIS_PASSWORD")
    redis_db: int = Field(default=0, alias="REDIS_DB")

    # PostgreSQL
    postgres_host: str = Field(default="localhost", alias="POSTGRES_HOST")
    postgres_port: int = Field(default=5432, alias="POSTGRES_PORT")
    postgres_user: str = Field(default="aura", alias="POSTGRES_USER")
    postgres_password: str = Field(default="aura_dev", alias="POSTGRES_PASSWORD")
    postgres_db: str = Field(default="aura", alias="POSTGRES_DB")

    # ML Models
    model_dir: str = Field(default="/app/models", alias="MODEL_DIR")
    model_version: str = Field(default="latest", alias="MODEL_VERSION")
    embedding_dim: int = Field(default=64, alias="EMBEDDING_DIM")

    # Feature extraction
    num_personas: int = 7
    num_occasions: int = 8
    num_vibes: int = 6
    num_color_energies: int = 6
    num_cities: int = 12
    num_weather_conditions: int = 12
    num_temp_ranges: int = 5

    # Training
    quality_blend_ml_weight: float = Field(default=0.7, alias="QUALITY_BLEND_ML_WEIGHT")
    quality_blend_rule_weight: float = Field(default=0.3, alias="QUALITY_BLEND_RULE_WEIGHT")
    personalization_min_feedback: int = Field(default=5, alias="PERSONALIZATION_MIN_FEEDBACK")
    feedback_decay_factor: float = Field(default=0.95, alias="FEEDBACK_DECAY_FACTOR")

    @property
    def redis_url(self) -> str:
        auth = f":{self.redis_password}@" if self.redis_password else ""
        return f"redis://{auth}{self.redis_host}:{self.redis_port}/{self.redis_db}"

    @property
    def postgres_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
