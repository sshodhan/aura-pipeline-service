"""Personalization model for user-specific outfit re-ranking.

Builds user preference vectors from feedback history and re-ranks
outfit candidates using cosine similarity + diversity constraints.
"""

import numpy as np
from typing import Optional
from datetime import datetime, timedelta

from src.config import settings
from src.models.style_embeddings import EmbeddingService, cosine_similarity_search
from src.services import redis_client, postgres_client
from src.utils.logger import get_logger

logger = get_logger("personalization")


# ---------- Default Profile ----------

DEFAULT_PROFILE = {
    "persona_preferences": {},
    "color_preferences": {"liked": [], "disliked": []},
    "style_preferences": {},
    "preference_vector": None,
    "feedback_count": 0,
    "confidence": 0.0,
    "last_updated": None,
}

# Action weights for preference learning
ACTION_WEIGHTS = {
    "liked": 1.0,
    "saved": 1.2,
    "shared": 1.5,
    "disliked": -1.0,
    "skipped": -0.3,
}


class PersonalizationService:
    """Manages user preference profiles and outfit re-ranking."""

    def __init__(self, embedding_service: EmbeddingService):
        self.embedding_service = embedding_service

    async def record_feedback(
        self,
        user_id: str,
        outfit_id: str,
        action: str,
        context: Optional[dict] = None,
        metadata: Optional[dict] = None,
    ) -> dict:
        """Record user feedback and update preference profile.

        Args:
            user_id: Unique user identifier
            outfit_id: Outfit that received feedback
            action: One of 'liked', 'disliked', 'saved', 'shared', 'skipped'
            context: Signal context (persona, occasion, etc.)
            metadata: Extra data (timeSpentMs, viewCount, etc.)

        Returns:
            Updated user profile summary
        """
        # Store in PostgreSQL
        feedback_id = await postgres_client.store_feedback(
            user_id=user_id,
            outfit_id=outfit_id,
            action=action,
            context=context,
            metadata=metadata,
        )

        # Update user profile in Redis
        profile = await self._update_user_profile(user_id)

        return {
            "feedback_id": feedback_id,
            "user_id": user_id,
            "profile_updated": True,
            "feedback_count": profile.get("feedback_count", 0),
            "confidence": profile.get("confidence", 0.0),
        }

    async def get_user_profile(self, user_id: str) -> dict:
        """Get the current user preference profile."""
        profile = await redis_client.get_user_profile(user_id)
        if profile is None:
            return {**DEFAULT_PROFILE, "user_id": user_id}
        return profile

    async def rerank_outfits(
        self,
        user_id: str,
        candidates: list[dict],
        top_k: int = 5,
    ) -> list[dict]:
        """Re-rank outfit candidates based on user preferences.

        Args:
            user_id: User for personalization
            candidates: List of outfit dicts with 'outfitId', 'qualityScore',
                        'outfit' (items), 'context' (signals)
            top_k: Number of results to return

        Returns:
            Re-ranked list of outfits with personalization scores and reasons
        """
        profile = await self.get_user_profile(user_id)

        # If insufficient feedback, return original order
        if profile.get("feedback_count", 0) < settings.personalization_min_feedback:
            logger.debug(
                "insufficient_feedback_for_personalization",
                user_id=user_id,
                feedback_count=profile.get("feedback_count", 0),
            )
            return [
                {
                    **candidate,
                    "personalizedRank": i + 1,
                    "personalizedScore": candidate.get("qualityScore", 50),
                    "personalized": False,
                    "reasons": ["Not enough feedback for personalization yet"],
                }
                for i, candidate in enumerate(candidates[:top_k])
            ]

        preference_vector = profile.get("preference_vector")
        if preference_vector is None:
            return candidates[:top_k]

        pref_vec = np.array(preference_vector, dtype=np.float32)

        # Score each candidate
        scored = []
        for i, candidate in enumerate(candidates):
            outfit = candidate.get("outfit", {})
            context = candidate.get("context", {})

            # Compute outfit embedding
            embedding = self.embedding_service.compute_embedding(outfit, context)

            # Cosine similarity to user preference vector
            similarity = float(np.dot(embedding, pref_vec))

            # Quality score component
            quality = candidate.get("qualityScore", 50) / 100.0

            # Color preference penalty/boost
            color_bonus = self._compute_color_bonus(outfit, profile)

            # Combined personalized score
            personalized_score = (
                similarity * 0.5
                + quality * 0.3
                + color_bonus * 0.2
            ) * 100

            reasons = self._generate_reasons(similarity, quality, color_bonus, profile)

            scored.append({
                **candidate,
                "originalRank": i + 1,
                "personalizedScore": round(personalized_score, 1),
                "similarity": round(similarity, 3),
                "reasons": reasons,
                "personalized": True,
            })

        # Sort by personalized score
        scored.sort(key=lambda x: x["personalizedScore"], reverse=True)

        # Apply diversity constraint: max 2 outfits with same dominant color
        diversified = self._apply_diversity(scored, top_k)

        # Assign final ranks
        for i, item in enumerate(diversified):
            item["personalizedRank"] = i + 1

        return diversified

    async def _update_user_profile(self, user_id: str) -> dict:
        """Rebuild user preference profile from feedback history."""
        # Fetch recent feedback
        feedback = await postgres_client.get_user_feedback(
            user_id=user_id,
            limit=200,
            since=datetime.utcnow() - timedelta(days=90),
        )

        if not feedback:
            return DEFAULT_PROFILE

        # Aggregate preferences
        persona_scores: dict[str, float] = {}
        color_liked: list[str] = []
        color_disliked: list[str] = []
        style_scores: dict[str, float] = {}
        outfit_embeddings_weighted: list[tuple[np.ndarray, float]] = []

        for i, fb in enumerate(feedback):
            action = fb["action"]
            weight = ACTION_WEIGHTS.get(action, 0.0)

            # Time decay: more recent feedback counts more
            decay = settings.feedback_decay_factor ** i

            context = fb.get("context") or {}
            weighted = weight * decay

            # Persona preferences
            persona = context.get("persona")
            if persona:
                persona_scores[persona] = persona_scores.get(persona, 0) + weighted

            # Color preferences from outfit items
            outfit_data = fb.get("metadata", {}).get("outfit", {})
            if outfit_data:
                for item in outfit_data.get("items", []):
                    color = item.get("colorHex", "")
                    if color:
                        if weight > 0:
                            color_liked.append(color)
                        elif weight < 0:
                            color_disliked.append(color)

                # Compute embedding for this outfit
                try:
                    emb = self.embedding_service.compute_embedding(outfit_data, context)
                    outfit_embeddings_weighted.append((emb, weighted))
                except Exception:
                    pass

            # Style preferences
            style = context.get("vibe")
            if style:
                style_scores[style] = style_scores.get(style, 0) + weighted

        # Compute preference vector as weighted average of outfit embeddings
        preference_vector = None
        if outfit_embeddings_weighted:
            total_weight = sum(abs(w) for _, w in outfit_embeddings_weighted)
            if total_weight > 0:
                weighted_sum = sum(
                    emb * w for emb, w in outfit_embeddings_weighted
                )
                preference_vector = weighted_sum / total_weight
                # L2 normalize
                norm = np.linalg.norm(preference_vector)
                if norm > 0:
                    preference_vector = preference_vector / norm

        # Normalize persona and style scores to 0-1
        if persona_scores:
            max_p = max(abs(v) for v in persona_scores.values())
            if max_p > 0:
                persona_scores = {k: (v / max_p + 1) / 2 for k, v in persona_scores.items()}

        if style_scores:
            max_s = max(abs(v) for v in style_scores.values())
            if max_s > 0:
                style_scores = {k: (v / max_s + 1) / 2 for k, v in style_scores.items()}

        feedback_count = len(feedback)
        confidence = min(feedback_count / 50.0, 1.0)  # Full confidence at 50 feedbacks

        profile = {
            "user_id": user_id,
            "persona_preferences": persona_scores,
            "color_preferences": {
                "liked": list(set(color_liked))[:20],
                "disliked": list(set(color_disliked))[:10],
            },
            "style_preferences": style_scores,
            "preference_vector": preference_vector.tolist() if preference_vector is not None else None,
            "feedback_count": feedback_count,
            "confidence": round(confidence, 3),
            "last_updated": datetime.utcnow().isoformat(),
        }

        # Cache in Redis
        await redis_client.store_user_profile(user_id, profile)

        logger.info(
            "user_profile_updated",
            user_id=user_id,
            feedback_count=feedback_count,
            confidence=confidence,
        )
        return profile

    def _compute_color_bonus(self, outfit: dict, profile: dict) -> float:
        """Compute color preference bonus/penalty (-1 to 1)."""
        color_prefs = profile.get("color_preferences", {})
        liked = set(c.lower() for c in color_prefs.get("liked", []))
        disliked = set(c.lower() for c in color_prefs.get("disliked", []))

        if not liked and not disliked:
            return 0.0

        items = outfit.get("items", [])
        bonus = 0.0
        count = 0

        for item in items:
            color = (item.get("colorHex", "") or "").lower()
            if not color:
                continue
            count += 1
            if color in liked:
                bonus += 1.0
            elif color in disliked:
                bonus -= 1.0

        return bonus / max(count, 1)

    def _generate_reasons(
        self, similarity: float, quality: float, color_bonus: float, profile: dict
    ) -> list[str]:
        """Generate human-readable reasons for ranking."""
        reasons = []

        if similarity > 0.8:
            reasons.append("Strongly matches your style preferences")
        elif similarity > 0.6:
            reasons.append("Good match with your style preferences")

        if quality > 0.8:
            reasons.append("High-quality outfit composition")

        if color_bonus > 0.3:
            reasons.append("Uses colors you tend to prefer")
        elif color_bonus < -0.3:
            reasons.append("Contains colors you've disliked before")

        top_persona = max(
            profile.get("persona_preferences", {}).items(),
            key=lambda x: x[1],
            default=None,
        )
        if top_persona and top_persona[1] > 0.7:
            reasons.append(f"Aligns with your {top_persona[0]} style identity")

        if not reasons:
            reasons.append("General recommendation")

        return reasons

    def _apply_diversity(self, scored: list[dict], top_k: int) -> list[dict]:
        """Apply diversity constraint to avoid repetitive recommendations."""
        selected = []
        color_counts: dict[str, int] = {}

        for item in scored:
            if len(selected) >= top_k:
                break

            # Get dominant color
            outfit = item.get("outfit", {})
            items = outfit.get("items", [])
            dominant_color = ""
            if items:
                dominant_color = items[0].get("color", "").lower()

            # Check diversity constraint
            if dominant_color and color_counts.get(dominant_color, 0) >= 2:
                continue

            selected.append(item)
            if dominant_color:
                color_counts[dominant_color] = color_counts.get(dominant_color, 0) + 1

        # If diversity filtering removed too many, backfill
        if len(selected) < top_k:
            for item in scored:
                if item not in selected and len(selected) < top_k:
                    selected.append(item)

        return selected
