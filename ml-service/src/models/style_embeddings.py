"""Style embedding model using PyTorch.

Multi-encoder architecture producing 64-dim vectors for outfits, signals, and contexts.
Uses contrastive learning to place similar styles close together in embedding space.
"""

import os
import json
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
from typing import Optional

from src.config import settings
from src.utils.logger import get_logger

logger = get_logger("style_embeddings")


# ---------- Taxonomy Constants ----------

NUM_CATEGORIES = 6      # top, bottom, outerwear, footwear, accessory, dress
NUM_FABRICS = 50         # learned fabric vocabulary
NUM_STYLES = 30          # learned style vocabulary
NUM_PERSONAS = 7
NUM_OCCASIONS = 8
NUM_VIBES = 6
NUM_COLOR_ENERGIES = 6
NUM_TEMP_RANGES = 5
NUM_WEATHER = 12
NUM_CITIES = 12

CATEGORY_TO_IDX = {
    "top": 0, "bottom": 1, "outerwear": 2,
    "footwear": 3, "accessory": 4, "dress": 5,
}

PERSONA_TO_IDX = {
    "casual": 0, "professional": 1, "athletic": 2, "business-casual": 3,
    "street-style": 4, "elevated-casual": 5, "athleisure": 6,
}

OCCASION_TO_IDX = {
    "work": 0, "hangout": 1, "active": 2, "dinner": 3,
    "errands": 4, "home": 5, "date": 6, "formal": 7,
}

VIBE_TO_IDX = {
    "minimal": 0, "polished": 1, "laid_back": 2,
    "bold": 3, "romantic": 4, "creative": 5,
}

COLOR_ENERGY_TO_IDX = {
    "dark_moody": 0, "light_airy": 1, "bold_vibrant": 2,
    "earthy_warm": 3, "cool_calm": 4, "rich_deep": 5,
}

TEMP_RANGE_TO_IDX = {"cold": 0, "cool": 1, "mild": 2, "warm": 3, "hot": 4}


# ---------- Vocabulary Builder ----------

class FabricVocabulary:
    """Dynamic vocabulary for fabric types."""

    def __init__(self):
        self.word2idx: dict[str, int] = {"<UNK>": 0, "<PAD>": 1}
        self.idx2word: dict[int, str] = {0: "<UNK>", 1: "<PAD>"}
        self._next_idx = 2

    def encode(self, fabric: str) -> int:
        fabric = fabric.lower().strip()
        if fabric not in self.word2idx:
            self.word2idx[fabric] = self._next_idx
            self.idx2word[self._next_idx] = fabric
            self._next_idx += 1
        return self.word2idx.get(fabric, 0)

    def save(self, path: str) -> None:
        with open(path, "w") as f:
            json.dump(self.word2idx, f)

    def load(self, path: str) -> None:
        with open(path, "r") as f:
            self.word2idx = json.load(f)
            self.idx2word = {v: k for k, v in self.word2idx.items()}
            self._next_idx = max(self.word2idx.values()) + 1


# Global vocabularies
fabric_vocab = FabricVocabulary()
style_vocab = FabricVocabulary()  # Reuse same structure


# ---------- Sub-Encoders ----------


class OutfitItemEncoder(nn.Module):
    """Encodes a single outfit item into a fixed-size vector."""

    def __init__(self, embed_dim: int = 32):
        super().__init__()
        self.category_emb = nn.Embedding(NUM_CATEGORIES, 8)
        self.fabric_emb = nn.Embedding(NUM_FABRICS, 12)
        self.style_emb = nn.Embedding(NUM_STYLES, 12)
        # RGB color input (3 dims)
        self.color_proj = nn.Linear(3, 8)
        # Combine: 8 + 12 + 12 + 8 = 40 → embed_dim
        self.fc = nn.Linear(40, embed_dim)

    def forward(
        self, category_idx: torch.Tensor, fabric_idx: torch.Tensor,
        style_idx: torch.Tensor, color_rgb: torch.Tensor
    ) -> torch.Tensor:
        """
        Args:
            category_idx: (batch, max_items) long tensor
            fabric_idx: (batch, max_items) long tensor
            style_idx: (batch, max_items) long tensor
            color_rgb: (batch, max_items, 3) float tensor (0-1 normalized)

        Returns:
            (batch, max_items, embed_dim) item embeddings
        """
        cat_emb = self.category_emb(category_idx)        # (B, I, 8)
        fab_emb = self.fabric_emb(fabric_idx)             # (B, I, 12)
        sty_emb = self.style_emb(style_idx)               # (B, I, 12)
        col_emb = self.color_proj(color_rgb)              # (B, I, 8)

        combined = torch.cat([cat_emb, fab_emb, sty_emb, col_emb], dim=-1)  # (B, I, 40)
        return F.relu(self.fc(combined))  # (B, I, embed_dim)


class OutfitEncoder(nn.Module):
    """Encodes a full outfit (sequence of items) using attention pooling."""

    def __init__(self, item_dim: int = 32, output_dim: int = 128):
        super().__init__()
        self.item_encoder = OutfitItemEncoder(embed_dim=item_dim)
        self.attention = nn.Sequential(
            nn.Linear(item_dim, item_dim),
            nn.Tanh(),
            nn.Linear(item_dim, 1),
        )
        self.output_proj = nn.Linear(item_dim, output_dim)

    def forward(
        self, category_idx: torch.Tensor, fabric_idx: torch.Tensor,
        style_idx: torch.Tensor, color_rgb: torch.Tensor,
        mask: torch.Tensor
    ) -> torch.Tensor:
        """
        Args: same as OutfitItemEncoder, plus mask (batch, max_items) bool

        Returns:
            (batch, output_dim) outfit embedding
        """
        item_embs = self.item_encoder(category_idx, fabric_idx, style_idx, color_rgb)
        # Attention pooling
        attn_weights = self.attention(item_embs).squeeze(-1)  # (B, I)
        attn_weights = attn_weights.masked_fill(~mask, float("-inf"))
        attn_weights = F.softmax(attn_weights, dim=-1).unsqueeze(-1)  # (B, I, 1)
        pooled = (item_embs * attn_weights).sum(dim=1)  # (B, item_dim)
        return F.relu(self.output_proj(pooled))  # (B, output_dim)


class SignalEncoder(nn.Module):
    """Encodes user signals (persona, occasion, vibe, colorEnergy)."""

    def __init__(self, output_dim: int = 64):
        super().__init__()
        self.persona_emb = nn.Embedding(NUM_PERSONAS, 16)
        self.occasion_emb = nn.Embedding(NUM_OCCASIONS, 16)
        self.vibe_emb = nn.Embedding(NUM_VIBES, 16)
        self.color_energy_emb = nn.Embedding(NUM_COLOR_ENERGIES, 16)
        # 16 * 4 = 64 → output_dim
        self.fc = nn.Linear(64, output_dim)

    def forward(
        self, persona: torch.Tensor, occasion: torch.Tensor,
        vibe: torch.Tensor, color_energy: torch.Tensor
    ) -> torch.Tensor:
        p = self.persona_emb(persona)
        o = self.occasion_emb(occasion)
        v = self.vibe_emb(vibe)
        c = self.color_energy_emb(color_energy)
        combined = torch.cat([p, o, v, c], dim=-1)
        return F.relu(self.fc(combined))


class ContextEncoder(nn.Module):
    """Encodes environmental context (weather, temperature, city)."""

    def __init__(self, output_dim: int = 32):
        super().__init__()
        self.temp_emb = nn.Embedding(NUM_TEMP_RANGES, 8)
        self.weather_emb = nn.Embedding(NUM_WEATHER, 8)
        self.city_emb = nn.Embedding(NUM_CITIES, 8)
        self.fc = nn.Linear(24, output_dim)

    def forward(
        self, temp_range: torch.Tensor, weather: torch.Tensor,
        city: torch.Tensor
    ) -> torch.Tensor:
        t = self.temp_emb(temp_range)
        w = self.weather_emb(weather)
        c = self.city_emb(city)
        combined = torch.cat([t, w, c], dim=-1)
        return F.relu(self.fc(combined))


# ---------- Full Model ----------


class StyleEmbeddingModel(nn.Module):
    """Full style embedding model combining all encoders.

    Architecture:
        OutfitEncoder(128) + SignalEncoder(64) + ContextEncoder(32) = 224
        → Dense(128) → ReLU → Dropout → Dense(64) → L2-normalize
    """

    def __init__(self, embedding_dim: int = 64):
        super().__init__()
        self.outfit_encoder = OutfitEncoder(item_dim=32, output_dim=128)
        self.signal_encoder = SignalEncoder(output_dim=64)
        self.context_encoder = ContextEncoder(output_dim=32)

        # Fusion: 128 + 64 + 32 = 224 → embedding_dim
        self.fusion = nn.Sequential(
            nn.Linear(224, 128),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(128, embedding_dim),
        )
        self.embedding_dim = embedding_dim

    def forward(
        self,
        # Outfit inputs
        category_idx: torch.Tensor,
        fabric_idx: torch.Tensor,
        style_idx: torch.Tensor,
        color_rgb: torch.Tensor,
        item_mask: torch.Tensor,
        # Signal inputs
        persona: torch.Tensor,
        occasion: torch.Tensor,
        vibe: torch.Tensor,
        color_energy: torch.Tensor,
        # Context inputs
        temp_range: torch.Tensor,
        weather: torch.Tensor,
        city: torch.Tensor,
    ) -> torch.Tensor:
        """Compute style embedding vector.

        Returns:
            (batch, embedding_dim) L2-normalized embedding
        """
        outfit_emb = self.outfit_encoder(
            category_idx, fabric_idx, style_idx, color_rgb, item_mask
        )
        signal_emb = self.signal_encoder(persona, occasion, vibe, color_energy)
        context_emb = self.context_encoder(temp_range, weather, city)

        combined = torch.cat([outfit_emb, signal_emb, context_emb], dim=-1)
        embedding = self.fusion(combined)
        return F.normalize(embedding, p=2, dim=-1)


# ---------- Embedding Service ----------


class EmbeddingService:
    """Service wrapper for computing and managing embeddings."""

    def __init__(self):
        self.model: Optional[StyleEmbeddingModel] = None
        self.device = torch.device("cpu")

    def load_model(self, model_dir: Optional[str] = None) -> None:
        """Load a trained model from disk."""
        if model_dir is None:
            model_dir = os.path.join(settings.model_dir, "embeddings", "v1")

        model_path = os.path.join(model_dir, "model.pth")
        config_path = os.path.join(model_dir, "config.json")
        vocab_path = os.path.join(model_dir, "fabric_vocab.json")

        if os.path.exists(config_path):
            with open(config_path) as f:
                config = json.load(f)
            dim = config.get("embedding_dim", settings.embedding_dim)
        else:
            dim = settings.embedding_dim

        self.model = StyleEmbeddingModel(embedding_dim=dim)

        if os.path.exists(model_path):
            state_dict = torch.load(model_path, map_location=self.device, weights_only=True)
            self.model.load_state_dict(state_dict)
            logger.info("loaded_embedding_model", path=model_path)
        else:
            logger.warning("no_model_found_using_random_init", path=model_path)

        if os.path.exists(vocab_path):
            fabric_vocab.load(vocab_path)

        self.model.eval()

    def initialize_fresh(self) -> None:
        """Initialize with random weights (for bootstrap/cold start)."""
        self.model = StyleEmbeddingModel(embedding_dim=settings.embedding_dim)
        self.model.eval()
        logger.info("initialized_fresh_model", dim=settings.embedding_dim)

    @torch.no_grad()
    def compute_embedding(self, outfit: dict, context: dict) -> np.ndarray:
        """Compute embedding for a single outfit + context.

        Args:
            outfit: dict with 'items' list
            context: dict with persona, occasion, vibe, etc.

        Returns:
            64-dim numpy array (L2-normalized)
        """
        if self.model is None:
            self.initialize_fresh()

        batch = self._prepare_single_input(outfit, context)
        embedding = self.model(**batch)
        return embedding.squeeze(0).numpy()

    @torch.no_grad()
    def compute_embeddings_batch(
        self, outfits: list[dict], contexts: list[dict]
    ) -> np.ndarray:
        """Compute embeddings for a batch.

        Returns:
            (N, 64) numpy array
        """
        if self.model is None:
            self.initialize_fresh()

        batch = self._prepare_batch_input(outfits, contexts)
        embeddings = self.model(**batch)
        return embeddings.numpy()

    @torch.no_grad()
    def compute_signal_embedding(self, context: dict) -> np.ndarray:
        """Compute embedding from signals only (no outfit items).

        Used for similarity search: encode user signals → find nearest outfits.
        """
        if self.model is None:
            self.initialize_fresh()

        # Create a dummy outfit with neutral items
        dummy_outfit = {
            "items": [
                {"category": "top", "color": "#808080", "fabric": "cotton", "style": "basic"},
                {"category": "bottom", "color": "#808080", "fabric": "cotton", "style": "basic"},
                {"category": "footwear", "color": "#808080", "fabric": "leather", "style": "classic"},
            ]
        }
        return self.compute_embedding(dummy_outfit, context)

    def _prepare_single_input(self, outfit: dict, context: dict) -> dict:
        """Convert a single outfit+context to model input tensors."""
        items = outfit.get("items", [])
        max_items = 6

        # Pad to max_items
        categories, fabrics, styles, colors = [], [], [], []
        for i in range(max_items):
            if i < len(items):
                item = items[i]
                categories.append(CATEGORY_TO_IDX.get(item.get("category", "top"), 0))
                fabrics.append(fabric_vocab.encode(item.get("fabric", "")))
                styles.append(style_vocab.encode(item.get("style", "")))
                colors.append(_parse_color(item.get("colorHex", item.get("color", "#808080"))))
            else:
                categories.append(0)
                fabrics.append(1)  # PAD
                styles.append(1)  # PAD
                colors.append([0.5, 0.5, 0.5])

        mask = [i < len(items) for i in range(max_items)]

        # Signal indices
        vibe_val = context.get("vibe", "minimal")
        if isinstance(context.get("vibes"), list) and context["vibes"]:
            vibe_val = context["vibes"][0]

        return {
            "category_idx": torch.tensor([categories], dtype=torch.long),
            "fabric_idx": torch.tensor([fabrics], dtype=torch.long),
            "style_idx": torch.tensor([styles], dtype=torch.long),
            "color_rgb": torch.tensor([colors], dtype=torch.float32),
            "item_mask": torch.tensor([mask], dtype=torch.bool),
            "persona": torch.tensor([PERSONA_TO_IDX.get(context.get("persona", "casual"), 0)]),
            "occasion": torch.tensor([OCCASION_TO_IDX.get(context.get("occasion", "hangout"), 1)]),
            "vibe": torch.tensor([VIBE_TO_IDX.get(vibe_val, 0)]),
            "color_energy": torch.tensor([COLOR_ENERGY_TO_IDX.get(context.get("colorEnergy", "cool_calm"), 4)]),
            "temp_range": torch.tensor([TEMP_RANGE_TO_IDX.get(context.get("temperatureRange", "mild"), 2)]),
            "weather": torch.tensor([_weather_to_idx(context.get("weatherCondition", "clear"))]),
            "city": torch.tensor([_city_to_idx(context.get("cityId", "new-york-ny"))]),
        }

    def _prepare_batch_input(self, outfits: list[dict], contexts: list[dict]) -> dict:
        """Convert a batch of outfits+contexts to model input tensors."""
        batch_tensors = [self._prepare_single_input(o, c) for o, c in zip(outfits, contexts)]
        return {
            key: torch.cat([bt[key] for bt in batch_tensors], dim=0)
            for key in batch_tensors[0].keys()
        }


def _parse_color(color: str) -> list[float]:
    """Parse a hex color string to normalized RGB [0-1]."""
    color = color.lstrip("#")
    if len(color) != 6:
        return [0.5, 0.5, 0.5]
    try:
        r, g, b = int(color[0:2], 16), int(color[2:4], 16), int(color[4:6], 16)
        return [r / 255.0, g / 255.0, b / 255.0]
    except ValueError:
        return [0.5, 0.5, 0.5]


WEATHER_TO_IDX = {
    "clear": 0, "partly_cloudy": 1, "cloudy": 2, "overcast": 3,
    "light_rain": 4, "rain": 5, "heavy_rain": 6, "thunderstorm": 7,
    "snow": 8, "sleet": 9, "fog": 10, "windy": 11,
}

CITY_TO_IDX = {
    "new-york-ny": 0, "los-angeles-ca": 1, "chicago-il": 2, "miami-fl": 3,
    "san-francisco-ca": 4, "seattle-wa": 5, "austin-tx": 6, "boston-ma": 7,
    "denver-co": 8, "nashville-tn": 9, "atlanta-ga": 10, "portland-or": 11,
}


def _weather_to_idx(weather: str) -> int:
    return WEATHER_TO_IDX.get(weather, 0)


def _city_to_idx(city: str) -> int:
    return CITY_TO_IDX.get(city, 0)


# ---------- Similarity Search ----------


def cosine_similarity_search(
    query_vector: np.ndarray,
    candidate_vectors: np.ndarray,
    top_k: int = 10,
) -> list[tuple[int, float]]:
    """Brute-force cosine similarity search.

    Args:
        query_vector: (64,) query embedding
        candidate_vectors: (N, 64) candidate embeddings

    Returns:
        List of (index, similarity) tuples, sorted by similarity desc
    """
    if len(candidate_vectors) == 0:
        return []

    # Compute cosine similarities (vectors are already L2-normalized)
    similarities = candidate_vectors @ query_vector
    top_indices = np.argsort(similarities)[::-1][:top_k]
    return [(int(idx), float(similarities[idx])) for idx in top_indices]
