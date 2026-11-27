import { describe, expect, it } from "vitest";

import { mapTemperatureRange, buildStylingImplications } from "../../src/pipeline/core/weather-styling";
import { OUTFIT_TTL_SECONDS } from "../../src/baseline/runner";
import { PIPELINE_TEXT_MODEL } from "../../src/utils/models";

describe("weather styling rules (moved from services/weather.ts)", () => {
  it("buckets °F temperatures", () => {
    expect([39.9, 40, 54.9, 55, 69.9, 70, 84.9, 85].map(mapTemperatureRange)).toEqual([
      "cold", "cool", "cool", "mild", "mild", "warm", "warm", "hot",
    ]);
  });

  it("derives layering, rain and sun implications", () => {
    expect(
      buildStylingImplications({ currentTempF: 30, condition: "snow", morningTempF: 18, afternoonTempF: 39 })
    ).toEqual({
      layeringRequired: true,
      rainProtection: false,
      sunProtection: false,
      temperatureRange: "cold",
      fabricRecommendations: ["wool", "fleece", "down", "cashmere"],
    });
    expect(
      buildStylingImplications({ currentTempF: 75, condition: "light_rain", morningTempF: 70, afternoonTempF: 76 })
    ).toMatchObject({ rainProtection: true, fabricRecommendations: ["linen", "cotton", "breathable synthetics", "water-resistant", "quick-dry"] });
  });
});

describe("constants mirrored from config", () => {
  it("match the pipeline configuration", async () => {
    process.env.GEMINI_API_KEY ??= "test-key";
    process.env.WEATHER_API_KEY ??= "test-key";
    // config validates LOG_LEVEL against its own enum, which has no "silent".
    const logLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "error";
    const { config } = await import("../../src/utils/config");
    process.env.LOG_LEVEL = logLevel;
    expect(OUTFIT_TTL_SECONDS).toBe(config.cache.ttl.outfit);
    expect(PIPELINE_TEXT_MODEL).toBe(config.gemini.model);
  });
});
