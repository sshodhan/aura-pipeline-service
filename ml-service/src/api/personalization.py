"""Personalization and feedback endpoints."""

from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.utils.logger import get_logger

logger = get_logger("api.personalization")
router = APIRouter(prefix="/ml/personalization", tags=["personalization"])


# ---------- Request/Response Models ----------


class FeedbackRequest(BaseModel):
    userId: str
    outfitId: str
    action: str = Field(
        ..., description="One of: liked, disliked, saved, shared, skipped"
    )
    context: Optional[dict] = Field(
        None, description="Signal context (persona, occasion, vibe, cityId)"
    )
    metadata: Optional[dict] = Field(
        None, description="Extra data (timeSpentMs, viewCount, outfit data)"
    )


class RerankRequest(BaseModel):
    userId: str
    candidates: list[dict] = Field(
        ..., description="Outfit candidates with outfitId, qualityScore, outfit, context"
    )
    topK: int = Field(default=5, ge=1, le=20)


# ---------- Endpoints ----------

VALID_ACTIONS = {"liked", "disliked", "saved", "shared", "skipped"}


@router.post("/feedback")
async def record_feedback(request: FeedbackRequest):
    """Record user feedback on an outfit recommendation."""
    if request.action not in VALID_ACTIONS:
        raise HTTPException(
            400,
            f"Invalid action '{request.action}'. Must be one of: {VALID_ACTIONS}",
        )

    from src.main import get_app_state

    state = get_app_state()
    personalization = state.get("personalization_service")

    if personalization is None:
        raise HTTPException(503, "Personalization service not initialized")

    try:
        result = await personalization.record_feedback(
            user_id=request.userId,
            outfit_id=request.outfitId,
            action=request.action,
            context=request.context,
            metadata=request.metadata,
        )
        return result
    except Exception as e:
        logger.error("feedback_recording_failed", error=str(e))
        raise HTTPException(500, f"Failed to record feedback: {str(e)}")


@router.post("/rerank")
async def rerank_outfits(request: RerankRequest):
    """Re-rank outfit candidates based on user preferences."""
    from src.main import get_app_state

    state = get_app_state()
    personalization = state.get("personalization_service")

    if personalization is None:
        raise HTTPException(503, "Personalization service not initialized")

    try:
        ranked = await personalization.rerank_outfits(
            user_id=request.userId,
            candidates=request.candidates,
            top_k=request.topK,
        )
        return {
            "ranked": ranked,
            "userId": request.userId,
            "totalCandidates": len(request.candidates),
            "returned": len(ranked),
        }
    except Exception as e:
        logger.error("rerank_failed", error=str(e))
        raise HTTPException(500, f"Re-ranking failed: {str(e)}")


@router.get("/profile/{user_id}")
async def get_user_profile(user_id: str):
    """Get the user's current preference profile."""
    from src.main import get_app_state

    state = get_app_state()
    personalization = state.get("personalization_service")

    if personalization is None:
        raise HTTPException(503, "Personalization service not initialized")

    try:
        profile = await personalization.get_user_profile(user_id)
        return profile
    except Exception as e:
        logger.error("profile_fetch_failed", error=str(e), user_id=user_id)
        raise HTTPException(500, f"Failed to fetch profile: {str(e)}")
