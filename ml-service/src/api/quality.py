"""Quality scoring endpoints."""

from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.utils.logger import get_logger

logger = get_logger("api.quality")
router = APIRouter(prefix="/ml/quality", tags=["quality"])


# ---------- Request/Response Models ----------


class ScoreRequest(BaseModel):
    bundle: dict = Field(..., description="PrecomputedOutfitBundle dict")
    ruleBasedScore: Optional[float] = Field(
        None, description="Existing rule-based score for blending"
    )


class BatchScoreRequest(BaseModel):
    bundles: list[dict] = Field(..., description="List of outfit bundle dicts")
    ruleBasedScores: Optional[dict[str, float]] = Field(
        None, description="Map of bundleId → rule-based score"
    )


class TrainRequest(BaseModel):
    bundles: list[dict] = Field(..., description="Training data bundles")
    labels: Optional[list[int]] = Field(
        None, description="Binary labels (1=good, 0=bad). If None, bootstrap from rule-based scores"
    )
    version: str = Field(default="v1", description="Model version tag")


# ---------- Endpoints ----------


@router.post("/score")
async def score_quality(request: ScoreRequest):
    """Score a single outfit bundle's quality."""
    from src.main import get_app_state

    state = get_app_state()
    quality_scorer = state.get("quality_scorer")

    if quality_scorer is None or quality_scorer.model is None:
        raise HTTPException(503, "Quality model not loaded")

    try:
        ml_score = quality_scorer.predict_score(request.bundle)

        if request.ruleBasedScore is not None:
            blended = quality_scorer.blend_scores(ml_score, request.ruleBasedScore)
        else:
            blended = ml_score

        bundle_id = request.bundle.get("bundleId", "unknown")

        return {
            "bundleId": bundle_id,
            "mlScore": round(ml_score, 2),
            "ruleBasedScore": request.ruleBasedScore,
            "blendedScore": round(blended, 2),
            "recommendation": (
                "high" if blended > 75
                else "medium" if blended > 50
                else "low"
            ),
        }
    except Exception as e:
        logger.error("quality_scoring_failed", error=str(e))
        raise HTTPException(500, f"Quality scoring failed: {str(e)}")


@router.post("/batch-score")
async def batch_score_quality(request: BatchScoreRequest):
    """Score multiple outfit bundles in batch."""
    from src.main import get_app_state

    state = get_app_state()
    quality_scorer = state.get("quality_scorer")

    if quality_scorer is None or quality_scorer.model is None:
        raise HTTPException(503, "Quality model not loaded")

    try:
        ml_scores = quality_scorer.predict_scores_batch(request.bundles)

        results = {}
        for i, bundle in enumerate(request.bundles):
            bundle_id = bundle.get("bundleId", f"bundle-{i}")
            ml_score = ml_scores[i]

            rule_score = None
            if request.ruleBasedScores:
                rule_score = request.ruleBasedScores.get(bundle_id)

            if rule_score is not None:
                blended = quality_scorer.blend_scores(ml_score, rule_score)
            else:
                blended = ml_score

            results[bundle_id] = {
                "mlScore": round(ml_score, 2),
                "ruleBasedScore": rule_score,
                "blendedScore": round(blended, 2),
                "recommendation": (
                    "high" if blended > 75
                    else "medium" if blended > 50
                    else "low"
                ),
            }

        return {
            "scores": results,
            "count": len(results),
            "modelVersion": quality_scorer.version,
        }
    except Exception as e:
        logger.error("batch_quality_scoring_failed", error=str(e))
        raise HTTPException(500, f"Batch quality scoring failed: {str(e)}")


@router.post("/train")
async def train_model(request: TrainRequest):
    """Train or retrain the quality scoring model."""
    from src.main import get_app_state
    from src.services.model_registry import registry

    state = get_app_state()
    quality_scorer = state.get("quality_scorer")

    if quality_scorer is None:
        raise HTTPException(503, "Quality scorer not initialized")

    try:
        if request.labels is not None:
            # Supervised training with explicit labels
            if len(request.bundles) != len(request.labels):
                raise HTTPException(400, "bundles and labels must have same length")
            metrics = quality_scorer.train(request.bundles, request.labels)
        else:
            # Bootstrap from rule-based scores
            metrics = quality_scorer.train_from_bootstrap(request.bundles)

        if "error" in metrics:
            raise HTTPException(400, metrics["error"])

        # Save model
        model_dir = quality_scorer.save_model(version=request.version)

        # Register in model registry
        await registry.register_model(
            model_type="quality",
            version=request.version,
            metrics=metrics,
            artifact_path=model_dir,
        )
        await registry.promote_model("quality", request.version)

        return {
            "status": "trained",
            "version": request.version,
            "metrics": metrics,
            "modelDir": model_dir,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("training_failed", error=str(e))
        raise HTTPException(500, f"Training failed: {str(e)}")


@router.get("/info")
async def model_info():
    """Get quality model information."""
    from src.main import get_app_state

    state = get_app_state()
    quality_scorer = state.get("quality_scorer")

    if quality_scorer is None:
        return {"status": "not_initialized"}

    info = quality_scorer.get_model_info()
    if quality_scorer.model is not None:
        info["feature_importance"] = quality_scorer.get_feature_importance()[:10]

    return info
