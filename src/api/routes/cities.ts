/**
 * Cities API Routes
 *
 * Endpoints for city information and style profiles.
 */

import { Router } from "express";

import { apiLogger as logger } from "../../utils/logger";
import { PRIORITY_CITIES, getCityById, getCitiesByTier } from "../../models/city";
import { getWeatherContext, getCityBundleCount } from "../../services/redis";

export const citiesRouter = Router();

// =============================================================================
// GET /cities
// =============================================================================

citiesRouter.get("/", async (_req, res) => {
  try {
    const cities = PRIORITY_CITIES.map((city) => ({
      cityId: city.cityId,
      displayName: city.displayName,
      tier: city.tier,
      timezone: city.timezone,
      styleDNA: {
        dominantArchetypes: city.styleDNA.dominantArchetypes,
        formalityBaseline: city.styleDNA.formalityBaseline,
      },
    }));

    return res.json({
      success: true,
      count: cities.length,
      cities,
    });
  } catch (error) {
    logger.error({ error: (error as Error).message }, "Error fetching cities");

    return res.status(500).json({
      error: "Internal Server Error",
    });
  }
});

// =============================================================================
// GET /cities/:cityId
// =============================================================================

citiesRouter.get("/:cityId", async (req, res) => {
  const { cityId } = req.params;

  try {
    const city = getCityById(cityId);

    if (!city) {
      return res.status(404).json({
        error: "Not Found",
        message: `City '${cityId}' not found`,
      });
    }

    // Get additional data
    const today = new Date().toISOString().split("T")[0]!;
    const [weather, bundleCount] = await Promise.all([
      getWeatherContext(cityId, today),
      getCityBundleCount(cityId),
    ]);

    return res.json({
      success: true,
      city: {
        ...city,
        currentWeather: weather?.current || null,
        cachedBundles: bundleCount,
      },
    });
  } catch (error) {
    logger.error({ error: (error as Error).message, cityId }, "Error fetching city");

    return res.status(500).json({
      error: "Internal Server Error",
    });
  }
});

// =============================================================================
// GET /cities/:cityId/weather
// =============================================================================

citiesRouter.get("/:cityId/weather", async (req, res) => {
  const { cityId } = req.params;

  try {
    const city = getCityById(cityId);

    if (!city) {
      return res.status(404).json({
        error: "Not Found",
        message: `City '${cityId}' not found`,
      });
    }

    const today = new Date().toISOString().split("T")[0]!;
    const weather = await getWeatherContext(cityId, today);

    if (!weather) {
      return res.status(404).json({
        error: "Not Found",
        message: "Weather data not available. Pipeline may not have run yet.",
      });
    }

    return res.json({
      success: true,
      cityId,
      weather,
    });
  } catch (error) {
    logger.error({ error: (error as Error).message, cityId }, "Error fetching weather");

    return res.status(500).json({
      error: "Internal Server Error",
    });
  }
});

// =============================================================================
// GET /cities/tier/:tier
// =============================================================================

citiesRouter.get("/tier/:tier", async (req, res) => {
  const tier = parseInt(req.params.tier, 10) as 1 | 2 | 3;

  if (![1, 2, 3].includes(tier)) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Tier must be 1, 2, or 3",
    });
  }

  try {
    const cities = getCitiesByTier(tier).map((city) => ({
      cityId: city.cityId,
      displayName: city.displayName,
      styleDNA: city.styleDNA,
    }));

    return res.json({
      success: true,
      tier,
      count: cities.length,
      cities,
    });
  } catch (error) {
    logger.error({ error: (error as Error).message, tier }, "Error fetching cities by tier");

    return res.status(500).json({
      error: "Internal Server Error",
    });
  }
});
