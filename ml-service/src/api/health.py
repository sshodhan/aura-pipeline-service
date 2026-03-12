"""Health check endpoints."""

from fastapi import APIRouter
from src.services import redis_client, postgres_client
from src.utils.logger import get_logger

logger = get_logger("health")
router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    """Basic health check."""
    return {"status": "ok", "service": "aura-ml"}


@router.get("/health/ready")
async def readiness():
    """Readiness probe — checks all dependencies."""
    redis_ok = await redis_client.check_health()
    postgres_ok = await postgres_client.check_health()

    ready = redis_ok and postgres_ok
    return {
        "ready": ready,
        "dependencies": {
            "redis": "ok" if redis_ok else "unavailable",
            "postgres": "ok" if postgres_ok else "unavailable",
        },
    }


@router.get("/health/detailed")
async def detailed_health():
    """Detailed health check with model status."""
    from src.main import get_app_state

    state = get_app_state()
    redis_ok = await redis_client.check_health()
    postgres_ok = await postgres_client.check_health()

    return {
        "status": "ok" if (redis_ok and postgres_ok) else "degraded",
        "dependencies": {
            "redis": "ok" if redis_ok else "unavailable",
            "postgres": "ok" if postgres_ok else "unavailable",
        },
        "models": {
            "embeddings": {
                "loaded": state.get("embedding_service") is not None
                and state["embedding_service"].model is not None,
            },
            "quality": state.get("quality_scorer", {}).get("info", {}),
        },
    }
