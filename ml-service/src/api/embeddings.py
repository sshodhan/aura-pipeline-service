"""Embedding computation and similarity search endpoints."""

from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import numpy as np

from src.services import redis_client
from src.models.style_embeddings import cosine_similarity_search
from src.utils.logger import get_logger

logger = get_logger("api.embeddings")
router = APIRouter(prefix="/ml/embeddings", tags=["embeddings"])


# ---------- Request/Response Models ----------


class OutfitItem(BaseModel):
    category: str
    name: str = ""
    description: str = ""
    color: str = ""
    colorHex: Optional[str] = None
    fabric: Optional[str] = None
    style: Optional[str] = None
    brand: Optional[str] = None


class ComputeEmbeddingRequest(BaseModel):
    outfit: dict = Field(..., description="Outfit dict with 'items' list")
    context: dict = Field(..., description="Signal context (persona, occasion, vibe, etc.)")


class SimilaritySearchRequest(BaseModel):
    cityId: str
    date: Optional[str] = None
    persona: str
    occasion: str
    vibe: str = "minimal"
    colorEnergy: Optional[str] = None
    temperatureRange: Optional[str] = "mild"
    weatherCondition: Optional[str] = "clear"
    topK: int = Field(default=10, ge=1, le=50)


class BatchEmbeddingRequest(BaseModel):
    outfits: list[dict]
    contexts: list[dict]


# ---------- Endpoints ----------


@router.post("/compute")
async def compute_embedding(request: ComputeEmbeddingRequest):
    """Compute a style embedding for a single outfit + context."""
    from src.main import get_app_state

    state = get_app_state()
    embedding_service = state.get("embedding_service")
    if embedding_service is None:
        raise HTTPException(503, "Embedding service not initialized")

    try:
        vector = embedding_service.compute_embedding(request.outfit, request.context)
        return {
            "embedding": vector.tolist(),
            "dimension": len(vector),
        }
    except Exception as e:
        logger.error("embedding_computation_failed", error=str(e))
        raise HTTPException(500, f"Embedding computation failed: {str(e)}")


@router.post("/compute-batch")
async def compute_embeddings_batch(request: BatchEmbeddingRequest):
    """Compute embeddings for a batch of outfits."""
    from src.main import get_app_state

    state = get_app_state()
    embedding_service = state.get("embedding_service")
    if embedding_service is None:
        raise HTTPException(503, "Embedding service not initialized")

    if len(request.outfits) != len(request.contexts):
        raise HTTPException(400, "outfits and contexts must have same length")

    try:
        vectors = embedding_service.compute_embeddings_batch(
            request.outfits, request.contexts
        )

        # Store in Redis
        embeddings_data = []
        for i, (outfit, context) in enumerate(zip(request.outfits, request.contexts)):
            outfit_id = outfit.get("id", f"outfit-{i}")
            emb_data = {
                "id": outfit_id,
                "vector": vectors[i].tolist(),
                "metadata": {
                    "persona": context.get("persona"),
                    "occasion": context.get("occasion"),
                    "vibe": context.get("vibe"),
                    "cityId": context.get("cityId"),
                },
            }
            embeddings_data.append(emb_data)

        stored = await redis_client.store_outfit_embeddings_batch(embeddings_data)

        return {
            "computed": len(vectors),
            "stored": stored,
            "dimension": vectors.shape[1],
        }
    except Exception as e:
        logger.error("batch_embedding_failed", error=str(e))
        raise HTTPException(500, f"Batch embedding computation failed: {str(e)}")


@router.post("/search")
async def similarity_search(request: SimilaritySearchRequest):
    """Search for similar outfits using embedding similarity."""
    from src.main import get_app_state

    state = get_app_state()
    embedding_service = state.get("embedding_service")
    if embedding_service is None:
        raise HTTPException(503, "Embedding service not initialized")

    try:
        # Compute signal embedding for the query
        context = {
            "cityId": request.cityId,
            "date": request.date,
            "persona": request.persona,
            "occasion": request.occasion,
            "vibe": request.vibe,
            "colorEnergy": request.colorEnergy,
            "temperatureRange": request.temperatureRange,
            "weatherCondition": request.weatherCondition,
        }
        query_vector = embedding_service.compute_signal_embedding(context)

        # Get all outfit embeddings from Redis
        all_embeddings = await redis_client.get_all_outfit_embeddings()

        if not all_embeddings:
            return {
                "results": [],
                "searchMetadata": {"vectorsSearched": 0, "message": "No embeddings in cache"},
            }

        # Build candidate matrix
        ids = [e["id"] for e in all_embeddings]
        vectors = np.array([e["vector"] for e in all_embeddings], dtype=np.float32)
        metadata_map = {e["id"]: e.get("metadata", {}) for e in all_embeddings}

        # Search
        results = cosine_similarity_search(query_vector, vectors, top_k=request.topK)

        return {
            "results": [
                {
                    "outfitId": ids[idx],
                    "similarity": round(sim, 4),
                    "metadata": metadata_map.get(ids[idx], {}),
                }
                for idx, sim in results
            ],
            "searchMetadata": {
                "vectorsSearched": len(vectors),
                "queryDimension": len(query_vector),
                "topK": request.topK,
            },
        }
    except Exception as e:
        logger.error("similarity_search_failed", error=str(e))
        raise HTTPException(500, f"Similarity search failed: {str(e)}")


@router.get("/stats")
async def embedding_stats():
    """Get statistics about stored embeddings."""
    all_embeddings = await redis_client.get_all_outfit_embeddings()
    return {
        "totalEmbeddings": len(all_embeddings),
        "dimension": 64,
        "storageType": "redis_hash",
    }
