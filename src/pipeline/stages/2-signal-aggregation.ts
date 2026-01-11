/**
 * Stage 2: Signal Aggregation
 *
 * Transforms raw data into actionable style signals for each city.
 */

import { pipelineLogger as logger } from "../../utils/logger";
import type { CollectedData } from "./1-data-collection";
import type { CityStyleProfile } from "../../models/city";
import type { WeatherContext } from "../../models/outfit";
import type { TemperatureRange } from "../../models/signals";

// =============================================================================
// Types
// =============================================================================

export interface CitySignalBundle {
  cityId: string;
  cityProfile: CityStyleProfile;
  weather: WeatherContext;

  weatherSignals: {
    temperatureRange: TemperatureRange;
    layeringNeeded: boolean;
    precipitationLikely: boolean;
    fabricRecommendations: string[];
  };

  trendSignals: {
    hotColors: string[];
    emergingStyles: string[];
    seasonalThemes: string[];
  };

  prioritySignals: {
    topPersonas: string[];
    topOccasions: string[];
    topVibes: string[];
  };
}

// =============================================================================
// Stage Implementation
// =============================================================================

export async function runSignalAggregation(
  data: CollectedData
): Promise<Map<string, CitySignalBundle>> {
  logger.info({ cityCount: data.cityProfiles.size }, "Stage 2: Starting signal aggregation");

  const signalBundles = new Map<string, CitySignalBundle>();

  for (const [cityId, cityProfile] of data.cityProfiles) {
    const weather = data.weather.get(cityId);

    if (!weather) {
      logger.warn({ cityId }, "No weather data for city, skipping");
      continue;
    }

    const bundle = aggregateSignals(cityProfile, weather, data.trends);
    signalBundles.set(cityId, bundle);
  }

  logger.info(
    { bundlesCreated: signalBundles.size },
    "Stage 2: Signal aggregation complete"
  );

  return signalBundles;
}

// =============================================================================
// Signal Aggregation Logic
// =============================================================================

function aggregateSignals(
  cityProfile: CityStyleProfile,
  weather: WeatherContext,
  trends: CollectedData["trends"]
): CitySignalBundle {
  return {
    cityId: cityProfile.cityId,
    cityProfile,
    weather,

    weatherSignals: {
      temperatureRange: weather.stylingImplications.temperatureRange,
      layeringNeeded: weather.stylingImplications.layeringRequired,
      precipitationLikely: weather.stylingImplications.rainProtection,
      fabricRecommendations: weather.stylingImplications.fabricRecommendations,
    },

    trendSignals: {
      hotColors: mergeTrendsWithCity(trends.hotColors, cityProfile.styleDNA.colorPaletteAffinity),
      emergingStyles: trends.emergingStyles,
      seasonalThemes: trends.seasonalThemes,
    },

    prioritySignals: calculatePrioritySignals(cityProfile),
  };
}

function mergeTrendsWithCity(trendColors: string[], cityColors: string[]): string[] {
  // Combine trend colors with city-specific preferences
  const merged = [...new Set([...trendColors, ...cityColors])];
  return merged.slice(0, 6); // Top 6 colors
}

function calculatePrioritySignals(cityProfile: CityStyleProfile): CitySignalBundle["prioritySignals"] {
  // Determine top personas based on city style DNA
  const topPersonas = mapArchetypesToPersonas(cityProfile.styleDNA.dominantArchetypes);

  // Determine top occasions based on city pace and industry
  const topOccasions = mapCityToOccasions(cityProfile);

  // Determine top vibes based on formality baseline
  const topVibes = mapFormalityToVibes(cityProfile.styleDNA.formalityBaseline);

  return {
    topPersonas,
    topOccasions,
    topVibes,
  };
}

function mapArchetypesToPersonas(archetypes: string[]): string[] {
  const mapping: Record<string, string[]> = {
    classic: ["professional", "business-casual"],
    minimalist: ["elevated-casual", "professional"],
    edgy: ["street-style", "elevated-casual"],
    bohemian: ["casual", "elevated-casual"],
    natural: ["casual", "athleisure"],
    street: ["street-style", "athleisure"],
    preppy: ["business-casual", "professional"],
    creative: ["street-style", "elevated-casual"],
  };

  const personas = new Set<string>();
  for (const archetype of archetypes) {
    const mapped = mapping[archetype.toLowerCase()];
    if (mapped) {
      mapped.forEach((p) => personas.add(p));
    }
  }

  return Array.from(personas).slice(0, 4);
}

function mapCityToOccasions(cityProfile: CityStyleProfile): string[] {
  const { paceOfLife, formalityBaseline } = cityProfile.styleDNA;
  const { primaryIndustries } = cityProfile.culturalFactors;

  const occasions: string[] = [];

  // Add work-related occasions for business cities
  if (primaryIndustries.some((i) => ["finance", "tech", "business"].includes(i))) {
    occasions.push("work");
  }

  // Add casual occasions for relaxed cities
  if (paceOfLife === "relaxed" || formalityBaseline < 50) {
    occasions.push("hangout", "errands");
  }

  // Add dinner for cities with food culture
  if (primaryIndustries.includes("food") || formalityBaseline > 50) {
    occasions.push("dinner");
  }

  // Everyone has dates and active days
  occasions.push("date", "active");

  return [...new Set(occasions)].slice(0, 5);
}

function mapFormalityToVibes(formalityBaseline: number): string[] {
  if (formalityBaseline >= 70) {
    return ["polished", "minimal", "bold"];
  } else if (formalityBaseline >= 50) {
    return ["polished", "minimal", "laid_back"];
  } else if (formalityBaseline >= 30) {
    return ["laid_back", "creative", "minimal"];
  } else {
    return ["laid_back", "creative", "bold"];
  }
}
