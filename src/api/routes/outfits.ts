/**
 * Outfits API Routes
 *
 * Endpoints for retrieving cached outfit recommendations.
 */

import { Router } from "express";
import { z } from "zod";

import { apiLogger as logger } from "../../utils/logger";
import {
  getOutfitBundle,
  getOutfitBundleFuzzy,
  incrementCacheHit,
  incrementCacheMiss,
} from "../../services/redis";

export const outfitsRouter = Router();

// =============================================================================
// Validation Schemas
// =============================================================================

const getOutfitQuerySchema = z.object({
  persona: z.string().min(1),
  occasion: z.string().min(1),
  vibe: z.string().optional(),
  date: z.string().optional(),
});

// =============================================================================
// GET /outfits/:cityId
// =============================================================================

outfitsRouter.get("/:cityId", async (req, res) => {
  const { cityId } = req.params;

  // Validate query params
  const parseResult = getOutfitQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Invalid query parameters",
      details: parseResult.error.errors,
    });
  }

  const { persona, occasion, vibe, date } = parseResult.data;
  const targetDate = date || new Date().toISOString().split("T")[0]!;

  logger.info(
    { cityId, persona, occasion, vibe, date: targetDate },
    "Outfit request received"
  );

  try {
    // Try exact match first
    let bundle = await getOutfitBundle(
      cityId,
      targetDate,
      persona,
      occasion,
      vibe || "minimal",
      "mild", // Default temperature range
      "clear" // Default weather
    );

    if (bundle) {
      await incrementCacheHit();
      logger.info({ cityId, bundleId: bundle.bundleId }, "Cache hit - exact match");

      return res.json({
        success: true,
        fromCache: true,
        matchType: "exact",
        outfit: bundle.outfits[0],
        alternatives: bundle.outfits.slice(1),
        confidence: bundle.qualityMetrics.confidenceScore,
        generatedAt: bundle.generatedAt,
      });
    }

    // Try fuzzy match
    bundle = await getOutfitBundleFuzzy(cityId, targetDate, persona, occasion, vibe);

    if (bundle) {
      await incrementCacheHit();
      logger.info({ cityId, bundleId: bundle.bundleId }, "Cache hit - fuzzy match");

      return res.json({
        success: true,
        fromCache: true,
        matchType: "fuzzy",
        outfit: bundle.outfits[0],
        alternatives: bundle.outfits.slice(1),
        confidence: bundle.qualityMetrics.confidenceScore,
        generatedAt: bundle.generatedAt,
      });
    }

    // Cache miss
    await incrementCacheMiss();
    logger.info({ cityId, persona, occasion }, "Cache miss");

    return res.status(404).json({
      success: false,
      fromCache: false,
      error: "No cached outfit found",
      message: "Please use real-time generation as fallback",
    });
  } catch (error) {
    logger.error({ error: (error as Error).message, cityId }, "Error fetching outfit");

    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch outfit from cache",
    });
  }
});

// =============================================================================
// GET /outfits/:cityId/available
// =============================================================================

outfitsRouter.get("/:cityId/available", async (req, res) => {
  const { cityId } = req.params;

  try {
    // Return available signal combinations for this city
    // This helps the frontend know what's cached
    return res.json({
      cityId,
      message: "Available combinations endpoint - coming soon",
      // TODO: Implement listing of available combinations
    });
  } catch (error) {
    logger.error({ error: (error as Error).message, cityId }, "Error fetching available outfits");

    return res.status(500).json({
      error: "Internal Server Error",
    });
  }
});
