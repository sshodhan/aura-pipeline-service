/**
 * Weather Service
 *
 * Fetches weather data from OpenWeatherMap API.
 */

import { config } from "../utils/config";
import { weatherLogger as logger } from "../utils/logger";
import type { WeatherContext, WeatherPeriod } from "../models/outfit";
import type { WeatherCondition, TemperatureRange } from "../models/signals";
import { getCityById } from "../models/city";

// =============================================================================
// Types
// =============================================================================

interface OpenWeatherResponse {
  coord: { lon: number; lat: number };
  weather: Array<{ id: number; main: string; description: string }>;
  main: {
    temp: number;
    feels_like: number;
    humidity: number;
  };
  wind: { speed: number };
  clouds: { all: number };
  dt: number;
  name: string;
}

interface OpenWeatherForecastResponse {
  list: Array<{
    dt: number;
    main: {
      temp: number;
      feels_like: number;
      humidity: number;
    };
    weather: Array<{ id: number; main: string }>;
    pop: number; // Probability of precipitation
  }>;
}

// City coordinates for API calls
const CITY_COORDINATES: Record<string, { lat: number; lon: number }> = {
  "new-york-ny": { lat: 40.7128, lon: -74.006 },
  "los-angeles-ca": { lat: 34.0522, lon: -118.2437 },
  "chicago-il": { lat: 41.8781, lon: -87.6298 },
  "miami-fl": { lat: 25.7617, lon: -80.1918 },
  "san-francisco-ca": { lat: 37.7749, lon: -122.4194 },
  "seattle-wa": { lat: 47.6062, lon: -122.3321 },
  "austin-tx": { lat: 30.2672, lon: -97.7431 },
  "boston-ma": { lat: 42.3601, lon: -71.0589 },
  "denver-co": { lat: 39.7392, lon: -104.9903 },
  "nashville-tn": { lat: 36.1627, lon: -86.7816 },
  "atlanta-ga": { lat: 33.749, lon: -84.388 },
  "portland-or": { lat: 45.5152, lon: -122.6784 },
};

// =============================================================================
// Weather Condition Mapping
// =============================================================================

function mapWeatherCondition(weatherId: number): WeatherCondition {
  // OpenWeatherMap condition codes: https://openweathermap.org/weather-conditions
  if (weatherId >= 200 && weatherId < 300) return "thunderstorm";
  if (weatherId >= 300 && weatherId < 400) return "light_rain";
  if (weatherId >= 500 && weatherId < 505) return "rain";
  if (weatherId >= 505 && weatherId < 600) return "heavy_rain";
  if (weatherId >= 600 && weatherId < 620) return "snow";
  if (weatherId >= 620 && weatherId < 700) return "sleet";
  if (weatherId >= 700 && weatherId < 800) return "fog";
  if (weatherId === 800) return "clear";
  if (weatherId === 801) return "partly_cloudy";
  if (weatherId === 802) return "cloudy";
  if (weatherId >= 803) return "overcast";
  return "clear";
}

function mapTemperatureRange(tempF: number): TemperatureRange {
  if (tempF < 40) return "cold";
  if (tempF < 55) return "cool";
  if (tempF < 70) return "mild";
  if (tempF < 85) return "warm";
  return "hot";
}

function getFabricRecommendations(
  tempRange: TemperatureRange,
  condition: WeatherCondition
): string[] {
  const fabrics: string[] = [];

  // Temperature-based
  switch (tempRange) {
    case "cold":
      fabrics.push("wool", "fleece", "down", "cashmere");
      break;
    case "cool":
      fabrics.push("cotton blend", "light wool", "denim");
      break;
    case "mild":
      fabrics.push("cotton", "linen blend", "lightweight knit");
      break;
    case "warm":
      fabrics.push("linen", "cotton", "breathable synthetics");
      break;
    case "hot":
      fabrics.push("linen", "lightweight cotton", "moisture-wicking");
      break;
  }

  // Weather condition-based
  if (["rain", "heavy_rain", "light_rain", "thunderstorm"].includes(condition)) {
    fabrics.push("water-resistant", "quick-dry");
  }

  return fabrics;
}

// =============================================================================
// API Functions
// =============================================================================

async function fetchCurrentWeather(
  cityId: string
): Promise<OpenWeatherResponse> {
  const coords = CITY_COORDINATES[cityId];
  if (!coords) {
    throw new Error(`Unknown city: ${cityId}`);
  }

  const url = `${config.weather.baseUrl}/weather?lat=${coords.lat}&lon=${coords.lon}&appid=${config.weather.apiKey}&units=imperial`;

  logger.debug({ cityId, url: url.replace(config.weather.apiKey, "***") }, "Fetching current weather");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<OpenWeatherResponse>;
}

async function fetchForecast(
  cityId: string
): Promise<OpenWeatherForecastResponse> {
  const coords = CITY_COORDINATES[cityId];
  if (!coords) {
    throw new Error(`Unknown city: ${cityId}`);
  }

  const url = `${config.weather.baseUrl}/forecast?lat=${coords.lat}&lon=${coords.lon}&appid=${config.weather.apiKey}&units=imperial`;

  logger.debug({ cityId }, "Fetching weather forecast");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<OpenWeatherForecastResponse>;
}

// =============================================================================
// Main Export Functions
// =============================================================================

export async function getWeatherForCity(cityId: string): Promise<WeatherContext> {
  const city = getCityById(cityId);
  if (!city) {
    throw new Error(`Unknown city: ${cityId}`);
  }

  logger.info({ cityId }, "Fetching weather data");

  const [current, forecast] = await Promise.all([
    fetchCurrentWeather(cityId),
    fetchForecast(cityId),
  ]);

  const today = new Date().toISOString().split("T")[0]!;
  const currentCondition = mapWeatherCondition(current.weather[0]?.id || 800);
  const temperatureRange = mapTemperatureRange(current.main.temp);

  // Extract forecast periods (morning, afternoon, evening)
  const forecastPeriods = extractForecastPeriods(forecast, city.timezone);

  const weatherContext: WeatherContext = {
    cityId,
    date: today,
    fetchedAt: new Date(),

    current: {
      temperature: Math.round(current.main.temp),
      feelsLike: Math.round(current.main.feels_like),
      humidity: current.main.humidity,
      windSpeed: Math.round(current.wind.speed),
      condition: currentCondition,
      uvIndex: 5, // OpenWeatherMap doesn't provide UV in free tier
    },

    forecast: forecastPeriods,

    stylingImplications: {
      layeringRequired:
        Math.abs(forecastPeriods.morning.temperature - forecastPeriods.afternoon.temperature) > 15,
      rainProtection: ["rain", "heavy_rain", "light_rain", "thunderstorm"].includes(currentCondition),
      sunProtection: currentCondition === "clear" && temperatureRange !== "cold",
      temperatureRange,
      fabricRecommendations: getFabricRecommendations(temperatureRange, currentCondition),
    },
  };

  logger.info(
    {
      cityId,
      temp: weatherContext.current.temperature,
      condition: currentCondition,
    },
    "Weather data fetched"
  );

  return weatherContext;
}

function extractForecastPeriods(
  forecast: OpenWeatherForecastResponse,
  _timezone: string
): { morning: WeatherPeriod; afternoon: WeatherPeriod; evening: WeatherPeriod } {
  // OpenWeatherMap returns 3-hour intervals
  // Find periods closest to 9 AM, 2 PM, and 7 PM
  const now = Date.now();
  const todayStart = new Date().setHours(0, 0, 0, 0);

  const findClosestPeriod = (targetHour: number): WeatherPeriod => {
    const targetTime = todayStart + targetHour * 60 * 60 * 1000;

    let closest = forecast.list[0];
    let closestDiff = Math.abs((closest?.dt || 0) * 1000 - targetTime);

    for (const period of forecast.list) {
      const diff = Math.abs(period.dt * 1000 - targetTime);
      if (diff < closestDiff && period.dt * 1000 > now) {
        closest = period;
        closestDiff = diff;
      }
    }

    return {
      temperature: Math.round(closest?.main.temp || 70),
      feelsLike: Math.round(closest?.main.feels_like || 70),
      condition: mapWeatherCondition(closest?.weather[0]?.id || 800),
      precipitation: Math.round((closest?.pop || 0) * 100),
    };
  };

  return {
    morning: findClosestPeriod(9), // 9 AM
    afternoon: findClosestPeriod(14), // 2 PM
    evening: findClosestPeriod(19), // 7 PM
  };
}

export async function getWeatherForCities(
  cityIds: string[]
): Promise<Map<string, WeatherContext>> {
  const results = new Map<string, WeatherContext>();

  // Fetch in batches to respect rate limits
  const batchSize = 5;
  for (let i = 0; i < cityIds.length; i += batchSize) {
    const batch = cityIds.slice(i, i + batchSize);
    const weatherPromises = batch.map(async (cityId) => {
      try {
        const weather = await getWeatherForCity(cityId);
        results.set(cityId, weather);
      } catch (error) {
        logger.error({ cityId, error }, "Failed to fetch weather");
      }
    });

    await Promise.all(weatherPromises);

    // Small delay between batches
    if (i + batchSize < cityIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  logger.info({ count: results.size }, "Weather data fetched for all cities");
  return results;
}
