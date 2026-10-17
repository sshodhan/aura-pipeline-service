/**
 * Outfit Generation Loop (pipeline core)
 *
 * The stage-4 prompt → model → parse loop, with the model injected so it can
 * run against a mock provider. Retry/backoff behavior is unchanged from the
 * original services/gemini.ts implementation (retries=2, 1s then 2s backoff);
 * the optional onAttempt hook only observes it.
 */

import { geminiLogger as logger } from "../../utils/logger";
import type { PrecomputedOutfit } from "../../models/outfit";
import {
  buildOutfitPrompt,
  parseOutfitResponse,
  type OutfitPromptContext,
} from "./outfit-prompt";

// =============================================================================
// Types
// =============================================================================

export interface TokenUsage {
  promptTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/** The subset of @google/generative-ai's GenerativeModel this loop uses. */
export interface TextGenerationModel {
  generateContent(prompt: string): Promise<{
    response: {
      text(): string;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };
  }>;
}

export interface GenerationAttempt {
  attempt: number; // 0-based
  latencyMs: number;
  outcome: "ok" | "provider_error" | "parse_error";
  error?: string;
  usage?: TokenUsage;
  outfitCount?: number;
}

export interface GenerateOutfitsOptions {
  count?: number;
  retries?: number;
  /** Backoff sleep; injectable so tests and mock runs need not wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Observes every model call, successful or not. */
  onAttempt?: (attempt: GenerationAttempt) => void;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// =============================================================================
// Generation Loop
// =============================================================================

export async function generateOutfitsWithModel(
  model: TextGenerationModel,
  context: OutfitPromptContext,
  options: GenerateOutfitsOptions = {}
): Promise<PrecomputedOutfit[]> {
  const { count = 3, retries = 2, sleep = defaultSleep, onAttempt } = options;

  const prompt = buildOutfitPrompt(context);

  logger.debug(
    {
      cityId: context.city.cityId,
      persona: context.signals.persona,
      occasion: context.signals.occasion,
      vibe: context.signals.vibe,
    },
    "Generating outfits"
  );

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const startedAt = Date.now();
    let usage: TokenUsage | undefined;
    let textReceived = false;
    try {
      const result = await model.generateContent(prompt);
      usage = toTokenUsage(result.response.usageMetadata);
      const response = result.response.text(); // throws on blocked responses
      textReceived = true;

      const outfits = parseOutfitResponse(response);

      // Validate we got the expected number
      if (outfits.length < count) {
        logger.warn(
          { expected: count, received: outfits.length },
          "Received fewer outfits than requested"
        );
      }

      logger.info(
        {
          cityId: context.city.cityId,
          signals: `${context.signals.persona}|${context.signals.occasion}|${context.signals.vibe}`,
          outfitCount: outfits.length,
        },
        "Outfits generated successfully"
      );

      onAttempt?.({
        attempt,
        latencyMs: Date.now() - startedAt,
        outcome: "ok",
        usage,
        outfitCount: outfits.length,
      });

      return outfits.slice(0, count);
    } catch (error) {
      lastError = error as Error;
      onAttempt?.({
        attempt,
        latencyMs: Date.now() - startedAt,
        outcome: textReceived ? "parse_error" : "provider_error",
        error: lastError.message,
        usage,
      });
      logger.warn(
        { attempt, error: (error as Error).message },
        "Outfit generation failed, retrying"
      );

      if (attempt < retries) {
        // Exponential backoff
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
  }

  throw lastError || new Error("Failed to generate outfits after retries");
}

function toTokenUsage(
  metadata: Awaited<ReturnType<TextGenerationModel["generateContent"]>>["response"]["usageMetadata"]
): TokenUsage | undefined {
  if (!metadata) return undefined;
  return {
    promptTokens: metadata.promptTokenCount,
    outputTokens: metadata.candidatesTokenCount,
    totalTokens: metadata.totalTokenCount,
  };
}
