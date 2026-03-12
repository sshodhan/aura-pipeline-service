/**
 * Feedback API Routes
 *
 * Proxies user feedback to the ML service for personalization learning.
 */

import { Router } from "express";
import { z } from "zod";

import { apiLogger as logger } from "../../utils/logger";
import { mlClient } from "../../services/ml-client";

export const feedbackRouter = Router();

// =============================================================================
// Validation
// =============================================================================

const feedbackSchema = z.object({
  userId: z.string().min(1),
  outfitId: z.string().min(1),
  action: z.enum(["liked", "disliked", "saved", "shared", "skipped"]),
  context: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// =============================================================================
// POST /feedback
// =============================================================================

feedbackRouter.post("/", async (req, res) => {
  const parseResult = feedbackSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Invalid feedback data",
      details: parseResult.error.errors,
    });
  }

  const { userId, outfitId, action, context, metadata } = parseResult.data;

  logger.info({ userId, outfitId, action }, "Feedback received");

  try {
    const result = await mlClient.recordFeedback(
      userId,
      outfitId,
      action,
      context,
      metadata
    );

    if (result) {
      return res.json({
        success: true,
        ...result,
      });
    }

    // ML service unavailable — acknowledge but note degraded state
    return res.status(202).json({
      success: true,
      message: "Feedback acknowledged (ML service temporarily unavailable)",
      degraded: true,
    });
  } catch (error) {
    logger.error({ error: (error as Error).message }, "Feedback recording failed");
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to record feedback",
    });
  }
});
