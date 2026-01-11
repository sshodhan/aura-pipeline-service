/**
 * Pipeline Orchestrator
 *
 * Main entry point for the daily pipeline execution.
 * Coordinates all 6 stages of the pipeline.
 */

import { config } from "../utils/config";
import { pipelineLogger as logger, withTiming } from "../utils/logger";
import { PRIORITY_CITIES, getAllCityIds, getCityById } from "../models/city";
import {
  setPipelineStatus,
  closeRedisConnection,
  type PipelineStatus,
} from "../services/redis";

// Import pipeline stages
import { runDataCollection } from "./stages/1-data-collection";
import { runSignalAggregation } from "./stages/2-signal-aggregation";
import { runStyleMatrixGeneration } from "./stages/3-style-matrix";
import { runOutfitGeneration } from "./stages/4-outfit-generation";
import { runQualityScoring } from "./stages/5-quality-scoring";
import { runCachePopulation } from "./stages/6-cache-population";

// =============================================================================
// Types
// =============================================================================

export interface PipelineResult {
  runId: string;
  status: "success" | "partial" | "failed";
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  stats: {
    citiesProcessed: number;
    bundlesGenerated: number;
    bundlesCached: number;
    avgConfidence: number;
    errors: string[];
  };
}

export interface PipelineOptions {
  mode?: "full" | "weather-only" | "single-city";
  cityId?: string;
  dryRun?: boolean;
}

// =============================================================================
// Pipeline Orchestrator
// =============================================================================

export async function runPipeline(
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const runId = `run-${Date.now()}`;
  const startedAt = new Date();
  const errors: string[] = [];

  const mode = options.mode || config.pipeline.mode;
  logger.info({ runId, mode, options }, "Starting pipeline");

  // Determine which cities to process
  let cityIds: string[];
  if (mode === "single-city" && options.cityId) {
    cityIds = [options.cityId];
  } else {
    cityIds = getAllCityIds();
  }

  // Update status: Running
  await setPipelineStatus({
    runId,
    status: "running",
    stage: "initializing",
    startedAt,
    citiesProcessed: 0,
    bundlesGenerated: 0,
  });

  try {
    // =========================================================================
    // Stage 1: Data Collection
    // =========================================================================
    await setPipelineStatus({
      runId,
      status: "running",
      stage: "data-collection",
      startedAt,
      citiesProcessed: 0,
      bundlesGenerated: 0,
    });

    const collectedData = await withTiming(
      "Stage 1: Data Collection",
      () => runDataCollection(cityIds),
      logger
    );

    // If weather-only mode, stop here
    if (mode === "weather-only") {
      const completedAt = new Date();
      const result: PipelineResult = {
        runId,
        status: "success",
        startedAt,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        stats: {
          citiesProcessed: collectedData.weather.size,
          bundlesGenerated: 0,
          bundlesCached: 0,
          avgConfidence: 0,
          errors,
        },
      };

      await setPipelineStatus({
        runId,
        status: "completed",
        stage: "weather-only-complete",
        startedAt,
        completedAt,
        citiesProcessed: collectedData.weather.size,
        bundlesGenerated: 0,
      });

      logger.info({ runId, result }, "Weather-only pipeline completed");
      return result;
    }

    // =========================================================================
    // Stage 2: Signal Aggregation
    // =========================================================================
    await setPipelineStatus({
      runId,
      status: "running",
      stage: "signal-aggregation",
      startedAt,
      citiesProcessed: 0,
      bundlesGenerated: 0,
    });

    const citySignals = await withTiming(
      "Stage 2: Signal Aggregation",
      () => runSignalAggregation(collectedData),
      logger
    );

    // =========================================================================
    // Stage 3: Style Matrix Generation
    // =========================================================================
    await setPipelineStatus({
      runId,
      status: "running",
      stage: "style-matrix",
      startedAt,
      citiesProcessed: 0,
      bundlesGenerated: 0,
    });

    const styleMatrices = await withTiming(
      "Stage 3: Style Matrix Generation",
      () => runStyleMatrixGeneration(citySignals),
      logger
    );

    // =========================================================================
    // Stage 4: Outfit Generation (longest stage)
    // =========================================================================
    await setPipelineStatus({
      runId,
      status: "running",
      stage: "outfit-generation",
      startedAt,
      citiesProcessed: 0,
      bundlesGenerated: 0,
    });

    const outfitBundles = await withTiming(
      "Stage 4: Outfit Generation",
      () => runOutfitGeneration(styleMatrices, citySignals, collectedData),
      logger
    );

    // =========================================================================
    // Stage 5: Quality Scoring
    // =========================================================================
    await setPipelineStatus({
      runId,
      status: "running",
      stage: "quality-scoring",
      startedAt,
      citiesProcessed: cityIds.length,
      bundlesGenerated: outfitBundles.length,
    });

    const scoredBundles = await withTiming(
      "Stage 5: Quality Scoring",
      () => runQualityScoring(outfitBundles),
      logger
    );

    // Filter out low-quality bundles
    const validBundles = scoredBundles.filter(
      (b) => b.qualityMetrics.confidenceScore >= 40
    );

    logger.info(
      {
        total: scoredBundles.length,
        valid: validBundles.length,
        filtered: scoredBundles.length - validBundles.length,
      },
      "Quality filtering complete"
    );

    // =========================================================================
    // Stage 6: Cache Population
    // =========================================================================
    await setPipelineStatus({
      runId,
      status: "running",
      stage: "cache-population",
      startedAt,
      citiesProcessed: cityIds.length,
      bundlesGenerated: validBundles.length,
    });

    const cacheResult = await withTiming(
      "Stage 6: Cache Population",
      () => runCachePopulation(validBundles, options.dryRun),
      logger
    );

    // =========================================================================
    // Complete
    // =========================================================================
    const completedAt = new Date();
    const avgConfidence =
      validBundles.length > 0
        ? validBundles.reduce((sum, b) => sum + b.qualityMetrics.confidenceScore, 0) /
          validBundles.length
        : 0;

    const result: PipelineResult = {
      runId,
      status: errors.length > 0 ? "partial" : "success",
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      stats: {
        citiesProcessed: cityIds.length,
        bundlesGenerated: validBundles.length,
        bundlesCached: cacheResult.cached,
        avgConfidence: Math.round(avgConfidence * 10) / 10,
        errors,
      },
    };

    await setPipelineStatus({
      runId,
      status: "completed",
      stage: "complete",
      startedAt,
      completedAt,
      citiesProcessed: cityIds.length,
      bundlesGenerated: validBundles.length,
    });

    logger.info({ runId, result }, "Pipeline completed successfully");
    return result;

  } catch (error) {
    const completedAt = new Date();
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(errorMessage);

    logger.error({ runId, error: errorMessage }, "Pipeline failed");

    await setPipelineStatus({
      runId,
      status: "failed",
      stage: "error",
      startedAt,
      completedAt,
      citiesProcessed: 0,
      bundlesGenerated: 0,
      error: errorMessage,
    });

    return {
      runId,
      status: "failed",
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      stats: {
        citiesProcessed: 0,
        bundlesGenerated: 0,
        bundlesCached: 0,
        avgConfidence: 0,
        errors,
      },
    };
  }
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main() {
  logger.info("Pipeline service starting");

  try {
    const result = await runPipeline({
      mode: config.pipeline.mode,
      cityId: config.pipeline.singleCity,
    });

    logger.info({ result }, "Pipeline execution finished");

    // Exit with appropriate code
    process.exit(result.status === "failed" ? 1 : 0);
  } catch (error) {
    logger.error({ error }, "Unhandled pipeline error");
    process.exit(1);
  } finally {
    await closeRedisConnection();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { main };
