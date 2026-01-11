/**
 * Gemini Service
 *
 * Handles AI-powered outfit generation using Google's Gemini API.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../utils/config";
import { geminiLogger as logger } from "../utils/logger";
import type { CityStyleProfile } from "../models/city";
import type { WeatherContext, PrecomputedOutfit, OutfitItem } from "../models/outfit";
import type { SignalCombination } from "../models/signals";
import {
  PERSONA_DESCRIPTIONS,
  OCCASION_DESCRIPTIONS,
  VIBE_DESCRIPTIONS,
  COLOR_ENERGY_PALETTES,
} from "../models/signals";

// =============================================================================
// Gemini Client
// =============================================================================

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
const model = genAI.getGenerativeModel({ model: config.gemini.model });

// =============================================================================
// Prompt Building
// =============================================================================

interface OutfitPromptContext {
  signals: SignalCombination;
  city: CityStyleProfile;
  weather: WeatherContext;
}

function buildOutfitPrompt(context: OutfitPromptContext): string {
  const { signals, city, weather } = context;

  const personaDesc = PERSONA_DESCRIPTIONS[signals.persona] || signals.persona;
  const occasionDesc = OCCASION_DESCRIPTIONS[signals.occasion];
  const vibeDesc = VIBE_DESCRIPTIONS[signals.vibe] || signals.vibe;
  const colorPalette = COLOR_ENERGY_PALETTES[signals.colorEnergy] || [];

  return `You are an expert fashion stylist creating outfit recommendations.

## CONTEXT

**Location:** ${city.displayName}
- Style DNA: ${city.styleDNA.dominantArchetypes.join(", ")}
- Formality Baseline: ${city.styleDNA.formalityBaseline}/100
- Pace of Life: ${city.styleDNA.paceOfLife}

**Weather:**
- Temperature: ${weather.current.temperature}°F (feels like ${weather.current.feelsLike}°F)
- Condition: ${weather.current.condition}
- Humidity: ${weather.current.humidity}%
${weather.stylingImplications.layeringRequired ? "- ⚠️ Layering recommended (temperature variation throughout day)" : ""}
${weather.stylingImplications.rainProtection ? "- ⚠️ Rain protection needed" : ""}
- Recommended fabrics: ${weather.stylingImplications.fabricRecommendations.join(", ")}

## USER SIGNALS

**Persona (Layer 1 - Identity):** ${signals.persona}
- ${personaDesc}

**Occasion (Layer 2 - Context):** ${signals.occasion}
- Formality: ${occasionDesc?.formality || "Varies"}
- Activities: ${occasionDesc?.activities || "General"}
- Dress Code: ${occasionDesc?.dressCode || "Flexible"}

**Vibe (Layer 3 - Aesthetics):** ${signals.vibe}
- ${vibeDesc}

**Color Energy:** ${signals.colorEnergy}
- Palette: ${colorPalette.slice(0, 3).join(", ")}

## INSTRUCTIONS

Generate 3 distinct outfit recommendations that:
1. Are appropriate for the weather conditions
2. Match the occasion's formality level
3. Express the requested style vibe
4. Use colors aligned with the color energy
5. Consider the city's regional style preferences

For each outfit, provide:
- A complete outfit with 4-6 items (top, bottom, footwear, and optional outerwear/accessories)
- Specific color descriptions
- Brief styling rationale

## OUTPUT FORMAT

Return a valid JSON array with exactly 3 outfits in this format:
\`\`\`json
[
  {
    "items": [
      {
        "category": "top",
        "name": "Item name",
        "description": "Brief description",
        "color": "Color name",
        "colorHex": "#hexcode",
        "fabric": "Fabric type"
      }
    ],
    "styling": {
      "overallVibe": "2-3 word vibe summary",
      "colorStory": "Brief color palette description",
      "silhouetteProfile": "Fit description (e.g., 'Relaxed Top + Fitted Bottom')",
      "occasionFit": "How well it fits the occasion"
    },
    "rationale": "1-2 sentence explanation of why this outfit works"
  }
]
\`\`\`

Return ONLY the JSON array, no additional text.`;
}

// =============================================================================
// Response Parsing
// =============================================================================

function parseOutfitResponse(response: string): PrecomputedOutfit[] {
  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = response;

  // Remove markdown code blocks if present
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1]!;
  }

  // Clean up the string
  jsonStr = jsonStr.trim();

  try {
    const parsed = JSON.parse(jsonStr) as Array<{
      items: OutfitItem[];
      styling: PrecomputedOutfit["styling"];
      rationale: string;
    }>;

    return parsed.map((outfit, index) => ({
      outfitId: `outfit-${Date.now()}-${index}`,
      rank: index + 1,
      items: outfit.items.map((item, itemIndex) => ({
        ...item,
        id: `item-${Date.now()}-${index}-${itemIndex}`,
      })),
      styling: outfit.styling,
      rationale: outfit.rationale,
      personalizationSlots: {
        colorSwappable: true,
        accessoryOptional: outfit.items.some((i) => i.category === "accessory"),
        layeringAdjustable: outfit.items.some((i) => i.category === "outerwear"),
      },
    }));
  } catch (error) {
    logger.error({ error, response: response.slice(0, 500) }, "Failed to parse outfit response");
    throw new Error("Failed to parse AI response as JSON");
  }
}

// =============================================================================
// Main Export Functions
// =============================================================================

export async function generateOutfits(
  context: OutfitPromptContext,
  options: { count?: number; retries?: number } = {}
): Promise<PrecomputedOutfit[]> {
  const { count = 3, retries = 2 } = options;

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
    try {
      const result = await model.generateContent(prompt);
      const response = result.response.text();

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

      return outfits.slice(0, count);
    } catch (error) {
      lastError = error as Error;
      logger.warn(
        { attempt, error: (error as Error).message },
        "Outfit generation failed, retrying"
      );

      if (attempt < retries) {
        // Exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }
  }

  throw lastError || new Error("Failed to generate outfits after retries");
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
