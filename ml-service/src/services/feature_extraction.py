"""Feature extraction pipeline for ML models.

Extracts 56 features from outfit bundles for quality scoring:
- Outfit features (16): color harmony, fabric variety, category coverage, etc.
- Signal features (19): one-hot persona/vibe/colorEnergy + formality score
- Weather features (4): temp ordinal, humidity, precipitation, UV
- Context features (17): one-hot city + month + weekend
"""

import numpy as np
from typing import Any
from colorsys import rgb_to_hsv

from src.utils.logger import get_logger

logger = get_logger("feature_extraction")

# ---------- Taxonomy Mappings ----------

PERSONAS = [
    "casual", "professional", "athletic", "business-casual",
    "street-style", "elevated-casual", "athleisure",
]

OCCASIONS = [
    "work", "hangout", "active", "dinner",
    "errands", "home", "date", "formal",
]

VIBES = ["minimal", "polished", "laid_back", "bold", "romantic", "creative"]

COLOR_ENERGIES = [
    "dark_moody", "light_airy", "bold_vibrant",
    "earthy_warm", "cool_calm", "rich_deep",
]

CITIES = [
    "new-york-ny", "los-angeles-ca", "chicago-il", "miami-fl",
    "san-francisco-ca", "seattle-wa", "austin-tx", "boston-ma",
    "denver-co", "nashville-tn", "atlanta-ga", "portland-or",
]

TEMP_RANGES = ["cold", "cool", "mild", "warm", "hot"]

WEATHER_CONDITIONS = [
    "clear", "partly_cloudy", "cloudy", "overcast",
    "light_rain", "rain", "heavy_rain", "thunderstorm",
    "snow", "sleet", "fog", "windy",
]

CATEGORIES = ["top", "bottom", "outerwear", "footwear", "accessory", "dress"]

OCCASION_FORMALITY = {
    "formal": 95, "work": 75, "dinner": 65, "date": 60,
    "business-casual": 55, "hangout": 40, "errands": 30,
    "active": 25, "home": 15,
}

COLD_WEATHER_FABRICS = {"wool", "cashmere", "fleece", "down", "leather", "corduroy", "tweed"}
WARM_WEATHER_FABRICS = {"linen", "cotton", "silk", "rayon", "chambray", "seersucker"}
RAIN_ITEMS = {"raincoat", "umbrella", "rain jacket", "waterproof", "gore-tex"}


def extract_features(bundle: dict) -> np.ndarray:
    """Extract a 56-dimensional feature vector from an outfit bundle.

    Args:
        bundle: A PrecomputedOutfitBundle-shaped dict with keys:
            - outfits: list of outfit dicts, each with 'items' list
            - context: dict with persona, occasion, vibe, cityId, etc.

    Returns:
        numpy array of shape (56,) with float features
    """
    context = bundle.get("context", {})
    outfits = bundle.get("outfits", [])
    primary_outfit = outfits[0] if outfits else {}
    items = primary_outfit.get("items", [])

    features = []

    # 1. Outfit features (16 features)
    features.extend(_extract_outfit_features(items))

    # 2. Signal features (19 features)
    features.extend(_extract_signal_features(context))

    # 3. Weather features (4 features)
    features.extend(_extract_weather_features(context))

    # 4. Context features (17 features)
    features.extend(_extract_context_features(context))

    arr = np.array(features, dtype=np.float32)
    assert arr.shape == (56,), f"Expected 56 features, got {arr.shape[0]}"
    return arr


def extract_features_batch(bundles: list[dict]) -> np.ndarray:
    """Extract features for a batch of bundles.

    Returns:
        numpy array of shape (N, 56)
    """
    return np.stack([extract_features(b) for b in bundles])


# ---------- Outfit Features (16) ----------


def _extract_outfit_features(items: list[dict]) -> list[float]:
    """Extract 16 features from outfit items."""
    if not items:
        return [0.0] * 16

    # Color-based features
    colors = [item.get("color", "") for item in items]
    color_hexes = [item.get("colorHex", "") for item in items if item.get("colorHex")]
    unique_colors = len(set(c.lower() for c in colors if c))

    # Fabric-based features
    fabrics = [item.get("fabric", "").lower() for item in items if item.get("fabric")]
    unique_fabrics = len(set(fabrics))

    # Category-based features
    categories = [item.get("category", "") for item in items]
    unique_categories = len(set(categories))
    has_all_core = all(
        any(c == cat for c in categories)
        for cat in ["top", "bottom", "footwear"]
    )

    # Style features
    styles = [item.get("style", "").lower() for item in items if item.get("style")]
    unique_styles = len(set(styles))

    # Brand features
    brands = [item.get("brand", "").lower() for item in items if item.get("brand")]
    unique_brands = len(set(brands))

    # Color harmony (computed from hex values)
    color_harmony = _compute_color_harmony(color_hexes)
    color_contrast = _compute_color_contrast(color_hexes)
    monochrome_ratio = 1.0 - (unique_colors / max(len(colors), 1))

    # Outerwear presence
    has_outerwear = float(any(c == "outerwear" for c in categories))
    has_accessory = float(any(c == "accessory" for c in categories))

    # Item count features
    item_count = len(items)
    item_count_normalized = min(item_count / 6.0, 1.0)

    return [
        unique_colors / 6.0,                    # 1: color diversity
        unique_fabrics / 4.0,                    # 2: fabric variety
        unique_categories / 6.0,                 # 3: category diversity
        float(has_all_core),                     # 4: has core pieces
        unique_styles / 4.0,                     # 5: style variety
        unique_brands / 6.0,                     # 6: brand diversity
        color_harmony / 100.0,                   # 7: color harmony score
        color_contrast / 100.0,                  # 8: color contrast
        monochrome_ratio,                        # 9: monochrome ratio
        has_outerwear,                           # 10: has outerwear
        has_accessory,                           # 11: has accessories
        item_count_normalized,                   # 12: item count
        _fabric_coherence(fabrics),              # 13: fabric coherence
        _has_cold_weather_fabrics(fabrics),       # 14: cold-weather fabrics
        _has_warm_weather_fabrics(fabrics),       # 15: warm-weather fabrics
        _has_rain_protection(items),             # 16: rain protection
    ]


# ---------- Signal Features (19) ----------


def _extract_signal_features(context: dict) -> list[float]:
    """Extract 19 features from signal context.

    7 (persona one-hot) + 6 (vibe one-hot) + 6 (colorEnergy one-hot) = 19
    Note: occasion formality is encoded as a scalar in context features.
    """
    persona = context.get("persona", "")
    vibe = context.get("vibe", context.get("vibes", [""])[0] if isinstance(context.get("vibes"), list) else "")
    color_energy = context.get("colorEnergy", "")

    features = []

    # Persona one-hot (7)
    features.extend(_one_hot(persona, PERSONAS))

    # Vibe one-hot (6)
    features.extend(_one_hot(vibe, VIBES))

    # Color energy one-hot (6)
    features.extend(_one_hot(color_energy, COLOR_ENERGIES))

    return features


# ---------- Weather Features (4) ----------


def _extract_weather_features(context: dict) -> list[float]:
    """Extract 4 weather features."""
    temp_range = context.get("temperatureRange", "mild")
    weather = context.get("weatherCondition", "clear")

    # Temperature as ordinal (0-1 scale)
    temp_ordinal = TEMP_RANGES.index(temp_range) / 4.0 if temp_range in TEMP_RANGES else 0.5

    # Precipitation likelihood
    rainy_conditions = {"light_rain", "rain", "heavy_rain", "thunderstorm", "sleet"}
    is_rainy = float(weather in rainy_conditions)

    # Cold indicator
    is_cold = float(temp_range in ("cold", "cool"))

    # Severe weather indicator
    severe = {"heavy_rain", "thunderstorm", "snow", "sleet"}
    is_severe = float(weather in severe)

    return [temp_ordinal, is_rainy, is_cold, is_severe]


# ---------- Context Features (17) ----------


def _extract_context_features(context: dict) -> list[float]:
    """Extract 17 context features.

    12 (city one-hot) + 1 (occasion formality) + 1 (month) + 1 (weekend)
    + 1 (temp-occasion alignment) + 1 (city formality match) = 17
    """
    city_id = context.get("cityId", "")
    occasion = context.get("occasion", "")
    date_str = context.get("date", "")

    features = []

    # City one-hot (12)
    features.extend(_one_hot(city_id, CITIES))

    # Occasion formality (1)
    formality = OCCASION_FORMALITY.get(occasion, 50) / 100.0
    features.append(formality)

    # Month normalized (1)
    month = _extract_month(date_str) / 12.0
    features.append(month)

    # Weekend indicator (1)
    features.append(_is_weekend(date_str))

    # Temperature-occasion alignment (1)
    # E.g., active + hot = good alignment, formal + hot = less ideal
    temp_range = context.get("temperatureRange", "mild")
    features.append(_temp_occasion_alignment(temp_range, occasion))

    # City formality match (1)
    # Higher for professional outfits in NYC, casual in LA
    features.append(_city_formality_match(city_id, occasion))

    return features


# ---------- Helper Functions ----------


def _one_hot(value: str, categories: list[str]) -> list[float]:
    """Create one-hot encoding for a categorical value."""
    return [1.0 if value == cat else 0.0 for cat in categories]


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    """Convert hex color to RGB tuple."""
    hex_color = hex_color.lstrip("#")
    if len(hex_color) != 6:
        return (128, 128, 128)
    try:
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    except ValueError:
        return (128, 128, 128)


def _compute_color_harmony(hex_colors: list[str]) -> float:
    """Score color harmony (0-100) based on hue relationships."""
    if len(hex_colors) < 2:
        return 70.0  # Default for single-color outfits

    hues = []
    for hc in hex_colors:
        r, g, b = _hex_to_rgb(hc)
        h, s, v = rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
        hues.append(h * 360)

    # Check for complementary, analogous, or triadic relationships
    score = 60.0
    for i in range(len(hues)):
        for j in range(i + 1, len(hues)):
            diff = abs(hues[i] - hues[j])
            diff = min(diff, 360 - diff)

            if diff < 30:  # Analogous
                score += 10
            elif 150 < diff < 210:  # Complementary
                score += 8
            elif 110 < diff < 130:  # Triadic
                score += 6

    return min(score, 100.0)


def _compute_color_contrast(hex_colors: list[str]) -> float:
    """Score color contrast (0-100) based on lightness variation."""
    if len(hex_colors) < 2:
        return 50.0

    lightness_values = []
    for hc in hex_colors:
        r, g, b = _hex_to_rgb(hc)
        lightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
        lightness_values.append(lightness)

    contrast = max(lightness_values) - min(lightness_values)
    return min(contrast * 100, 100.0)


def _fabric_coherence(fabrics: list[str]) -> float:
    """Score how well fabrics go together (0-1)."""
    if len(fabrics) < 2:
        return 0.7
    cold_count = sum(1 for f in fabrics if f in COLD_WEATHER_FABRICS)
    warm_count = sum(1 for f in fabrics if f in WARM_WEATHER_FABRICS)
    if cold_count > 0 and warm_count > 0:
        return 0.3  # Mixed seasonal fabrics
    return 0.8


def _has_cold_weather_fabrics(fabrics: list[str]) -> float:
    return float(any(f in COLD_WEATHER_FABRICS for f in fabrics))


def _has_warm_weather_fabrics(fabrics: list[str]) -> float:
    return float(any(f in WARM_WEATHER_FABRICS for f in fabrics))


def _has_rain_protection(items: list[dict]) -> float:
    """Check if outfit includes rain protection items."""
    for item in items:
        name = (item.get("name", "") + " " + item.get("description", "")).lower()
        if any(r in name for r in RAIN_ITEMS):
            return 1.0
    return 0.0


def _extract_month(date_str: str) -> float:
    """Extract month from YYYY-MM-DD date string."""
    try:
        return float(date_str.split("-")[1])
    except (IndexError, ValueError):
        return 6.0  # Default to June


def _is_weekend(date_str: str) -> float:
    """Check if date is a weekend."""
    try:
        from datetime import datetime
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        return float(dt.weekday() >= 5)
    except (ValueError, TypeError):
        return 0.0


def _temp_occasion_alignment(temp_range: str, occasion: str) -> float:
    """Score how well temperature aligns with occasion (0-1)."""
    # Outdoor/active occasions align better with mild weather
    outdoor_occasions = {"active", "hangout", "errands"}
    indoor_occasions = {"work", "formal", "home"}

    if occasion in outdoor_occasions and temp_range in ("mild", "warm"):
        return 0.9
    elif occasion in indoor_occasions:
        return 0.7  # Indoor occasions are weather-agnostic
    elif temp_range in ("cold", "hot") and occasion in outdoor_occasions:
        return 0.4
    return 0.6


CITY_FORMALITY_BASELINE = {
    "new-york-ny": 75, "los-angeles-ca": 35, "chicago-il": 60,
    "miami-fl": 40, "san-francisco-ca": 45, "seattle-wa": 40,
    "austin-tx": 35, "boston-ma": 60, "denver-co": 40,
    "nashville-tn": 45, "atlanta-ga": 50, "portland-or": 35,
}


def _city_formality_match(city_id: str, occasion: str) -> float:
    """Score alignment between city formality and occasion formality."""
    city_formality = CITY_FORMALITY_BASELINE.get(city_id, 50)
    occasion_formality = OCCASION_FORMALITY.get(occasion, 50)
    diff = abs(city_formality - occasion_formality)
    return max(0, 1.0 - diff / 100.0)


def get_feature_names() -> list[str]:
    """Return ordered list of feature names for model interpretability."""
    names = []

    # Outfit features (16)
    names.extend([
        "color_diversity", "fabric_variety", "category_diversity",
        "has_core_pieces", "style_variety", "brand_diversity",
        "color_harmony", "color_contrast", "monochrome_ratio",
        "has_outerwear", "has_accessory", "item_count",
        "fabric_coherence", "cold_weather_fabrics", "warm_weather_fabrics",
        "rain_protection",
    ])

    # Signal features (19)
    names.extend([f"persona_{p}" for p in PERSONAS])
    names.extend([f"vibe_{v}" for v in VIBES])
    names.extend([f"color_energy_{ce}" for ce in COLOR_ENERGIES])

    # Weather features (4)
    names.extend(["temp_ordinal", "is_rainy", "is_cold", "is_severe"])

    # Context features (17)
    names.extend([f"city_{c}" for c in CITIES])
    names.extend([
        "occasion_formality", "month", "is_weekend",
        "temp_occasion_alignment", "city_formality_match",
    ])

    assert len(names) == 56
    return names
