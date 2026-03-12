"""Tests for style embedding model."""

import numpy as np
import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.models.style_embeddings import (
    StyleEmbeddingModel,
    EmbeddingService,
    cosine_similarity_search,
)


class TestStyleEmbeddingModel:
    """Test the PyTorch embedding model architecture."""

    def test_model_output_shape(self):
        """Model should produce 64-dim normalized vectors."""
        model = StyleEmbeddingModel(embedding_dim=64)
        import torch

        # Create dummy inputs (batch_size=2, max_items=6)
        batch = {
            "category_idx": torch.zeros(2, 6, dtype=torch.long),
            "fabric_idx": torch.zeros(2, 6, dtype=torch.long),
            "style_idx": torch.zeros(2, 6, dtype=torch.long),
            "color_rgb": torch.rand(2, 6, 3),
            "item_mask": torch.ones(2, 6, dtype=torch.bool),
            "persona": torch.zeros(2, dtype=torch.long),
            "occasion": torch.zeros(2, dtype=torch.long),
            "vibe": torch.zeros(2, dtype=torch.long),
            "color_energy": torch.zeros(2, dtype=torch.long),
            "temp_range": torch.zeros(2, dtype=torch.long),
            "weather": torch.zeros(2, dtype=torch.long),
            "city": torch.zeros(2, dtype=torch.long),
        }
        output = model(**batch)
        assert output.shape == (2, 64)

    def test_output_is_normalized(self):
        """Output vectors should be L2-normalized."""
        model = StyleEmbeddingModel(embedding_dim=64)
        import torch

        batch = {
            "category_idx": torch.randint(0, 6, (3, 6)),
            "fabric_idx": torch.randint(0, 50, (3, 6)),
            "style_idx": torch.randint(0, 30, (3, 6)),
            "color_rgb": torch.rand(3, 6, 3),
            "item_mask": torch.ones(3, 6, dtype=torch.bool),
            "persona": torch.randint(0, 7, (3,)),
            "occasion": torch.randint(0, 8, (3,)),
            "vibe": torch.randint(0, 6, (3,)),
            "color_energy": torch.randint(0, 6, (3,)),
            "temp_range": torch.randint(0, 5, (3,)),
            "weather": torch.randint(0, 12, (3,)),
            "city": torch.randint(0, 12, (3,)),
        }
        output = model(**batch)
        norms = torch.norm(output, dim=1)
        assert torch.allclose(norms, torch.ones(3), atol=1e-5)


class TestEmbeddingService:
    """Test the embedding service wrapper."""

    def setup_method(self):
        self.service = EmbeddingService()
        self.service.initialize_fresh()

    def test_compute_single_embedding(self):
        """Should compute a 64-dim embedding for one outfit."""
        outfit = {
            "items": [
                {"category": "top", "color": "#333333", "colorHex": "#333333", "fabric": "cotton", "style": "casual"},
                {"category": "bottom", "color": "#000000", "colorHex": "#000000", "fabric": "denim", "style": "classic"},
                {"category": "footwear", "color": "#FFFFFF", "colorHex": "#FFFFFF", "fabric": "leather", "style": "minimal"},
            ]
        }
        context = {
            "persona": "casual",
            "occasion": "hangout",
            "vibe": "minimal",
            "colorEnergy": "cool_calm",
            "temperatureRange": "mild",
            "weatherCondition": "clear",
            "cityId": "new-york-ny",
        }
        embedding = self.service.compute_embedding(outfit, context)
        assert embedding.shape == (64,)
        assert abs(np.linalg.norm(embedding) - 1.0) < 1e-5

    def test_compute_batch_embeddings(self):
        """Should compute embeddings for a batch."""
        outfits = [
            {"items": [{"category": "top", "color": "#333", "fabric": "cotton", "style": "casual"}]},
            {"items": [{"category": "top", "color": "#FFF", "fabric": "silk", "style": "elegant"}]},
        ]
        contexts = [
            {"persona": "casual", "occasion": "hangout", "vibe": "minimal"},
            {"persona": "professional", "occasion": "work", "vibe": "polished"},
        ]
        embeddings = self.service.compute_embeddings_batch(outfits, contexts)
        assert embeddings.shape == (2, 64)

    def test_signal_embedding(self):
        """Should compute embedding from signals only."""
        context = {
            "persona": "professional",
            "occasion": "work",
            "vibe": "polished",
            "temperatureRange": "cool",
            "weatherCondition": "cloudy",
            "cityId": "chicago-il",
        }
        embedding = self.service.compute_signal_embedding(context)
        assert embedding.shape == (64,)

    def test_different_signals_give_different_embeddings(self):
        """Different signal combos should produce different vectors."""
        context1 = {"persona": "casual", "occasion": "hangout", "vibe": "laid_back"}
        context2 = {"persona": "professional", "occasion": "formal", "vibe": "polished"}
        emb1 = self.service.compute_signal_embedding(context1)
        emb2 = self.service.compute_signal_embedding(context2)
        # Should not be identical
        assert not np.allclose(emb1, emb2, atol=1e-3)


class TestCosineSimilaritySearch:
    """Test brute-force cosine similarity search."""

    def test_finds_most_similar(self):
        """Should return the nearest vector first."""
        query = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        query /= np.linalg.norm(query)

        candidates = np.array([
            [0.9, 0.1, 0.0],   # Most similar
            [0.0, 1.0, 0.0],   # Orthogonal
            [0.5, 0.5, 0.0],   # Moderate
        ], dtype=np.float32)
        # Normalize
        candidates = candidates / np.linalg.norm(candidates, axis=1, keepdims=True)

        results = cosine_similarity_search(query, candidates, top_k=2)
        assert len(results) == 2
        assert results[0][0] == 0  # First candidate is most similar
        assert results[0][1] > results[1][1]

    def test_empty_candidates(self):
        """Should handle empty candidate set."""
        query = np.ones(64, dtype=np.float32) / np.sqrt(64)
        results = cosine_similarity_search(query, np.array([]).reshape(0, 64), top_k=5)
        assert results == []

    def test_top_k_limit(self):
        """Should return at most top_k results."""
        query = np.random.randn(64).astype(np.float32)
        query /= np.linalg.norm(query)
        candidates = np.random.randn(100, 64).astype(np.float32)
        candidates /= np.linalg.norm(candidates, axis=1, keepdims=True)

        results = cosine_similarity_search(query, candidates, top_k=5)
        assert len(results) == 5
