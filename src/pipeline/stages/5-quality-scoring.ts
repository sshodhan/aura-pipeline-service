/**
 * Stage 5: Quality Scoring
 *
 * Validates and scores generated outfits based on multiple quality dimensions.
 */

import { pipelineLogger as logger } from "../../utils/logger";
import type { PrecomputedOutfitBundle, QualityMetrics } from "../../models/outfit";
import { calculateOverallConfidence } from "../../models/outfit";
import { OCCASION_DESCRIPTIONS } from "../../models/signals";

// =============================================================================
// Stage Implementation
// =============================================================================

export async function runQualityScoring(
  bundles: PrecomputedOutfitBundle[]
): Promise<PrecomputedOutfitBundle[]> {
  logger.info({ bundleCount: bundles.length }, "Stage 5: Starting quality scoring");

  const scoredBundles: PrecomputedOutfitBundle[] = [];

  for (const bundle of bundles) {
    const scoredBundle = scoreBundle(bundle);
    scoredBundles.push(scoredBundle);
  }

  // Calculate statistics
  const avgConfidence =
    scoredBundles.reduce((sum, b) => sum + b.qualityMetrics.confidenceScore, 0) /
    scoredBundles.length;

  const highConfidence = scoredBundles.filter(
    (b) => b.qualityMetrics.confidenceScore > 75
  ).length;
  const mediumConfidence = scoredBundles.filter(
    (b) =>
      b.qualityMetrics.confidenceScore > 50 &&
      b.qualityMetrics.confidenceScore <= 75
  ).length;
  const lowConfidence = scoredBundles.filter(
    (b) => b.qualityMetrics.confidenceScore <= 50
  ).length;

  logger.info(
    {
      avgConfidence: Math.round(avgConfidence * 10) / 10,
      highConfidence,
      mediumConfidence,
      lowConfidence,
    },
    "Stage 5: Quality scoring complete"
  );

  return scoredBundles;
}

// =============================================================================
// Scoring Logic
// =============================================================================

function scoreBundle(bundle: PrecomputedOutfitBundle): PrecomputedOutfitBundle {
  const signalConsistency = calculateSignalConsistency(bundle);
  const weatherAppropriateness = calculateWeatherAppropriateness(bundle);
  const occasionMatch = calculateOccasionMatch(bundle);
  const regionalRelevance = bundle.qualityMetrics.regionalRelevance; // Already calculated

  const metrics = calculateOverallConfidence({
    signalConsistency,
    weatherAppropriateness,
    occasionMatch,
    regionalRelevance,
  });

  return {
    ...bundle,
    qualityMetrics: metrics,
  };
}

/**
 * Calculate signal consistency (30% weight)
 * How well do persona, occasion, and vibe align?
 */
function calculateSignalConsistency(bundle: PrecomputedOutfitBundle): number {
  let score = 70; // Base score

  const { persona, occasion, vibes } = bundle.context;
  const vibe = vibes[0];

  // Check persona-occasion alignment
  const naturalPairs: Record<string, string[]> = {
    professional: ["work", "dinner", "formal"],
    casual: ["hangout", "errands", "home"],
    athletic: ["active"],
    athleisure: ["active", "errands", "hangout"],
    "street-style": ["hangout", "date"],
    "elevated-casual": ["work", "dinner", "date", "hangout"],
    "business-casual": ["work", "dinner"],
  };

  if (naturalPairs[persona]?.includes(occasion)) {
    score += 15;
  }

  // Check vibe-occasion alignment
  const vibeOccasionPairs: Record<string, string[]> = {
    polished: ["work", "dinner", "formal", "date"],
    minimal: ["work", "errands"],
    laid_back: ["hangout", "home", "errands"],
    romantic: ["date", "dinner"],
    bold: ["date", "formal", "hangout"],
    creative: ["hangout", "date"],
  };

  if (vibe && vibeOccasionPairs[vibe]?.includes(occasion)) {
    score += 10;
  }

  return Math.min(100, score);
}

/**
 * Calculate weather appropriateness (25% weight)
 * Does the outfit match the weather conditions?
 */
function calculateWeatherAppropriateness(bundle: PrecomputedOutfitBundle): number {
  let score = 60; // Base score

  const { temperatureRange, weatherCondition } = bundle.context;
  const outfits = bundle.outfits;

  if (outfits.length === 0) return 50;

  // Check if outfits have appropriate items
  const firstOutfit = outfits[0]!;
  const hasOuterwear = firstOutfit.items.some((i) => i.category === "outerwear");
  const fabrics = firstOutfit.items.map((i) => i.fabric?.toLowerCase() || "");

  // Cold weather checks
  if (temperatureRange === "cold" || temperatureRange === "cool") {
    if (hasOuterwear) score += 20;
    if (fabrics.some((f) => f.includes("wool") || f.includes("fleece"))) {
      score += 10;
    }
  }

  // Hot weather checks
  if (temperatureRange === "hot" || temperatureRange === "warm") {
    if (fabrics.some((f) => f.includes("linen") || f.includes("cotton"))) {
      score += 15;
    }
    if (!hasOuterwear) score += 10; // No heavy layers
  }

  // Rain checks
  if (["rain", "heavy_rain", "light_rain"].includes(weatherCondition)) {
    if (hasOuterwear) score += 15;
  }

  return Math.min(100, score);
}

/**
 * Calculate occasion match (25% weight)
 * Does the outfit's formality match the occasion?
 */
function calculateOccasionMatch(bundle: PrecomputedOutfitBundle): number {
  let score = 65; // Base score

  const { occasion } = bundle.context;
  const outfits = bundle.outfits;

  if (outfits.length === 0) return 50;

  const occasionDesc = OCCASION_DESCRIPTIONS[occasion as keyof typeof OCCASION_DESCRIPTIONS];
  if (!occasionDesc) return score;

  const firstOutfit = outfits[0]!;
  const stylingVibe = firstOutfit.styling.overallVibe.toLowerCase();
  const occasionFit = firstOutfit.styling.occasionFit.toLowerCase();

  // Check formality alignment
  const formalOccasions = ["work", "formal", "dinner"];
  const casualOccasions = ["hangout", "errands", "home", "active"];

  if (formalOccasions.includes(occasion)) {
    if (
      stylingVibe.includes("polished") ||
      stylingVibe.includes("elegant") ||
      stylingVibe.includes("sophisticated")
    ) {
      score += 20;
    }
  }

  if (casualOccasions.includes(occasion)) {
    if (
      stylingVibe.includes("relaxed") ||
      stylingVibe.includes("casual") ||
      stylingVibe.includes("comfortable")
    ) {
      score += 20;
    }
  }

  // Bonus if the AI explicitly mentioned good occasion fit
  if (occasionFit.includes("perfect") || occasionFit.includes("ideal")) {
    score += 10;
  }

  return Math.min(100, score);
}
