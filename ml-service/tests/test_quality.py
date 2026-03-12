"""Tests for quality scoring model."""

import numpy as np
import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.models.quality_scorer import QualityScorer
from src.services.feature_extraction import (
    extract_features,
    extract_features_batch,
    get_feature_names,
)
from src.data.bootstrap import generate_bootstrap_bundles


class TestFeatureExtraction:
    """Test the 56-feature extraction pipeline."""

    def _make_bundle(self, **overrides):
        """Create a test bundle with sensible defaults."""
        bundle = {
            "context": {
                "cityId": "new-york-ny",
                "date": "2026-03-12",
                "persona": "casual",
                "occasion": "hangout",
                "vibe": "minimal",
                "vibes": ["minimal"],
                "colorEnergy": "cool_calm",
                "temperatureRange": "mild",
                "weatherCondition": "clear",
            },
            "outfits": [
                {
                    "items": [
                        {"category": "top", "name": "T-Shirt", "color": "Gray", "colorHex": "#808080", "fabric": "cotton", "style": "casual"},
                        {"category": "bottom", "name": "Jeans", "color": "Blue", "colorHex": "#4B0082", "fabric": "denim", "style": "classic"},
                        {"category": "footwear", "name": "Sneakers", "color": "White", "colorHex": "#FFFFFF", "fabric": "leather", "style": "casual"},
                    ],
                    "styling": {"overallVibe": "relaxed", "occasionFit": "casual"},
                }
            ],
            "qualityMetrics": {
                "confidenceScore": 75,
                "signalConsistency": 80,
                "weatherAppropriateness": 70,
                "occasionMatch": 75,
                "regionalRelevance": 70,
            },
        }
        # Apply overrides
        for key, value in overrides.items():
            if key in bundle["context"]:
                bundle["context"][key] = value
        return bundle

    def test_feature_vector_shape(self):
        """Should produce exactly 56 features."""
        bundle = self._make_bundle()
        features = extract_features(bundle)
        assert features.shape == (56,), f"Expected 56 features, got {features.shape}"

    def test_feature_names_match_count(self):
        """Feature names should match feature count."""
        names = get_feature_names()
        assert len(names) == 56

    def test_batch_extraction(self):
        """Batch extraction should produce (N, 56) matrix."""
        bundles = [self._make_bundle() for _ in range(5)]
        features = extract_features_batch(bundles)
        assert features.shape == (5, 56)

    def test_different_signals_give_different_features(self):
        """Different signals should produce different feature vectors."""
        bundle1 = self._make_bundle(persona="casual", occasion="hangout")
        bundle2 = self._make_bundle(persona="professional", occasion="work")
        f1 = extract_features(bundle1)
        f2 = extract_features(bundle2)
        assert not np.allclose(f1, f2)

    def test_features_are_bounded(self):
        """All features should be in reasonable ranges."""
        bundle = self._make_bundle()
        features = extract_features(bundle)
        # Most features should be between 0 and 1 (one-hot, normalized)
        assert np.all(features >= -0.5), f"Features below -0.5: {features[features < -0.5]}"
        assert np.all(features <= 1.5), f"Features above 1.5: {features[features > 1.5]}"

    def test_empty_outfit_handling(self):
        """Should handle empty outfit gracefully."""
        bundle = self._make_bundle()
        bundle["outfits"] = [{"items": []}]
        features = extract_features(bundle)
        assert features.shape == (56,)
        assert not np.any(np.isnan(features))


class TestQualityScorer:
    """Test the XGBoost quality scoring model."""

    def test_bootstrap_training(self):
        """Should train successfully on bootstrap data."""
        bundles = generate_bootstrap_bundles(n_samples=500, good_ratio=0.6)
        scorer = QualityScorer()
        metrics = scorer.train_from_bootstrap(bundles)

        assert "error" not in metrics
        assert metrics["accuracy"] > 0.6
        assert metrics["auc_roc"] > 0.6
        assert metrics["f1_score"] > 0.5

    def test_predict_score_range(self):
        """Predictions should be in 0-100 range."""
        bundles = generate_bootstrap_bundles(n_samples=300, good_ratio=0.6)
        scorer = QualityScorer()
        scorer.train_from_bootstrap(bundles)

        # Score a sample bundle
        test_bundle = bundles[0]
        score = scorer.predict_score(test_bundle)
        assert 0 <= score <= 100

    def test_batch_predict(self):
        """Batch prediction should work for multiple bundles."""
        bundles = generate_bootstrap_bundles(n_samples=300, good_ratio=0.6)
        scorer = QualityScorer()
        scorer.train_from_bootstrap(bundles)

        scores = scorer.predict_scores_batch(bundles[:10])
        assert len(scores) == 10
        assert all(0 <= s <= 100 for s in scores)

    def test_blend_scores(self):
        """Score blending should respect configured weights."""
        scorer = QualityScorer()
        # Default: 0.7 ML + 0.3 rule
        blended = scorer.blend_scores(ml_score=80, rule_score=60)
        expected = 0.7 * 80 + 0.3 * 60  # = 74
        assert abs(blended - expected) < 0.01

    def test_feature_importance(self):
        """Trained model should provide feature importance."""
        bundles = generate_bootstrap_bundles(n_samples=300, good_ratio=0.6)
        scorer = QualityScorer()
        scorer.train_from_bootstrap(bundles)

        importance = scorer.get_feature_importance()
        assert len(importance) == 56
        assert all("name" in f and "importance" in f for f in importance)

    def test_model_info(self):
        """Should report model metadata."""
        scorer = QualityScorer()
        info = scorer.get_model_info()
        assert info["loaded"] is False

        bundles = generate_bootstrap_bundles(n_samples=200, good_ratio=0.6)
        scorer.train_from_bootstrap(bundles)
        info = scorer.get_model_info()
        assert info["loaded"] is True


class TestBootstrapData:
    """Test bootstrap data generation."""

    def test_generation_count(self):
        """Should generate requested number of samples."""
        bundles = generate_bootstrap_bundles(n_samples=100)
        assert len(bundles) == 100

    def test_good_bad_ratio(self):
        """Should respect good/bad ratio."""
        bundles = generate_bootstrap_bundles(n_samples=1000, good_ratio=0.7)
        good = sum(1 for b in bundles if b["qualityMetrics"]["confidenceScore"] > 65)
        # Approximately 70% should be good
        assert 600 <= good <= 800

    def test_all_bundles_have_required_fields(self):
        """All bundles should have required structure."""
        bundles = generate_bootstrap_bundles(n_samples=50)
        for bundle in bundles:
            assert "bundleId" in bundle
            assert "context" in bundle
            assert "outfits" in bundle
            assert "qualityMetrics" in bundle
            assert bundle["context"]["persona"] in [
                "casual", "professional", "athletic", "business-casual",
                "street-style", "elevated-casual", "athleisure",
            ]
