/**
 * Weather Styling Rules (pipeline core)
 *
 * Pure mappings from weather to styling implications, moved unchanged from
 * services/weather.ts so fixture weather can be turned into a WeatherContext
 * without calling OpenWeatherMap or loading API keys.
 */

import type { WeatherContext } from "../../models/outfit";
import type { WeatherCondition, TemperatureRange } from "../../models/signals";

const RAIN_CONDITIONS: WeatherCondition[] = ["rain", "heavy_rain", "light_rain", "thunderstorm"];

export function mapTemperatureRange(tempF: number): TemperatureRange {
  if (tempF < 40) return "cold";
  if (tempF < 55) return "cool";
  if (tempF < 70) return "mild";
  if (tempF < 85) return "warm";
  return "hot";
}

export function getFabricRecommendations(
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
  if (RAIN_CONDITIONS.includes(condition)) {
    fabrics.push("water-resistant", "quick-dry");
  }

  return fabrics;
}

export function buildStylingImplications(input: {
  currentTempF: number;
  condition: WeatherCondition;
  morningTempF: number;
  afternoonTempF: number;
}): WeatherContext["stylingImplications"] {
  const temperatureRange = mapTemperatureRange(input.currentTempF);
  return {
    layeringRequired: Math.abs(input.morningTempF - input.afternoonTempF) > 15,
    rainProtection: RAIN_CONDITIONS.includes(input.condition),
    sunProtection: input.condition === "clear" && temperatureRange !== "cold",
    temperatureRange,
    fabricRecommendations: getFabricRecommendations(temperatureRange, input.condition),
  };
}
