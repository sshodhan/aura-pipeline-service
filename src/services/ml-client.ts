/**
 * ML Service Client
 *
 * TypeScript HTTP client for communicating with the Python ML microservice.
 * Handles style embeddings, quality scoring, and personalization.
 * Falls back gracefully when the ML service is unavailable.
 */

import { apiLogger as logger } from "../utils/logger";

// =============================================================================
// Configuration
// =============================================================================

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://ml-service:8000";
const ML_TIMEOUT_MS = parseInt(process.env.ML_TIMEOUT_MS || "5000", 10);

// =============================================================================
// Types
// =============================================================================

export interface MLQualityScore {
  bundleId: string;
  mlScore: number;
  blendedScore: number;
  recommendation: "high" | "medium" | "low";
}

export interface MLBatchScoreResult {
  scores: Record<string, MLQualityScore>;
  count: number;
  modelVersion: string;
}

export interface MLSimilarityResult {
  outfitId: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

export interface MLRerankResult {
  ranked: Array<{
    outfitId: string;
    originalRank: number;
    personalizedRank: number;
    personalizedScore: number;
    personalized: boolean;
    reasons: string[];
  }>;
  userId: string;
  totalCandidates: number;
  returned: number;
}

export interface MLFeedbackResult {
  feedback_id: number;
  user_id: string;
  profile_updated: boolean;
  feedback_count: number;
  confidence: number;
}

export interface MLUserProfile {
  user_id: string;
  persona_preferences: Record<string, number>;
  color_preferences: {
    liked: string[];
    disliked: string[];
  };
  style_preferences: Record<string, number>;
  preference_vector: number[] | null;
  feedback_count: number;
  confidence: number;
  last_updated: string | null;
}

// =============================================================================
// HTTP Helper
// =============================================================================

async function mlFetch<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    timeout?: number;
  } = {}
): Promise<T> {
  const { method = "GET", body, timeout = ML_TIMEOUT_MS } = options;
  const url = `${ML_SERVICE_URL}${path}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`ML service error ${response.status}: ${text}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

// =============================================================================
// ML Service Client
// =============================================================================

export const mlClient = {
  // ---------------------------------------------------------------------------
  // Health Check
  // ---------------------------------------------------------------------------

  async healthCheck(): Promise<boolean> {
    try {
      await mlFetch<{ status: string }>("/health", { timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  },

  // ---------------------------------------------------------------------------
  // Quality Scoring
  // ---------------------------------------------------------------------------

  /**
   * Score a single outfit bundle's quality using the ML model.
   */
  async scoreQuality(
    bundle: Record<string, unknown>,
    ruleBasedScore?: number
  ): Promise<MLQualityScore | null> {
    try {
      return await mlFetch<MLQualityScore>("/ml/quality/score", {
        method: "POST",
        body: { bundle, ruleBasedScore },
      });
    } catch (error) {
      logger.warn(
        { error: (error as Error).message },
        "ML quality scoring unavailable, using fallback"
      );
      return null;
    }
  },

  /**
   * Score multiple outfit bundles in batch.
   */
  async batchScoreQuality(
    bundles: Record<string, unknown>[],
    ruleBasedScores?: Record<string, number>
  ): Promise<MLBatchScoreResult | null> {
    try {
      return await mlFetch<MLBatchScoreResult>("/ml/quality/batch-score", {
        method: "POST",
        body: { bundles, ruleBasedScores },
        timeout: 30000, // Longer timeout for batch operations
      });
    } catch (error) {
      logger.warn(
        { error: (error as Error).message, bundleCount: bundles.length },
        "ML batch quality scoring unavailable"
      );
      return null;
    }
  },

  // ---------------------------------------------------------------------------
  // Embeddings
  // ---------------------------------------------------------------------------

  /**
   * Compute and store embeddings for a batch of outfits.
   */
  async computeEmbeddingsBatch(
    outfits: Record<string, unknown>[],
    contexts: Record<string, unknown>[]
  ): Promise<{ computed: number; stored: number } | null> {
    try {
      return await mlFetch<{ computed: number; stored: number }>(
        "/ml/embeddings/compute-batch",
        {
          method: "POST",
          body: { outfits, contexts },
          timeout: 30000,
        }
      );
    } catch (error) {
      logger.warn(
        { error: (error as Error).message },
        "ML embedding computation unavailable"
      );
      return null;
    }
  },

  /**
   * Search for similar outfits using embedding similarity.
   */
  async searchSimilar(
    signals: {
      cityId: string;
      persona: string;
      occasion: string;
      vibe: string;
      colorEnergy?: string;
      temperatureRange?: string;
      weatherCondition?: string;
    },
    topK: number = 10
  ): Promise<{ results: MLSimilarityResult[] } | null> {
    try {
      return await mlFetch<{ results: MLSimilarityResult[] }>(
        "/ml/embeddings/search",
        {
          method: "POST",
          body: { ...signals, topK },
        }
      );
    } catch (error) {
      logger.warn(
        { error: (error as Error).message },
        "ML similarity search unavailable"
      );
      return null;
    }
  },

  // ---------------------------------------------------------------------------
  // Personalization
  // ---------------------------------------------------------------------------

  /**
   * Record user feedback on an outfit.
   */
  async recordFeedback(
    userId: string,
    outfitId: string,
    action: string,
    context?: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Promise<MLFeedbackResult | null> {
    try {
      return await mlFetch<MLFeedbackResult>("/ml/personalization/feedback", {
        method: "POST",
        body: { userId, outfitId, action, context, metadata },
      });
    } catch (error) {
      logger.warn(
        { error: (error as Error).message },
        "ML feedback recording unavailable"
      );
      return null;
    }
  },

  /**
   * Re-rank outfit candidates based on user preferences.
   */
  async rerankOutfits(
    userId: string,
    candidates: Record<string, unknown>[],
    topK: number = 5
  ): Promise<MLRerankResult | null> {
    try {
      return await mlFetch<MLRerankResult>("/ml/personalization/rerank", {
        method: "POST",
        body: { userId, candidates, topK },
      });
    } catch (error) {
      logger.warn(
        { error: (error as Error).message },
        "ML personalization unavailable"
      );
      return null;
    }
  },

  /**
   * Get user preference profile.
   */
  async getUserProfile(userId: string): Promise<MLUserProfile | null> {
    try {
      return await mlFetch<MLUserProfile>(
        `/ml/personalization/profile/${encodeURIComponent(userId)}`
      );
    } catch (error) {
      logger.warn(
        { error: (error as Error).message },
        "ML user profile unavailable"
      );
      return null;
    }
  },
};
