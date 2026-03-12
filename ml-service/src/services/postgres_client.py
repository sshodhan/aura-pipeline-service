"""PostgreSQL client for user feedback and model artifact storage."""

from datetime import datetime
from typing import Optional
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text

from src.config import settings
from src.utils.logger import get_logger

logger = get_logger("postgres")

_engine = None
_session_factory = None


async def init_postgres() -> None:
    """Initialize the PostgreSQL connection pool."""
    global _engine, _session_factory
    _engine = create_async_engine(
        settings.postgres_url,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
        echo=settings.environment == "development",
    )
    _session_factory = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)
    logger.info("postgres_initialized", host=settings.postgres_host)


async def close_postgres() -> None:
    """Close the PostgreSQL connection pool."""
    global _engine
    if _engine:
        await _engine.dispose()
        _engine = None


def get_session() -> AsyncSession:
    """Get a new database session."""
    if _session_factory is None:
        raise RuntimeError("PostgreSQL not initialized. Call init_postgres() first.")
    return _session_factory()


# ---------- User Feedback Operations ----------


async def store_feedback(
    user_id: str,
    outfit_id: str,
    action: str,
    context: Optional[dict] = None,
    metadata: Optional[dict] = None,
) -> int:
    """Store a user feedback event. Returns the feedback ID."""
    async with get_session() as session:
        result = await session.execute(
            text("""
                INSERT INTO user_feedback (user_id, outfit_id, action, context, metadata)
                VALUES (:user_id, :outfit_id, :action, :context::jsonb, :metadata::jsonb)
                RETURNING id
            """),
            {
                "user_id": user_id,
                "outfit_id": outfit_id,
                "action": action,
                "context": _to_json(context),
                "metadata": _to_json(metadata),
            },
        )
        feedback_id = result.scalar_one()
        await session.commit()
        logger.info(
            "feedback_stored",
            user_id=user_id,
            outfit_id=outfit_id,
            action=action,
            feedback_id=feedback_id,
        )
        return feedback_id


async def get_user_feedback(
    user_id: str,
    limit: int = 100,
    since: Optional[datetime] = None,
) -> list[dict]:
    """Retrieve feedback history for a user."""
    async with get_session() as session:
        query = """
            SELECT id, outfit_id, action, context, metadata, created_at
            FROM user_feedback
            WHERE user_id = :user_id
        """
        params: dict = {"user_id": user_id, "limit": limit}

        if since:
            query += " AND created_at >= :since"
            params["since"] = since

        query += " ORDER BY created_at DESC LIMIT :limit"

        result = await session.execute(text(query), params)
        rows = result.mappings().all()
        return [
            {
                "id": row["id"],
                "outfit_id": row["outfit_id"],
                "action": row["action"],
                "context": row["context"],
                "metadata": row["metadata"],
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            }
            for row in rows
        ]


async def get_user_feedback_count(user_id: str) -> int:
    """Get the total number of feedback events for a user."""
    async with get_session() as session:
        result = await session.execute(
            text("SELECT COUNT(*) FROM user_feedback WHERE user_id = :user_id"),
            {"user_id": user_id},
        )
        return result.scalar_one()


async def get_feedback_for_training(
    since: Optional[datetime] = None,
    limit: int = 50000,
) -> list[dict]:
    """Get feedback data for model training."""
    async with get_session() as session:
        query = """
            SELECT user_id, outfit_id, action, context, metadata, created_at
            FROM user_feedback
        """
        params: dict = {"limit": limit}
        if since:
            query += " WHERE created_at >= :since"
            params["since"] = since

        query += " ORDER BY created_at DESC LIMIT :limit"

        result = await session.execute(text(query), params)
        rows = result.mappings().all()
        return [dict(row) for row in rows]


# ---------- Model Artifact Operations ----------


async def store_model_artifact(
    model_type: str,
    version: str,
    train_metrics: dict,
    artifact_path: str,
) -> int:
    """Store model training metadata."""
    async with get_session() as session:
        result = await session.execute(
            text("""
                INSERT INTO model_artifacts (model_type, version, train_metrics, artifact_path)
                VALUES (:model_type, :version, :train_metrics::jsonb, :artifact_path)
                RETURNING id
            """),
            {
                "model_type": model_type,
                "version": version,
                "train_metrics": _to_json(train_metrics),
                "artifact_path": artifact_path,
            },
        )
        artifact_id = result.scalar_one()
        await session.commit()
        return artifact_id


async def get_latest_model_artifact(model_type: str) -> Optional[dict]:
    """Get the most recent model artifact for a given type."""
    async with get_session() as session:
        result = await session.execute(
            text("""
                SELECT id, model_type, version, train_metrics, artifact_path, created_at
                FROM model_artifacts
                WHERE model_type = :model_type
                ORDER BY created_at DESC
                LIMIT 1
            """),
            {"model_type": model_type},
        )
        row = result.mappings().first()
        return dict(row) if row else None


# ---------- Health Check ----------


async def check_health() -> bool:
    """Check PostgreSQL connectivity."""
    try:
        async with get_session() as session:
            await session.execute(text("SELECT 1"))
            return True
    except Exception:
        return False


# ---------- Helpers ----------


def _to_json(data: Optional[dict]) -> Optional[str]:
    """Convert dict to JSON string for PostgreSQL JSONB columns."""
    if data is None:
        return None
    import json
    return json.dumps(data)
