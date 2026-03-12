"""AURA ML Service — FastAPI application entry point.

Provides style embeddings, ML quality scoring, and user personalization
for the AURA Pipeline Service.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.utils.logger import setup_logging, get_logger
from src.models.style_embeddings import EmbeddingService
from src.models.quality_scorer import QualityScorer
from src.models.personalization import PersonalizationService
from src.services import redis_client, postgres_client

from src.api.health import router as health_router
from src.api.embeddings import router as embeddings_router
from src.api.quality import router as quality_router
from src.api.personalization import router as personalization_router

setup_logging()
logger = get_logger("main")

# Application state — holds loaded models and services
_app_state: dict = {}


def get_app_state() -> dict:
    """Get the global application state (models, services)."""
    return _app_state


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: load models on startup, cleanup on shutdown."""
    logger.info(
        "starting_ml_service",
        environment=settings.environment,
        host=settings.host,
        port=settings.port,
    )

    # Initialize databases
    await postgres_client.init_postgres()
    logger.info("postgres_connected")

    # Initialize embedding service
    embedding_service = EmbeddingService()
    try:
        embedding_service.load_model()
    except Exception:
        logger.warning("no_pretrained_embedding_model_found_using_fresh_init")
        embedding_service.initialize_fresh()
    _app_state["embedding_service"] = embedding_service

    # Initialize quality scorer
    quality_scorer = QualityScorer()
    loaded = quality_scorer.load_model()
    if not loaded:
        logger.warning("no_pretrained_quality_model_quality_scoring_will_return_503_until_trained")
    _app_state["quality_scorer"] = quality_scorer

    # Initialize personalization service
    personalization_service = PersonalizationService(embedding_service)
    _app_state["personalization_service"] = personalization_service

    logger.info("ml_service_ready", models_loaded=loaded)

    yield

    # Shutdown
    logger.info("shutting_down_ml_service")
    await redis_client.close_redis()
    await postgres_client.close_postgres()
    _app_state.clear()


# ---------- Create App ----------

app = FastAPI(
    title="AURA ML Service",
    description="Style embeddings, quality scoring, and personalization for AURA Stylist",
    version="1.0.0",
    lifespan=lifespan,
)

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Internal service — restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(health_router)
app.include_router(embeddings_router)
app.include_router(quality_router)
app.include_router(personalization_router)


@app.get("/")
async def root():
    return {
        "service": "aura-ml",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "embeddings": "/ml/embeddings",
            "quality": "/ml/quality",
            "personalization": "/ml/personalization",
        },
    }


# ---------- Uvicorn Entry ----------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.environment == "development",
        log_level=settings.log_level,
        workers=1,
    )
