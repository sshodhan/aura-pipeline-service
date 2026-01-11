/**
 * Stage 4: Outfit Generation
 *
 * Uses AI to generate outfit recommendations for each valid combination.
 * This is the most compute-intensive stage.
 */

import { pipelineLogger as logger } from "../../utils/logger";
import { generateOutfits } from "../../services/gemini";
import type { CitySignalBundle } from "./2-signal-aggregation";
import type { StyleMatrix } from "../../models/outfit";
import type { PrecomputedOutfitBundle, WeatherContext } from "../../models/outfit";
import type { CollectedData } from "./1-data-collection";
import { config } from "../../utils/config";

// =============================================================================
// Stage Implementation
// =============================================================================

export async function runOutfitGeneration(
  styleMatrices: Map<string, StyleMatrix>,
  citySignals: Map<string, CitySignalBundle>,
  collectedData: CollectedData
): Promise<PrecomputedOutfitBundle[]> {
  logger.info({ cityCount: styleMatrices.size }, "Stage 4: Starting outfit generation");

  const allBundles: PrecomputedOutfitBundle[] = [];
  let totalProcessed = 0;
  let totalEntries = 0;

  // Calculate total entries for progress tracking
  for (const matrix of styleMatrices.values()) {
    totalEntries += matrix.entries.length;
  }

  logger.info({ totalEntries }, "Total combinations to process");

  // Process each city's matrix
  for (const [cityId, matrix] of styleMatrices) {
    const citySignal = citySignals.get(cityId);
    if (!citySignal) {
      logger.warn({ cityId }, "No city signal found, skipping");
      continue;
    }

    const weather = collectedData.weather.get(cityId);
    if (!weather) {
      logger.warn({ cityId }, "No weather data found, skipping");
      continue;
    }

    logger.info(
      { cityId, entries: matrix.entries.length },
      "Processing city matrix"
    );

    // Process in batches
    const batchSize = config.pipeline.batchSize;
    for (let i = 0; i < matrix.entries.length; i += batchSize) {
      const batch = matrix.entries.slice(i, i + batchSize);

      const batchBundles = await processBatch(batch, citySignal, weather);
      allBundles.push(...batchBundles);

      totalProcessed += batch.length;

      // Progress logging every 50 entries
      if (totalProcessed % 50 === 0 || totalProcessed === totalEntries) {
        const progress = Math.round((totalProcessed / totalEntries) * 100);
        logger.info(
          { processed: totalProcessed, total: totalEntries, progress: `${progress}%` },
          "Outfit generation progress"
        );
      }

      // Small delay between batches to avoid rate limits
      if (i + batchSize < matrix.entries.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }

  logger.info(
    { bundlesGenerated: allBundles.length },
    "Stage 4: Outfit generation complete"
  );

  return allBundles;
}

// =============================================================================
// Batch Processing
// =============================================================================

async function processBatch(
  entries: StyleMatrix["entries"],
  citySignal: CitySignalBundle,
  weather: WeatherContext
): Promise<PrecomputedOutfitBundle[]> {
  const bundles: PrecomputedOutfitBundle[] = [];

  // Process entries in parallel within the batch
  const promises = entries.map(async (entry) => {
    try {
      const outfits = await generateOutfits({
        signals: entry.signals,
        city: citySignal.cityProfile,
        weather,
      });

      if (outfits.length === 0) {
        return null;
      }

      const bundle: PrecomputedOutfitBundle = {
        bundleId: `bundle-${citySignal.cityId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        generatedAt: new Date(),
        expiresAt: new Date(Date.now() + config.cache.ttl.outfit * 1000),

        context: {
          cityId: citySignal.cityId,
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

      return bundle;
    } catch (error) {
      logger.error(
        { entry: entry.key, error: (error as Error).message },
        "Failed to generate outfits for entry"
      );
      return null;
    }
  });

  const results = await Promise.all(promises);

  // Filter out nulls (failed generations)
  for (const result of results) {
    if (result) {
      bundles.push(result);
    }
  }

  return bundles;
}
