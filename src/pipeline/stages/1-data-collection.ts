/**
 * Stage 1: Data Collection
 *
 * Collects all external data needed for pipeline processing:
 * - Weather data for all cities
 * - City profiles
 * - Trend signals (placeholder for future)
 */

import { pipelineLogger as logger } from "../../utils/logger";
import { getWeatherForCities } from "../../services/weather";
import { cacheWeatherContext } from "../../services/redis";
import { PRIORITY_CITIES, getCityById, type CityStyleProfile } from "../../models/city";
import type { WeatherContext } from "../../models/outfit";
import { getSeasonalTrendDefaults } from "../core/trend-defaults";

// =============================================================================
// Types
// =============================================================================

export interface CollectedData {
  weather: Map<string, WeatherContext>;
  cityProfiles: Map<string, CityStyleProfile>;
  trends: TrendSignals;
  collectedAt: Date;
}

export interface TrendSignals {
  hotColors: string[];
  emergingStyles: string[];
  seasonalThemes: string[];
}

// =============================================================================
// Stage Implementation
// =============================================================================

export async function runDataCollection(cityIds: string[]): Promise<CollectedData> {
  logger.info({ cityCount: cityIds.length }, "Stage 1: Starting data collection");

  // Parallel data fetching
  const [weather, cityProfiles, trends] = await Promise.all([
    collectWeatherData(cityIds),
    collectCityProfiles(cityIds),
    collectTrendSignals(),
  ]);

  const collectedData: CollectedData = {
    weather,
    cityProfiles,
    trends,
    collectedAt: new Date(),
  };

  logger.info(
    {
      weatherCities: weather.size,
      profilesCities: cityProfiles.size,
    },
    "Stage 1: Data collection complete"
  );

  return collectedData;
}

// =============================================================================
// Weather Collection
// =============================================================================

async function collectWeatherData(
  cityIds: string[]
): Promise<Map<string, WeatherContext>> {
  logger.info({ cityCount: cityIds.length }, "Collecting weather data");

  const weatherMap = await getWeatherForCities(cityIds);

  // Cache weather data for API access
  for (const [cityId, weather] of weatherMap) {
    await cacheWeatherContext(weather);
  }

  logger.info({ collected: weatherMap.size }, "Weather data collected and cached");
  return weatherMap;
}

// =============================================================================
// City Profiles Collection
// =============================================================================

async function collectCityProfiles(
  cityIds: string[]
): Promise<Map<string, CityStyleProfile>> {
  logger.info({ cityCount: cityIds.length }, "Loading city profiles");

  const profileMap = new Map<string, CityStyleProfile>();

  for (const cityId of cityIds) {
    const profile = getCityById(cityId);
    if (profile) {
      profileMap.set(cityId, profile);
    } else {
      logger.warn({ cityId }, "City profile not found");
    }
  }

  logger.info({ loaded: profileMap.size }, "City profiles loaded");
  return profileMap;
}

// =============================================================================
// Trend Signals Collection (Placeholder)
// =============================================================================

async function collectTrendSignals(): Promise<TrendSignals> {
  // TODO: Integrate with trend APIs (Pinterest, Instagram, fashion blogs)
  // For now, return seasonal defaults
  const { season, trends } = getSeasonalTrendDefaults(new Date().getMonth());
  logger.info({ season, trends }, "Trend signals collected");

  return trends;
}
