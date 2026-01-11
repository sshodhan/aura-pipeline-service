/**
 * Outfit Models for AURA Pipeline
 *
 * Defines the structure of pre-computed outfit bundles.
 */

import type {
  SignalCombination,
  WeatherCondition,
  TemperatureRange,
} from "./signals";

// =============================================================================
// Outfit Item
// =============================================================================

export interface OutfitItem {
  id: string;
  category: "top" | "bottom" | "outerwear" | "footwear" | "accessory" | "dress";
  name: string;
  description: string;
  color: string;
  colorHex?: string;
  fabric?: string;
  style?: string;
  brand?: string;
  imageUrl?: string;
}

// =============================================================================
// Pre-computed Outfit
// =============================================================================

export interface PrecomputedOutfit {
  outfitId: string;
  rank: number; // 1 = primary recommendation

  items: OutfitItem[];

  styling: {
    overallVibe: string;
    colorStory: string;
    silhouetteProfile: string;
    occasionFit: string;
  };

  rationale: string; // AI-generated explanation

  // Personalization hooks for runtime customization
  personalizationSlots: {
    colorSwappable: boolean;
    accessoryOptional: boolean;
    layeringAdjustable: boolean;
  };
}

// =============================================================================
// Pre-computed Outfit Bundle
// =============================================================================

export interface PrecomputedOutfitBundle {
  bundleId: string;
  generatedAt: Date;
  expiresAt: Date;

  // Context keys (cache key components)
  context: {
    cityId: string;
    date: string; // YYYY-MM-DD
    weatherCondition: WeatherCondition;
    temperatureRange: TemperatureRange;

    // Signal combination
    persona: string;
    occasion: string;
    vibes: string[];
    colorEnergy?: string;
  };

  // Pre-computed outfits (multiple options per bundle)
  outfits: PrecomputedOutfit[];

  // Quality metadata
  qualityMetrics: {
    confidenceScore: number; // 0-100
    signalConsistency: number;
    weatherAppropriateness: number;
    occasionMatch: number;
    regionalRelevance: number;
  };

  // Fallback strategy
  fallback: {
    useRealTimeGeneration: boolean;
    similarBundles: string[];
  };
}

// =============================================================================
// Quality Metrics
// =============================================================================

export interface QualityMetrics {
  confidenceScore: number; // 0-100 overall
  signalConsistency: number; // 0-100
  weatherAppropriateness: number; // 0-100
  occasionMatch: number; // 0-100
  regionalRelevance: number; // 0-100
  recommendation: "high" | "medium" | "low";
}

export function calculateOverallConfidence(metrics: Omit<QualityMetrics, "confidenceScore" | "recommendation">): QualityMetrics {
  const weights = {
    signalConsistency: 0.30,
    weatherAppropriateness: 0.25,
    occasionMatch: 0.25,
    regionalRelevance: 0.20,
  };

  const confidenceScore =
    metrics.signalConsistency * weights.signalConsistency +
    metrics.weatherAppropriateness * weights.weatherAppropriateness +
    metrics.occasionMatch * weights.occasionMatch +
    metrics.regionalRelevance * weights.regionalRelevance;

  const recommendation =
    confidenceScore > 75 ? "high" : confidenceScore > 50 ? "medium" : "low";

  return {
    ...metrics,
    confidenceScore,
    recommendation,
  };
}

// =============================================================================
// Weather Context
// =============================================================================

export interface WeatherContext {
  cityId: string;
  date: string;
  fetchedAt: Date;

  current: {
    temperature: number; // Fahrenheit
    feelsLike: number;
    humidity: number;
    windSpeed: number;
    condition: WeatherCondition;
    uvIndex: number;
  };

  forecast: {
    morning: WeatherPeriod;
    afternoon: WeatherPeriod;
    evening: WeatherPeriod;
  };

  stylingImplications: {
    layeringRequired: boolean;
    rainProtection: boolean;
    sunProtection: boolean;
    temperatureRange: TemperatureRange;
    fabricRecommendations: string[];
  };
}

export interface WeatherPeriod {
  temperature: number;
  feelsLike: number;
  condition: WeatherCondition;
  precipitation: number; // Percentage chance
}

// =============================================================================
// Style Matrix
// =============================================================================

export interface StyleMatrix {
  cityId: string;
  generatedAt: Date;

  // Signal dimensions
  personas: string[];
  occasions: string[];
  vibes: string[];
  colorEnergies: string[];

  // Matrix entries (valid combinations only)
  entries: StyleMatrixEntry[];

  // Metadata
  stats: {
    totalEntries: number;
    coveragePercentage: number;
    avgConfidence: number;
  };
}

export interface StyleMatrixEntry {
  key: string; // Composite key
  signals: SignalCombination;
  bundleId?: string; // Reference to PrecomputedOutfitBundle
  confidence: number;
  regionalBoost: number;
}

// =============================================================================
// Cache Key Helpers
// =============================================================================

export function buildBundleCacheKey(context: PrecomputedOutfitBundle["context"]): string {
  return [
    "aura:outfit",
    context.cityId,
    context.date,
    context.persona,
    context.occasion,
    context.vibes[0] || "default",
    `${context.temperatureRange}_${context.weatherCondition}`,
  ].join(":");
}

export function buildWeatherCacheKey(cityId: string, date: string): string {
  return `aura:weather:${cityId}:${date}`;
}

export function buildMatrixCacheKey(cityId: string, date: string): string {
  return `aura:matrix:${cityId}:${date}`;
}

export function parseBundleCacheKey(key: string): PrecomputedOutfitBundle["context"] | null {
  const parts = key.split(":");
  if (parts.length < 7 || parts[0] !== "aura" || parts[1] !== "outfit") {
    return null;
  }

  const [, , cityId, date, persona, occasion, vibe, weatherKey] = parts;
  const [temperatureRange, weatherCondition] = (weatherKey || "mild_clear").split("_") as [TemperatureRange, WeatherCondition];

  return {
    cityId: cityId!,
    date: date!,
    persona: persona!,
    occasion: occasion!,
    vibes: [vibe!],
    weatherCondition,
    temperatureRange,
  };
}
