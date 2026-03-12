"""Redis client for shared cache operations with the Node.js service."""

import json
from typing import Any, Optional
import numpy as np
import redis.asyncio as redis

from src.config import settings
from src.utils.logger import get_logger

logger = get_logger("redis")

# Global connection pool
_pool: Optional[redis.Redis] = None


async def get_redis() -> redis.Redis:
    """Get or create the Redis connection."""
    global _pool
    if _pool is None:
        _pool = redis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            password=settings.redis_password,
            db=settings.redis_db,
            decode_responses=True,
            socket_connect_timeout=5,
            retry_on_timeout=True,
        )
    return _pool


async def close_redis() -> None:
    """Close the Redis connection."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


# ---------- Embedding Operations ----------


async def store_outfit_embedding(
    outfit_id: str, vector: np.ndarray, metadata: dict
) -> None:
    """Store an outfit embedding vector in Redis."""
    r = await get_redis()
    key = f"aura:embedding:outfit:{outfit_id}"
    value = json.dumps(
        {
            "id": outfit_id,
            "vector": vector.tolist(),
            "metadata": metadata,
        }
    )
    await r.set(key, value, ex=86400)  # 24-hour TTL
    # Add to index set
    await r.sadd("aura:embedding:outfits:index", outfit_id)
    logger.debug("stored_embedding", outfit_id=outfit_id, dim=len(vector))


async def get_outfit_embedding(outfit_id: str) -> Optional[dict]:
    """Retrieve an outfit embedding from Redis."""
    r = await get_redis()
    key = f"aura:embedding:outfit:{outfit_id}"
    data = await r.get(key)
    if data is None:
        return None
    return json.loads(data)


async def get_all_outfit_embeddings() -> list[dict]:
    """Retrieve all outfit embeddings for similarity search."""
    r = await get_redis()
    outfit_ids = await r.smembers("aura:embedding:outfits:index")
    if not outfit_ids:
        return []

    pipe = r.pipeline()
    for oid in outfit_ids:
        pipe.get(f"aura:embedding:outfit:{oid}")
    results = await pipe.execute()

    embeddings = []
    for data in results:
        if data is not None:
            embeddings.append(json.loads(data))
    return embeddings


async def store_outfit_embeddings_batch(
    embeddings: list[dict],
) -> int:
    """Store multiple outfit embeddings in a Redis pipeline."""
    r = await get_redis()
    pipe = r.pipeline()
    count = 0
    for emb in embeddings:
        key = f"aura:embedding:outfit:{emb['id']}"
        pipe.set(key, json.dumps(emb), ex=86400)
        pipe.sadd("aura:embedding:outfits:index", emb["id"])
        count += 1
    await pipe.execute()
    logger.info("batch_stored_embeddings", count=count)
    return count


# ---------- User Profile Operations ----------


async def store_user_profile(user_id: str, profile: dict) -> None:
    """Store a user preference profile in Redis."""
    r = await get_redis()
    key = f"aura:user:profile:{user_id}"
    await r.set(key, json.dumps(profile), ex=604800)  # 7-day TTL
    logger.debug("stored_user_profile", user_id=user_id)


async def get_user_profile(user_id: str) -> Optional[dict]:
    """Retrieve a user preference profile from Redis."""
    r = await get_redis()
    key = f"aura:user:profile:{user_id}"
    data = await r.get(key)
    if data is None:
        return None
    return json.loads(data)


# ---------- Quality Score Operations ----------


async def store_quality_score(outfit_id: str, score: float) -> None:
    """Cache an ML quality score for an outfit."""
    r = await get_redis()
    key = f"aura:quality:score:{outfit_id}"
    await r.set(key, str(score), ex=86400)


async def get_quality_score(outfit_id: str) -> Optional[float]:
    """Retrieve a cached ML quality score."""
    r = await get_redis()
    key = f"aura:quality:score:{outfit_id}"
    data = await r.get(key)
    return float(data) if data else None


async def store_quality_scores_batch(scores: dict[str, float]) -> int:
    """Store multiple quality scores in a pipeline."""
    r = await get_redis()
    pipe = r.pipeline()
    for outfit_id, score in scores.items():
        pipe.set(f"aura:quality:score:{outfit_id}", str(score), ex=86400)
    await pipe.execute()
    return len(scores)


# ---------- Model Registry Operations ----------


async def get_current_model_version(model_type: str) -> Optional[str]:
    """Get the current active model version."""
    r = await get_redis()
    return await r.get(f"aura:ml:model:{model_type}:current")


async def set_current_model_version(model_type: str, version: str) -> None:
    """Set the current active model version."""
    r = await get_redis()
    await r.set(f"aura:ml:model:{model_type}:current", version)


async def store_model_metadata(
    model_type: str, version: str, metadata: dict
) -> None:
    """Store model training metadata in the registry."""
    r = await get_redis()
    key = f"aura:ml:model:{model_type}:registry"
    await r.hset(key, version, json.dumps(metadata))


async def get_model_metadata(
    model_type: str, version: str
) -> Optional[dict]:
    """Retrieve model metadata from the registry."""
    r = await get_redis()
    key = f"aura:ml:model:{model_type}:registry"
    data = await r.hget(key, version)
    return json.loads(data) if data else None


# ---------- Health Check ----------


async def check_health() -> bool:
    """Check Redis connectivity."""
    try:
        r = await get_redis()
        return await r.ping()
    except Exception:
        return False
