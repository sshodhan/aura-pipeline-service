/**
 * City Models for AURA Pipeline
 *
 * Defines city-specific style intelligence and configurations.
 */

import type { Persona, Vibe, ColorEnergy } from "./signals";

// =============================================================================
// City Style Profile
// =============================================================================

export interface CityStyleProfile {
  cityId: string;
  displayName: string;
  timezone: string;
  tier: 1 | 2 | 3;

  // Geographic & Climate Factors
  climate: {
    type: "tropical" | "arid" | "temperate" | "continental" | "polar";
    avgTemperature: {
      winter: number;
      spring: number;
      summer: number;
      fall: number;
    };
    precipitationDays: number;
    humidityLevel: "low" | "medium" | "high";
  };

  // Regional Style DNA
  styleDNA: {
    dominantArchetypes: string[];
    colorPaletteAffinity: string[];
    formalityBaseline: number; // 0-100
    paceOfLife: "fast" | "moderate" | "relaxed";
  };

  // Cultural & Industry Influence
  culturalFactors: {
    primaryIndustries: string[];
    styleInfluencers: string[];
  };

  // Pipeline configuration
  pipelineConfig: {
    outfitCombinations: number;
    priority: number;
  };
}

// =============================================================================
// Priority Cities Configuration
// =============================================================================

export const PRIORITY_CITIES: CityStyleProfile[] = [
  // Tier 1: Major Fashion Hubs
  {
    cityId: "new-york-ny",
    displayName: "New York City",
    timezone: "America/New_York",
    tier: 1,
    climate: {
      type: "continental",
      avgTemperature: { winter: 35, spring: 55, summer: 80, fall: 60 },
      precipitationDays: 120,
      humidityLevel: "medium",
    },
    styleDNA: {
      dominantArchetypes: ["classic", "edgy", "minimalist"],
      colorPaletteAffinity: ["black", "navy", "gray", "camel"],
      formalityBaseline: 75,
      paceOfLife: "fast",
    },
    culturalFactors: {
      primaryIndustries: ["finance", "fashion", "media", "tech"],
      styleInfluencers: ["SoHo", "Brooklyn", "Upper East Side"],
    },
    pipelineConfig: {
      outfitCombinations: 500,
      priority: 1,
    },
  },
  {
    cityId: "los-angeles-ca",
    displayName: "Los Angeles",
    timezone: "America/Los_Angeles",
    tier: 1,
    climate: {
      type: "arid",
      avgTemperature: { winter: 58, spring: 65, summer: 78, fall: 70 },
      precipitationDays: 35,
      humidityLevel: "low",
    },
    styleDNA: {
      dominantArchetypes: ["natural", "bohemian", "street"],
      colorPaletteAffinity: ["earth_tones", "pastels", "white", "denim"],
      formalityBaseline: 35,
      paceOfLife: "relaxed",
    },
    culturalFactors: {
      primaryIndustries: ["entertainment", "tech", "wellness"],
      styleInfluencers: ["Venice Beach", "Silver Lake", "West Hollywood"],
    },
    pipelineConfig: {
      outfitCombinations: 500,
      priority: 2,
    },
  },
  {
    cityId: "chicago-il",
    displayName: "Chicago",
    timezone: "America/Chicago",
    tier: 1,
    climate: {
      type: "continental",
      avgTemperature: { winter: 28, spring: 50, summer: 75, fall: 55 },
      precipitationDays: 125,
      humidityLevel: "medium",
    },
    styleDNA: {
      dominantArchetypes: ["classic", "preppy", "natural"],
      colorPaletteAffinity: ["navy", "burgundy", "forest_green", "gray"],
      formalityBaseline: 60,
      paceOfLife: "moderate",
    },
    culturalFactors: {
      primaryIndustries: ["finance", "architecture", "food"],
      styleInfluencers: ["Loop", "Lincoln Park", "Wicker Park"],
    },
    pipelineConfig: {
      outfitCombinations: 400,
      priority: 3,
    },
  },

  // Tier 2: Major Metro Areas
  {
    cityId: "miami-fl",
    displayName: "Miami",
    timezone: "America/New_York",
    tier: 2,
    climate: {
      type: "tropical",
      avgTemperature: { winter: 70, spring: 78, summer: 85, fall: 80 },
      precipitationDays: 135,
      humidityLevel: "high",
    },
    styleDNA: {
      dominantArchetypes: ["romantic", "edgy", "bohemian"],
      colorPaletteAffinity: ["white", "coral", "turquoise", "gold"],
      formalityBaseline: 30,
      paceOfLife: "relaxed",
    },
    culturalFactors: {
      primaryIndustries: ["tourism", "finance", "entertainment"],
      styleInfluencers: ["South Beach", "Wynwood", "Brickell"],
    },
    pipelineConfig: {
      outfitCombinations: 350,
      priority: 4,
    },
  },
  {
    cityId: "san-francisco-ca",
    displayName: "San Francisco",
    timezone: "America/Los_Angeles",
    tier: 2,
    climate: {
      type: "temperate",
      avgTemperature: { winter: 52, spring: 58, summer: 62, fall: 60 },
      precipitationDays: 70,
      humidityLevel: "high",
    },
    styleDNA: {
      dominantArchetypes: ["minimalist", "natural", "creative"],
      colorPaletteAffinity: ["gray", "navy", "olive", "black"],
      formalityBaseline: 40,
      paceOfLife: "moderate",
    },
    culturalFactors: {
      primaryIndustries: ["tech", "finance", "biotech"],
      styleInfluencers: ["Mission District", "SOMA", "Pacific Heights"],
    },
    pipelineConfig: {
      outfitCombinations: 350,
      priority: 5,
    },
  },
  {
    cityId: "seattle-wa",
    displayName: "Seattle",
    timezone: "America/Los_Angeles",
    tier: 2,
    climate: {
      type: "temperate",
      avgTemperature: { winter: 42, spring: 52, summer: 68, fall: 55 },
      precipitationDays: 150,
      humidityLevel: "high",
    },
    styleDNA: {
      dominantArchetypes: ["natural", "minimalist", "street"],
      colorPaletteAffinity: ["gray", "forest_green", "navy", "black"],
      formalityBaseline: 35,
      paceOfLife: "moderate",
    },
    culturalFactors: {
      primaryIndustries: ["tech", "aerospace", "coffee"],
      styleInfluencers: ["Capitol Hill", "Ballard", "South Lake Union"],
    },
    pipelineConfig: {
      outfitCombinations: 300,
      priority: 6,
    },
  },
  {
    cityId: "austin-tx",
    displayName: "Austin",
    timezone: "America/Chicago",
    tier: 2,
    climate: {
      type: "temperate",
      avgTemperature: { winter: 52, spring: 70, summer: 95, fall: 75 },
      precipitationDays: 85,
      humidityLevel: "medium",
    },
    styleDNA: {
      dominantArchetypes: ["bohemian", "creative", "natural"],
      colorPaletteAffinity: ["denim", "earth_tones", "turquoise", "rust"],
      formalityBaseline: 30,
      paceOfLife: "relaxed",
    },
    culturalFactors: {
      primaryIndustries: ["tech", "music", "government"],
      styleInfluencers: ["South Congress", "East Austin", "Downtown"],
    },
    pipelineConfig: {
      outfitCombinations: 300,
      priority: 7,
    },
  },
  {
    cityId: "boston-ma",
    displayName: "Boston",
    timezone: "America/New_York",
    tier: 2,
    climate: {
      type: "continental",
      avgTemperature: { winter: 32, spring: 50, summer: 75, fall: 55 },
      precipitationDays: 125,
      humidityLevel: "medium",
    },
    styleDNA: {
      dominantArchetypes: ["classic", "preppy", "natural"],
      colorPaletteAffinity: ["navy", "crimson", "forest_green", "khaki"],
      formalityBaseline: 65,
      paceOfLife: "moderate",
    },
    culturalFactors: {
      primaryIndustries: ["education", "healthcare", "finance", "tech"],
      styleInfluencers: ["Back Bay", "Cambridge", "Beacon Hill"],
    },
    pipelineConfig: {
      outfitCombinations: 300,
      priority: 8,
    },
  },

  // Tier 3: Growing Markets
  {
    cityId: "denver-co",
    displayName: "Denver",
    timezone: "America/Denver",
    tier: 3,
    climate: {
      type: "continental",
      avgTemperature: { winter: 35, spring: 52, summer: 75, fall: 55 },
      precipitationDays: 90,
      humidityLevel: "low",
    },
    styleDNA: {
      dominantArchetypes: ["natural", "street", "bohemian"],
      colorPaletteAffinity: ["earth_tones", "denim", "orange", "forest_green"],
      formalityBaseline: 30,
      paceOfLife: "moderate",
    },
    culturalFactors: {
      primaryIndustries: ["tech", "outdoor_recreation", "cannabis"],
      styleInfluencers: ["LoDo", "RiNo", "Cherry Creek"],
    },
    pipelineConfig: {
      outfitCombinations: 250,
      priority: 9,
    },
  },
  {
    cityId: "nashville-tn",
    displayName: "Nashville",
    timezone: "America/Chicago",
    tier: 3,
    climate: {
      type: "temperate",
      avgTemperature: { winter: 42, spring: 62, summer: 82, fall: 62 },
      precipitationDays: 120,
      humidityLevel: "medium",
    },
    styleDNA: {
      dominantArchetypes: ["bohemian", "romantic", "classic"],
      colorPaletteAffinity: ["denim", "neutrals", "floral", "leather_brown"],
      formalityBaseline: 45,
      paceOfLife: "relaxed",
    },
    culturalFactors: {
      primaryIndustries: ["music", "healthcare", "tourism"],
      styleInfluencers: ["Broadway", "East Nashville", "12 South"],
    },
    pipelineConfig: {
      outfitCombinations: 250,
      priority: 10,
    },
  },
  {
    cityId: "atlanta-ga",
    displayName: "Atlanta",
    timezone: "America/New_York",
    tier: 3,
    climate: {
      type: "temperate",
      avgTemperature: { winter: 45, spring: 65, summer: 85, fall: 65 },
      precipitationDays: 115,
      humidityLevel: "high",
    },
    styleDNA: {
      dominantArchetypes: ["street", "edgy", "classic"],
      colorPaletteAffinity: ["black", "gold", "red", "earth_tones"],
      formalityBaseline: 50,
      paceOfLife: "moderate",
    },
    culturalFactors: {
      primaryIndustries: ["entertainment", "logistics", "tech"],
      styleInfluencers: ["Buckhead", "Midtown", "West Midtown"],
    },
    pipelineConfig: {
      outfitCombinations: 250,
      priority: 11,
    },
  },
  {
    cityId: "portland-or",
    displayName: "Portland",
    timezone: "America/Los_Angeles",
    tier: 3,
    climate: {
      type: "temperate",
      avgTemperature: { winter: 42, spring: 55, summer: 72, fall: 55 },
      precipitationDays: 155,
      humidityLevel: "high",
    },
    styleDNA: {
      dominantArchetypes: ["creative", "natural", "bohemian"],
      colorPaletteAffinity: ["forest_green", "maroon", "gray", "earth_tones"],
      formalityBaseline: 25,
      paceOfLife: "relaxed",
    },
    culturalFactors: {
      primaryIndustries: ["tech", "crafts", "outdoor_recreation"],
      styleInfluencers: ["Pearl District", "Alberta Arts", "Hawthorne"],
    },
    pipelineConfig: {
      outfitCombinations: 200,
      priority: 12,
    },
  },
];

// =============================================================================
// Helper Functions
// =============================================================================

export function getCityById(cityId: string): CityStyleProfile | undefined {
  return PRIORITY_CITIES.find((city) => city.cityId === cityId);
}

export function getCitiesByTier(tier: 1 | 2 | 3): CityStyleProfile[] {
  return PRIORITY_CITIES.filter((city) => city.tier === tier);
}

export function getAllCityIds(): string[] {
  return PRIORITY_CITIES.map((city) => city.cityId);
}

/**
 * Calculate regional relevance score for a signal combination
 */
export function calculateRegionalScore(
  city: CityStyleProfile,
  signals: { persona?: Persona; vibe?: Vibe; colorEnergy?: ColorEnergy }
): number {
  let score = 50; // Base score

  // Boost if persona matches city's dominant archetypes
  if (
    signals.persona &&
    city.styleDNA.dominantArchetypes.some((arch) =>
      signals.persona?.toLowerCase().includes(arch.toLowerCase())
    )
  ) {
    score += 20;
  }

  // Boost if color energy matches city palette affinity
  if (signals.colorEnergy) {
    const colorMatch = city.styleDNA.colorPaletteAffinity.some((color) =>
      signals.colorEnergy?.toLowerCase().includes(color.toLowerCase())
    );
    if (colorMatch) score += 15;
  }

  // Adjust based on city's formality baseline
  const formalVibes = ["polished", "minimal"];
  const casualVibes = ["laid_back", "creative"];

  if (signals.vibe) {
    if (
      city.styleDNA.formalityBaseline > 60 &&
      formalVibes.includes(signals.vibe)
    ) {
      score += 10;
    } else if (
      city.styleDNA.formalityBaseline < 40 &&
      casualVibes.includes(signals.vibe)
    ) {
      score += 10;
    }
  }

  return Math.min(100, score);
}
