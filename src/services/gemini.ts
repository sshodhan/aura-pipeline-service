/**
 * Gemini Service
 *
 * Handles AI-powered outfit generation using Google's Gemini API.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../utils/config";
import { geminiLogger as logger } from "../utils/logger";
import type { PrecomputedOutfit } from "../models/outfit";
import { buildOutfitPrompt, type OutfitPromptContext } from "../pipeline/core/outfit-prompt";
import {
  generateOutfitsWithModel,
  type GenerateOutfitsOptions,
} from "../pipeline/core/generate-outfits";

// =============================================================================
// Gemini Client
// =============================================================================

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
const model = genAI.getGenerativeModel({ model: config.gemini.model });

// =============================================================================
// Main Export Functions
// =============================================================================

export async function generateOutfits(
  context: OutfitPromptContext,
  options: GenerateOutfitsOptions = {}
): Promise<PrecomputedOutfit[]> {
  // Prompt, parsing and retry/backoff live in pipeline/core so the same loop
  // can run against a mock model (Phase 0 fixture runner).
  return generateOutfitsWithModel(model, context, options);
}

export async function generateOutfitsBatch(
  contexts: OutfitPromptContext[],
  options: { batchSize?: number; delayMs?: number } = {}
): Promise<Map<string, PrecomputedOutfit[]>> {
  const { batchSize = config.pipeline.batchSize, delayMs = 200 } = options;
  const results = new Map<string, PrecomputedOutfit[]>();

  logger.info({ totalContexts: contexts.length, batchSize }, "Starting batch outfit generation");

  for (let i = 0; i < contexts.length; i += batchSize) {
    const batch = contexts.slice(i, i + batchSize);

    const batchPromises = batch.map(async (context) => {
      const key = `${context.city.cityId}|${context.signals.persona}|${context.signals.occasion}|${context.signals.vibe}`;
      try {
        const outfits = await generateOutfits(context);
        results.set(key, outfits);
      } catch (error) {
        logger.error({ key, error }, "Failed to generate outfits for context");
        results.set(key, []); // Empty array for failed generations
      }
    });

    await Promise.all(batchPromises);

    // Progress logging
    const processed = Math.min(i + batchSize, contexts.length);
    logger.info(
      { processed, total: contexts.length, percentage: Math.round((processed / contexts.length) * 100) },
      "Batch progress"
    );

    // Delay between batches to respect rate limits
    if (i + batchSize < contexts.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  logger.info({ totalGenerated: results.size }, "Batch outfit generation complete");
  return results;
}

// =============================================================================
// Utility Functions
// =============================================================================

export function estimateTokens(context: OutfitPromptContext): number {
  const prompt = buildOutfitPrompt(context);
  // Rough estimate: 1 token ≈ 4 characters
  return Math.ceil(prompt.length / 4);
}

export async function testConnection(): Promise<boolean> {
  try {
    const result = await model.generateContent("Say 'OK' if you can hear me.");
    const response = result.response.text();
    return response.toLowerCase().includes("ok");
  } catch (error) {
    logger.error({ error }, "Gemini connection test failed");
    return false;
  }
}
