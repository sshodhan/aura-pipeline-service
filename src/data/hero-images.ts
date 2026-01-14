/**
 * Hero Images Data Module
 *
 * Provides hero image URL mappings for signal combinations.
 * Hero images are archetype-level style inspiration images that
 * represent the overall aesthetic of a signal combination.
 *
 * Image Matrix:
 * - 6 core archetypes × 6 key occasions × 4 primary vibes × 1 season
 * - = ~144 images per season
 * - Cost: ~$3-6 per season refresh at $0.02-0.04/image
 *
 * Image Generation:
 * - Run scripts/generate-hero-images.ts quarterly
 * - Upload to Cloud Storage bucket
 * - Update HERO_IMAGE_BASE_URL env variable
 */

import { Persona, Occasion, Vibe } from "../models/signals";
import { getCurrentSeason } from "./seasonal-trends";

// =============================================================================
// Configuration
// =============================================================================

/**
 * Base URL for hero images in Cloud Storage
 * Override with HERO_IMAGE_BASE_URL environment variable
 */
const HERO_IMAGE_BASE_URL =
  process.env.HERO_IMAGE_BASE_URL ||
  "https://storage.googleapis.com/aura-hero-images";

/**
 * Supported image formats in order of preference
 */
const IMAGE_FORMATS = ["webp", "jpg"] as const;

/**
 * Default aspect ratio for hero images
 */
const DEFAULT_ASPECT_RATIO = "4:5";

// =============================================================================
// Type Definitions
// =============================================================================

export interface HeroImage {
  url: string;
  alt: string;
  aspectRatio: string;
  season: string;
  fallback?: string;
}

export interface HeroImageMapping {
  persona: Persona;
  occasion: Occasion;
  vibe: Vibe;
  season: string;
  imageKey: string;
}

// =============================================================================
// Archetype Mappings
// =============================================================================

/**
 * Map personas to core archetypes for image generation
 * This reduces the number of images needed while maintaining relevance
 */
const PERSONA_TO_ARCHETYPE: Record<Persona, string> = {
  casual: "casual",
  professional: "classic",
  athletic: "athletic",
  "business-casual": "classic",
  "street-style": "edgy",
  "elevated-casual": "minimalist",
  athleisure: "athletic",
};

/**
 * Primary occasions for hero images
 * Not all occasions need unique images - some can share
 */
const OCCASION_PRIORITY: Occasion[] = [
  "work",
  "hangout",
  "dinner",
  "date",
  "active",
  "formal",
];

/**
 * Primary vibes for hero images
 */
const VIBE_PRIORITY: Vibe[] = ["minimal", "polished", "bold", "romantic"];

// =============================================================================
// Image Key Generation
// =============================================================================

/**
 * Generate a normalized image key for a signal combination
 */
function generateImageKey(
  persona: Persona,
  occasion: Occasion,
  vibe: Vibe,
  season: string
): string {
  const archetype = PERSONA_TO_ARCHETYPE[persona];
  const normalizedSeason = season.toLowerCase().replace(/\s+/g, "-");

  return `${archetype}-${occasion}-${vibe}-${normalizedSeason}`;
}

/**
 * Get fallback image key when exact match doesn't exist
 */
function getFallbackImageKey(
  persona: Persona,
  occasion: Occasion,
  vibe: Vibe,
  season: string
): string {
  const archetype = PERSONA_TO_ARCHETYPE[persona];
  const normalizedSeason = season.toLowerCase().replace(/\s+/g, "-");

  // Fallback strategy:
  // 1. Try archetype + occasion (without vibe)
  // 2. Try archetype only (generic)

  // Check if occasion is in priority list
  if (!OCCASION_PRIORITY.includes(occasion)) {
    // Map to similar priority occasion
    const occasionMapping: Partial<Record<Occasion, Occasion>> = {
      errands: "hangout",
      home: "hangout",
    };
    const mappedOccasion = occasionMapping[occasion] || "hangout";
    return `${archetype}-${mappedOccasion}-${vibe}-${normalizedSeason}`;
  }

  // Check if vibe is in priority list
  if (!VIBE_PRIORITY.includes(vibe)) {
    const vibeMapping: Partial<Record<Vibe, Vibe>> = {
      laid_back: "minimal",
      creative: "bold",
    };
    const mappedVibe = vibeMapping[vibe] || "minimal";
    return `${archetype}-${occasion}-${mappedVibe}-${normalizedSeason}`;
  }

  // Return generic archetype image
  return `${archetype}-general-${normalizedSeason}`;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Get hero image URL for a signal combination
 */
export function getHeroImageUrl(signals: {
  persona: Persona;
  occasion: Occasion;
  vibe: Vibe;
}): HeroImage {
  const currentSeason = getCurrentSeason();
  const seasonLabel = `${currentSeason.season} ${currentSeason.year}`;
  const normalizedSeason = seasonLabel.toLowerCase().replace(/\s+/g, "-");

  const imageKey = generateImageKey(
    signals.persona,
    signals.occasion,
    signals.vibe,
    normalizedSeason
  );

  const fallbackKey = getFallbackImageKey(
    signals.persona,
    signals.occasion,
    signals.vibe,
    normalizedSeason
  );

  // Generate alt text
  const archetype = PERSONA_TO_ARCHETYPE[signals.persona];
  const alt = `${archetype} ${signals.occasion} ${signals.vibe} style inspiration - ${seasonLabel}`;

  return {
    url: `${HERO_IMAGE_BASE_URL}/${imageKey}.webp`,
    alt,
    aspectRatio: DEFAULT_ASPECT_RATIO,
    season: seasonLabel,
    fallback: `${HERO_IMAGE_BASE_URL}/${fallbackKey}.webp`,
  };
}

/**
 * Get hero image URL by explicit archetype (for direct access)
 */
export function getHeroImageByArchetype(
  archetype: string,
  occasion: Occasion,
  vibe: Vibe
): HeroImage {
  const currentSeason = getCurrentSeason();
  const seasonLabel = `${currentSeason.season} ${currentSeason.year}`;
  const normalizedSeason = seasonLabel.toLowerCase().replace(/\s+/g, "-");

  const imageKey = `${archetype}-${occasion}-${vibe}-${normalizedSeason}`;
  const alt = `${archetype} ${occasion} ${vibe} style inspiration - ${seasonLabel}`;

  return {
    url: `${HERO_IMAGE_BASE_URL}/${imageKey}.webp`,
    alt,
    aspectRatio: DEFAULT_ASPECT_RATIO,
    season: seasonLabel,
  };
}

/**
 * Generate all hero image mappings for the current season
 * Used for batch image generation
 */
export function generateAllImageMappings(): HeroImageMapping[] {
  const currentSeason = getCurrentSeason();
  const seasonLabel = `${currentSeason.season} ${currentSeason.year}`;
  const mappings: HeroImageMapping[] = [];

  // Get unique archetypes
  const archetypes = [...new Set(Object.values(PERSONA_TO_ARCHETYPE))];

  for (const archetype of archetypes) {
    for (const occasion of OCCASION_PRIORITY) {
      for (const vibe of VIBE_PRIORITY) {
        const normalizedSeason = seasonLabel.toLowerCase().replace(/\s+/g, "-");
        const imageKey = `${archetype}-${occasion}-${vibe}-${normalizedSeason}`;

        // Find a persona that maps to this archetype
        const persona = (Object.entries(PERSONA_TO_ARCHETYPE).find(
          ([_, arch]) => arch === archetype
        )?.[0] || "casual") as Persona;

        mappings.push({
          persona,
          occasion,
          vibe,
          season: seasonLabel,
          imageKey,
        });
      }
    }
  }

  return mappings;
}

/**
 * Get the total count of hero images needed
 */
export function getHeroImageCount(): {
  total: number;
  breakdown: {
    archetypes: number;
    occasions: number;
    vibes: number;
  };
} {
  const archetypes = [...new Set(Object.values(PERSONA_TO_ARCHETYPE))];

  return {
    total: archetypes.length * OCCASION_PRIORITY.length * VIBE_PRIORITY.length,
    breakdown: {
      archetypes: archetypes.length,
      occasions: OCCASION_PRIORITY.length,
      vibes: VIBE_PRIORITY.length,
    },
  };
}

/**
 * Generate image prompt for AI image generation
 */
export function generateImagePrompt(mapping: HeroImageMapping): string {
  const currentSeason = getCurrentSeason();

  // Get seasonal context
  const trendingColors = currentSeason.trendingColors
    .slice(0, 3)
    .map((c) => c.name)
    .join(", ");
  const keyMaterials = currentSeason.inSeasonMaterials.slice(0, 3).join(", ");

  return `
Fashion editorial style photograph for a ${mapping.season} outfit inspiration.

Style Archetype: ${PERSONA_TO_ARCHETYPE[mapping.persona]}
Occasion: ${mapping.occasion}
Aesthetic Vibe: ${mapping.vibe}

Seasonal Context:
- Trending colors: ${trendingColors}
- Key materials: ${keyMaterials}
- Themes: ${currentSeason.themes.slice(0, 2).join(", ")}

Requirements:
- Full body or 3/4 shot
- Clean, minimal background
- Natural lighting
- Focus on the outfit, not the model's face
- High fashion editorial quality
- Aspect ratio: 4:5
- Modern, aspirational styling
`.trim();
}

/**
 * Validate hero image URL is accessible (for health checks)
 */
export async function validateHeroImageUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get base URL for hero images
 */
export function getHeroImageBaseUrl(): string {
  return HERO_IMAGE_BASE_URL;
}
