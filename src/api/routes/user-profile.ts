/**
 * User Profile API Routes
 *
 * Exposes user preference profiles from the ML service.
 */

import { Router } from "express";

import { apiLogger as logger } from "../../utils/logger";
import { mlClient } from "../../services/ml-client";

export const userProfileRouter = Router();

// =============================================================================
// GET /users/:userId/profile
// =============================================================================

userProfileRouter.get("/:userId/profile", async (req, res) => {
  const { userId } = req.params;

  logger.info({ userId }, "User profile request");

  try {
    const profile = await mlClient.getUserProfile(userId);

    if (profile) {
      return res.json({
        success: true,
        profile,
      });
    }

    // ML service unavailable
    return res.json({
      success: true,
      profile: {
        user_id: userId,
        persona_preferences: {},
        color_preferences: { liked: [], disliked: [] },
        style_preferences: {},
        preference_vector: null,
        feedback_count: 0,
        confidence: 0,
        last_updated: null,
      },
      degraded: true,
      message: "Default profile returned (ML service temporarily unavailable)",
    });
  } catch (error) {
    logger.error(
      { error: (error as Error).message, userId },
      "Error fetching user profile"
    );
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch user profile",
    });
  }
});
