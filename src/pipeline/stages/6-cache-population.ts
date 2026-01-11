/**
 * Stage 6: Cache Population
 *
 * Stores scored bundles in Redis cache for fast retrieval.
 */

import { pipelineLogger as logger } from "../../utils/logger";
import { cacheBundlesBatch, getCityBundleCount } from "../../services/redis";
import type { PrecomputedOutfitBundle } from "../../models/outfit";

// =============================================================================
// Types
// =============================================================================

export interface CachePopulationResult {
  cached: number;
  failed: number;
  byCity: Record<string, number>;
}

// =============================================================================
// Stage Implementation
// =============================================================================

export async function runCachePopulation(
  bundles: PrecomputedOutfitBundle[],
  dryRun = false
): Promise<CachePopulationResult> {
  logger.info(
    { bundleCount: bundles.length, dryRun },
    "Stage 6: Starting cache population"
  );

  if (dryRun) {
    logger.info("Dry run mode - skipping actual cache writes");
    return {
      cached: 0,
      failed: 0,
      byCity: {},
    };
  }

  const result: CachePopulationResult = {
    cached: 0,
    failed: 0,
    byCity: {},
  };

  // Group bundles by city
  const bundlesByCity = new Map<string, PrecomputedOutfitBundle[]>();
  for (const bundle of bundles) {
    const cityId = bundle.context.cityId;
    if (!bundlesByCity.has(cityId)) {
      bundlesByCity.set(cityId, []);
    }
    bundlesByCity.get(cityId)!.push(bundle);
  }

  // Process each city's bundles
  for (const [cityId, cityBundles] of bundlesByCity) {
    try {
      // Cache in batches
      const batchSize = 50;
      for (let i = 0; i < cityBundles.length; i += batchSize) {
        const batch = cityBundles.slice(i, i + batchSize);
        await cacheBundlesBatch(batch);
        result.cached += batch.length;
      }

      result.byCity[cityId] = cityBundles.length;

      // Log city completion
      const totalCached = await getCityBundleCount(cityId);
      logger.info(
        { cityId, cached: cityBundles.length, totalInCache: totalCached },
        "City bundles cached"
      );
    } catch (error) {
      logger.error(
        { cityId, error: (error as Error).message },
        "Failed to cache bundles for city"
      );
      result.failed += cityBundles.length;
    }
  }

  logger.info(
    {
      cached: result.cached,
      failed: result.failed,
      cities: Object.keys(result.byCity).length,
    },
    "Stage 6: Cache population complete"
  );

  return result;
}
