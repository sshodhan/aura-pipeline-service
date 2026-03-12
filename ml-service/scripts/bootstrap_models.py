#!/usr/bin/env python3
"""Bootstrap initial ML models for cold start.

Generates synthetic training data and trains:
1. Quality scoring model (XGBoost)
2. Style embedding model (saves initial weights)

Usage:
    python -m scripts.bootstrap_models
"""

import os
import sys
import json
import torch

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.config import settings
from src.data.bootstrap import generate_bootstrap_bundles
from src.models.quality_scorer import QualityScorer
from src.models.style_embeddings import StyleEmbeddingModel, fabric_vocab, style_vocab
from src.services.feature_extraction import get_feature_names


def main():
    print("=" * 60)
    print("AURA ML Service — Bootstrap Model Training")
    print("=" * 60)

    model_dir = settings.model_dir
    os.makedirs(model_dir, exist_ok=True)

    # Step 1: Generate bootstrap data
    print("\n[1/3] Generating synthetic training data...")
    bundles = generate_bootstrap_bundles(n_samples=5000, good_ratio=0.6)
    print(f"  Generated {len(bundles)} synthetic bundles")

    # Step 2: Train quality model
    print("\n[2/3] Training quality scoring model (XGBoost)...")
    quality_scorer = QualityScorer()
    metrics = quality_scorer.train_from_bootstrap(bundles)

    if "error" not in metrics:
        quality_dir = os.path.join(model_dir, "quality", "v1")
        quality_scorer.save_model(model_dir=quality_dir, version="v1")
        print(f"  Accuracy: {metrics['accuracy']:.3f}")
        print(f"  AUC-ROC:  {metrics['auc_roc']:.3f}")
        print(f"  F1 Score: {metrics['f1_score']:.3f}")
        print(f"  Top features:")
        for feat in metrics.get("top_features", [])[:5]:
            print(f"    - {feat['name']}: {feat['importance']:.4f}")
        print(f"  Model saved to: {quality_dir}")
    else:
        print(f"  ERROR: {metrics['error']}")

    # Step 3: Save initial embedding model
    print("\n[3/3] Initializing style embedding model...")
    embedding_dir = os.path.join(model_dir, "embeddings", "v1")
    os.makedirs(embedding_dir, exist_ok=True)

    model = StyleEmbeddingModel(embedding_dim=settings.embedding_dim)
    torch.save(model.state_dict(), os.path.join(embedding_dir, "model.pth"))

    config = {
        "embedding_dim": settings.embedding_dim,
        "version": "v1",
        "architecture": "multi-encoder-fusion",
        "note": "Initial random weights — will improve with contrastive training",
    }
    with open(os.path.join(embedding_dir, "config.json"), "w") as f:
        json.dump(config, f, indent=2)

    fabric_vocab.save(os.path.join(embedding_dir, "fabric_vocab.json"))
    style_vocab.save(os.path.join(embedding_dir, "style_vocab.json"))

    print(f"  Embedding model saved to: {embedding_dir}")
    print(f"  Dimension: {settings.embedding_dim}")

    # Step 4: Save personalization config
    print("\nInitializing personalization config...")
    pers_dir = os.path.join(model_dir, "personalization", "v1")
    os.makedirs(pers_dir, exist_ok=True)
    pers_config = {
        "version": "v1",
        "min_feedback": settings.personalization_min_feedback,
        "decay_factor": settings.feedback_decay_factor,
        "embedding_dim": settings.embedding_dim,
    }
    with open(os.path.join(pers_dir, "config.json"), "w") as f:
        json.dump(pers_config, f, indent=2)
    print(f"  Config saved to: {pers_dir}")

    print("\n" + "=" * 60)
    print("Bootstrap complete! All models initialized.")
    print("=" * 60)


if __name__ == "__main__":
    main()
