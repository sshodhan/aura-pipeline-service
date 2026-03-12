"""Model versioning and lifecycle management."""

import os
from datetime import datetime
from typing import Optional

from src.config import settings
from src.services import redis_client
from src.utils.logger import get_logger

logger = get_logger("model_registry")


class ModelRegistry:
    """Manages model versions and hot-reloading."""

    async def register_model(
        self,
        model_type: str,
        version: str,
        metrics: dict,
        artifact_path: str,
    ) -> None:
        """Register a trained model version."""
        metadata = {
            "version": version,
            "trained_at": datetime.utcnow().isoformat(),
            "metrics": metrics,
            "artifact_path": artifact_path,
        }
        await redis_client.store_model_metadata(model_type, version, metadata)
        logger.info(
            "model_registered",
            model_type=model_type,
            version=version,
            metrics=metrics,
        )

    async def promote_model(self, model_type: str, version: str) -> None:
        """Promote a model version to current/active."""
        metadata = await redis_client.get_model_metadata(model_type, version)
        if metadata is None:
            raise ValueError(f"Model {model_type}:{version} not found in registry")

        await redis_client.set_current_model_version(model_type, version)
        logger.info("model_promoted", model_type=model_type, version=version)

    async def get_current_version(self, model_type: str) -> Optional[str]:
        """Get the currently active model version."""
        return await redis_client.get_current_model_version(model_type)

    async def get_model_info(self, model_type: str) -> dict:
        """Get information about the current model."""
        version = await self.get_current_version(model_type)
        if version is None:
            return {"model_type": model_type, "status": "no_model_loaded"}

        metadata = await redis_client.get_model_metadata(model_type, version)
        return {
            "model_type": model_type,
            "current_version": version,
            "metadata": metadata,
        }


registry = ModelRegistry()
