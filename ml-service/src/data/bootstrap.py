"""Bootstrap data generation for cold-start model training.

Generates synthetic training data from the signal taxonomy and
rule-based quality heuristics to train initial ML models.
"""

import random
import numpy as np
from typing import Optional
from itertools import product

from src.services.feature_extraction import (
    PERSONAS, OCCASIONS, VIBES, COLOR_ENERGIES,
    TEMP_RANGES, WEATHER_CONDITIONS, CITIES, CATEGORIES,
    OCCASION_FORMALITY,
)
from src.utils.logger import get_logger

logger = get_logger("bootstrap")

# Outfit item templates organized by formality level
ITEM_TEMPLATES = {
    "formal_tops": [
        {"category": "top", "name": "Tailored Blazer", "color": "Navy", "colorHex": "#1B2A4A", "fabric": "wool", "style": "tailored"},
        {"category": "top", "name": "Silk Blouse", "color": "Ivory", "colorHex": "#FFFFF0", "fabric": "silk", "style": "elegant"},
        {"category": "top", "name": "Dress Shirt", "color": "White", "colorHex": "#FFFFFF", "fabric": "cotton", "style": "classic"},
    ],
    "casual_tops": [
        {"category": "top", "name": "Cotton T-Shirt", "color": "Heather Gray", "colorHex": "#B6B6B4", "fabric": "cotton", "style": "relaxed"},
        {"category": "top", "name": "Linen Shirt", "color": "Light Blue", "colorHex": "#ADD8E6", "fabric": "linen", "style": "relaxed"},
        {"category": "top", "name": "Knit Sweater", "color": "Cream", "colorHex": "#FFFDD0", "fabric": "cashmere", "style": "cozy"},
    ],
    "active_tops": [
        {"category": "top", "name": "Performance Tee", "color": "Black", "colorHex": "#000000", "fabric": "polyester", "style": "athletic"},
        {"category": "top", "name": "Zip-Up Jacket", "color": "Charcoal", "colorHex": "#36454F", "fabric": "nylon", "style": "sporty"},
    ],
    "bottoms": [
        {"category": "bottom", "name": "Tailored Trousers", "color": "Charcoal", "colorHex": "#36454F", "fabric": "wool", "style": "tailored"},
        {"category": "bottom", "name": "Dark Jeans", "color": "Indigo", "colorHex": "#4B0082", "fabric": "denim", "style": "classic"},
        {"category": "bottom", "name": "Chinos", "color": "Khaki", "colorHex": "#C3B091", "fabric": "cotton", "style": "casual"},
        {"category": "bottom", "name": "Joggers", "color": "Black", "colorHex": "#000000", "fabric": "fleece", "style": "athletic"},
        {"category": "bottom", "name": "Wide-Leg Pants", "color": "Olive", "colorHex": "#808000", "fabric": "cotton", "style": "relaxed"},
    ],
    "footwear": [
        {"category": "footwear", "name": "Leather Oxfords", "color": "Brown", "colorHex": "#8B4513", "fabric": "leather", "style": "formal"},
        {"category": "footwear", "name": "White Sneakers", "color": "White", "colorHex": "#FFFFFF", "fabric": "leather", "style": "casual"},
        {"category": "footwear", "name": "Chelsea Boots", "color": "Black", "colorHex": "#000000", "fabric": "leather", "style": "classic"},
        {"category": "footwear", "name": "Running Shoes", "color": "Gray", "colorHex": "#808080", "fabric": "mesh", "style": "athletic"},
        {"category": "footwear", "name": "Loafers", "color": "Tan", "colorHex": "#D2B48C", "fabric": "suede", "style": "smart-casual"},
    ],
    "outerwear": [
        {"category": "outerwear", "name": "Wool Overcoat", "color": "Camel", "colorHex": "#C19A6B", "fabric": "wool", "style": "classic"},
        {"category": "outerwear", "name": "Rain Jacket", "color": "Navy", "colorHex": "#000080", "fabric": "nylon", "style": "utilitarian"},
        {"category": "outerwear", "name": "Denim Jacket", "color": "Medium Wash", "colorHex": "#6F8FAF", "fabric": "denim", "style": "casual"},
        {"category": "outerwear", "name": "Down Puffer", "color": "Black", "colorHex": "#000000", "fabric": "down", "style": "sporty"},
        {"category": "outerwear", "name": "Leather Jacket", "color": "Black", "colorHex": "#000000", "fabric": "leather", "style": "edgy"},
    ],
    "accessories": [
        {"category": "accessory", "name": "Leather Watch", "color": "Silver", "colorHex": "#C0C0C0", "fabric": "leather", "style": "classic"},
        {"category": "accessory", "name": "Canvas Tote", "color": "Natural", "colorHex": "#F5DEB3", "fabric": "canvas", "style": "casual"},
        {"category": "accessory", "name": "Silk Scarf", "color": "Burgundy", "colorHex": "#800020", "fabric": "silk", "style": "elegant"},
        {"category": "accessory", "name": "Baseball Cap", "color": "Black", "colorHex": "#000000", "fabric": "cotton", "style": "sporty"},
    ],
}

# Persona-occasion compatibility (from signals.ts)
PERSONA_OCCASION_COMPAT = {
    "casual": {"hangout", "errands", "home", "active"},
    "professional": {"work", "dinner", "formal"},
    "athletic": {"active", "errands", "hangout"},
    "business-casual": {"work", "dinner", "hangout", "errands"},
    "street-style": {"hangout", "dinner", "date", "errands"},
    "elevated-casual": {"dinner", "date", "hangout", "work"},
    "athleisure": {"active", "errands", "hangout", "home"},
}


def generate_outfit(
    persona: str,
    occasion: str,
    temp_range: str,
    weather: str,
    make_good: bool = True,
) -> dict:
    """Generate a synthetic outfit with items.

    Args:
        make_good: If True, generate a coherent outfit. If False, introduce mismatches.
    """
    items = []

    if make_good:
        items = _generate_coherent_outfit(persona, occasion, temp_range, weather)
    else:
        items = _generate_mismatched_outfit(persona, occasion, temp_range, weather)

    return {
        "id": f"synth-{random.randint(10000, 99999)}",
        "items": items,
        "stylingTips": "Synthetic outfit for training",
        "colorPalette": "mixed",
        "overallVibe": persona,
    }


def generate_bootstrap_bundles(
    n_samples: int = 5000,
    good_ratio: float = 0.6,
) -> list[dict]:
    """Generate synthetic outfit bundles for bootstrap training.

    Args:
        n_samples: Total number of bundles to generate
        good_ratio: Fraction of "good" (high-quality) bundles

    Returns:
        List of bundle dicts with qualityMetrics attached
    """
    logger.info("generating_bootstrap_data", n_samples=n_samples)
    bundles = []

    n_good = int(n_samples * good_ratio)
    n_bad = n_samples - n_good

    # Generate good bundles
    for i in range(n_good):
        persona = random.choice(PERSONAS)
        # Pick compatible occasion
        compatible = list(PERSONA_OCCASION_COMPAT.get(persona, OCCASIONS))
        occasion = random.choice(compatible) if compatible else random.choice(OCCASIONS)
        vibe = random.choice(VIBES)
        color_energy = random.choice(COLOR_ENERGIES)
        temp_range = random.choice(TEMP_RANGES)
        weather = random.choice(WEATHER_CONDITIONS)
        city = random.choice(CITIES)

        outfit = generate_outfit(persona, occasion, temp_range, weather, make_good=True)

        bundle = {
            "bundleId": f"bootstrap-good-{i}",
            "context": {
                "cityId": city,
                "date": "2026-03-12",
                "persona": persona,
                "occasion": occasion,
                "vibe": vibe,
                "vibes": [vibe],
                "colorEnergy": color_energy,
                "temperatureRange": temp_range,
                "weatherCondition": weather,
            },
            "outfits": [outfit],
            "qualityMetrics": {
                "confidenceScore": random.uniform(70, 95),
                "signalConsistency": random.uniform(70, 95),
                "weatherAppropriateness": random.uniform(70, 95),
                "occasionMatch": random.uniform(70, 95),
                "regionalRelevance": random.uniform(60, 85),
            },
        }
        bundles.append(bundle)

    # Generate bad bundles (with mismatches)
    for i in range(n_bad):
        persona = random.choice(PERSONAS)
        # Pick INCOMPATIBLE occasion for mismatch
        all_occasions = set(OCCASIONS)
        compatible = PERSONA_OCCASION_COMPAT.get(persona, set())
        incompatible = list(all_occasions - compatible)
        occasion = random.choice(incompatible) if incompatible else random.choice(OCCASIONS)
        vibe = random.choice(VIBES)
        color_energy = random.choice(COLOR_ENERGIES)
        temp_range = random.choice(TEMP_RANGES)
        weather = random.choice(WEATHER_CONDITIONS)
        city = random.choice(CITIES)

        outfit = generate_outfit(persona, occasion, temp_range, weather, make_good=False)

        bundle = {
            "bundleId": f"bootstrap-bad-{i}",
            "context": {
                "cityId": city,
                "date": "2026-03-12",
                "persona": persona,
                "occasion": occasion,
                "vibe": vibe,
                "vibes": [vibe],
                "colorEnergy": color_energy,
                "temperatureRange": temp_range,
                "weatherCondition": weather,
            },
            "outfits": [outfit],
            "qualityMetrics": {
                "confidenceScore": random.uniform(15, 45),
                "signalConsistency": random.uniform(20, 50),
                "weatherAppropriateness": random.uniform(20, 50),
                "occasionMatch": random.uniform(20, 45),
                "regionalRelevance": random.uniform(30, 60),
            },
        }
        bundles.append(bundle)

    random.shuffle(bundles)
    logger.info("bootstrap_data_generated", total=len(bundles), good=n_good, bad=n_bad)
    return bundles


def _generate_coherent_outfit(
    persona: str, occasion: str, temp_range: str, weather: str
) -> list[dict]:
    """Generate a coherent outfit matching signals and weather."""
    items = []

    # Select top based on persona formality
    formality = OCCASION_FORMALITY.get(occasion, 50)
    if formality >= 65:
        items.append(random.choice(ITEM_TEMPLATES["formal_tops"]).copy())
    elif persona in ("athletic", "athleisure"):
        items.append(random.choice(ITEM_TEMPLATES["active_tops"]).copy())
    else:
        items.append(random.choice(ITEM_TEMPLATES["casual_tops"]).copy())

    # Bottom
    items.append(random.choice(ITEM_TEMPLATES["bottoms"]).copy())

    # Footwear
    items.append(random.choice(ITEM_TEMPLATES["footwear"]).copy())

    # Outerwear if cold or rainy
    if temp_range in ("cold", "cool") or weather in ("rain", "heavy_rain", "light_rain"):
        items.append(random.choice(ITEM_TEMPLATES["outerwear"]).copy())

    # Accessory (50% chance)
    if random.random() > 0.5:
        items.append(random.choice(ITEM_TEMPLATES["accessories"]).copy())

    # Assign unique IDs
    for i, item in enumerate(items):
        item["id"] = f"item-{random.randint(1000, 9999)}-{i}"

    return items


def _generate_mismatched_outfit(
    persona: str, occasion: str, temp_range: str, weather: str
) -> list[dict]:
    """Generate a mismatched outfit with intentional issues."""
    items = []

    # Formality mismatch: athletic top for formal occasion
    if OCCASION_FORMALITY.get(occasion, 50) >= 65:
        items.append(random.choice(ITEM_TEMPLATES["active_tops"]).copy())
    else:
        items.append(random.choice(ITEM_TEMPLATES["formal_tops"]).copy())

    items.append(random.choice(ITEM_TEMPLATES["bottoms"]).copy())
    items.append(random.choice(ITEM_TEMPLATES["footwear"]).copy())

    # Weather mismatch: no outerwear in cold, or heavy outerwear in hot
    if temp_range == "hot":
        items.append(random.choice(ITEM_TEMPLATES["outerwear"]).copy())
    # No outerwear in cold (by omission)

    for i, item in enumerate(items):
        item["id"] = f"item-{random.randint(1000, 9999)}-{i}"

    return items
