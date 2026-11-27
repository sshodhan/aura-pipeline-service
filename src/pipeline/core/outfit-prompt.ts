/**
 * Outfit Prompt (pipeline core)
 *
 * Builds the stage-4 outfit-generation prompt and parses the model's reply.
 * Moved verbatim from services/gemini.ts so it can run without API keys
 * (Phase 0 fixture runner, tests). services/gemini.ts uses it unchanged.
 */

import { geminiLogger as logger } from "../../utils/logger";
import type { CityStyleProfile } from "../../models/city";
import type { WeatherContext, PrecomputedOutfit, OutfitItem } from "../../models/outfit";
import type { SignalCombination } from "../../models/signals";
import {
  PERSONA_DESCRIPTIONS,
  OCCASION_DESCRIPTIONS,
  VIBE_DESCRIPTIONS,
  COLOR_ENERGY_PALETTES,
} from "../../models/signals";

// =============================================================================
// Prompt Building
// =============================================================================

export interface OutfitPromptContext {
  signals: SignalCombination;
  city: CityStyleProfile;
  weather: WeatherContext;
}

export function buildOutfitPrompt(context: OutfitPromptContext): string {
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

export function parseOutfitResponse(response: string): PrecomputedOutfit[] {
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
