/**
 * Bundle Assembly (pipeline core)
 *
 * Wraps one style-matrix entry's generated outfits in a PrecomputedOutfitBundle.
 * Moved unchanged from stages/4-outfit-generation.ts; the TTL is passed in so
 * this module does not need ./utils/config (and therefore API keys).
 */

import type { PrecomputedOutfit, PrecomputedOutfitBundle, StyleMatrixEntry } from "../../models/outfit";

export function buildOutfitBundle(
  entry: StyleMatrixEntry,
  cityId: string,
  outfits: PrecomputedOutfit[],
  ttlSeconds: number
): PrecomputedOutfitBundle {
  return {
    bundleId: `bundle-${cityId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    generatedAt: new Date(),
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),

    context: {
      cityId,
      date: new Date().toISOString().split("T")[0]!,
      weatherCondition: entry.signals.weatherCondition,
      temperatureRange: entry.signals.temperatureRange,
      persona: entry.signals.persona,
      occasion: entry.signals.occasion,
      vibes: [entry.signals.vibe],
      colorEnergy: entry.signals.colorEnergy,
    },

    outfits,

    qualityMetrics: {
      confidenceScore: entry.confidence,
      signalConsistency: 0, // Will be calculated in Stage 5
      weatherAppropriateness: 0,
      occasionMatch: 0,
      regionalRelevance: entry.regionalBoost,
    },

    fallback: {
      useRealTimeGeneration: false,
      similarBundles: [],
    },
  };
}
