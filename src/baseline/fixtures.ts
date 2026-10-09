/**
 * Baseline Scenario Fixtures
 *
 * Schema and loader for the Phase 0 benchmark scenarios in fixtures/scenarios.
 * Each scenario states a cold-start request in the design's
 * RecommendationContext shape (docs/FASHION_INTELLIGENCE_DESIGN.md) and how
 * that request maps onto the current pipeline's fixed signals (Variant B).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";

import {
  PERSONAS,
  OCCASIONS,
  VIBES,
  COLOR_ENERGIES,
  WEATHER_CONDITIONS,
} from "../models/signals";
import type { WeatherContext, WeatherPeriod } from "../models/outfit";
import { buildStylingImplications } from "../pipeline/core/weather-styling";

// =============================================================================
// Schema
// =============================================================================

/** The design doc's RecommendationContext (Planned API input). */
export const recommendationContextSchema = z
  .object({
    requestId: z.string().min(1),
    city: z.string().min(1),
    occasion: z.string().min(1),
    lifestyle: z.string().min(1),
    weather: z
      .object({
        temperatureC: z.number().min(-40).max(55),
        condition: z.string().min(1),
        precipitationLikely: z.boolean().optional(),
      })
      .strict(),
    demographics: z
      .object({
        genderExpression: z.string().min(1).optional(),
        ageRange: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    preferences: z
      .object({
        preferredColors: z.array(z.string().min(1)).optional(),
        avoidedColors: z.array(z.string().min(1)).optional(),
        fit: z.string().min(1).optional(),
        comfortPriority: z.string().min(1).optional(),
        preferredAesthetics: z.array(z.string().min(1)).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type RecommendationContext = z.infer<typeof recommendationContextSchema>;

export const scenarioSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    title: z.string().min(1),
    context: recommendationContextSchema,
    /** Weather detail the current pipeline needs beyond the context. */
    weatherFixture: z
      .object({
        humidity: z.number().min(0).max(100),
        windKph: z.number().min(0),
        feelsLikeC: z.number().optional(),
        morningTempC: z.number().optional(),
        afternoonTempC: z.number().optional(),
        eveningTempC: z.number().optional(),
      })
      .strict(),
    /** How this request maps onto the current pipeline's fixed signals. */
    baselineMapping: z
      .object({
        cityId: z.string().min(1).nullable(), // null: the pipeline has no such city
        persona: z.enum(PERSONAS),
        occasion: z.enum(OCCASIONS),
        vibe: z.enum(VIBES),
        colorEnergy: z.enum(COLOR_ENERGIES),
        weatherCondition: z.enum(WEATHER_CONDITIONS),
        notes: z.string().min(1),
      })
      .strict(),
    /** Requirements any good answer satisfies; for later automated/human checks. */
    expectedConstraints: z.array(z.string().min(1)).min(1),
    /** Ways the current pipeline is expected to fall short for this request. */
    knownFailureCases: z.array(z.string().min(1)),
  })
  .strict();

export type Scenario = z.infer<typeof scenarioSchema>;

// =============================================================================
// Loading
// =============================================================================

export const DEFAULT_SCENARIO_DIR = resolve(__dirname, "../../fixtures/scenarios");

export function loadScenarioFile(path: string): Scenario {
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const parsed = scenarioSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid scenario ${path}: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function loadScenarios(paths?: string[]): Scenario[] {
  const files =
    paths && paths.length > 0
      ? paths.map((p) => resolve(p))
      : readdirSync(DEFAULT_SCENARIO_DIR)
          .filter((f) => f.endsWith(".json"))
          .sort()
          .map((f) => join(DEFAULT_SCENARIO_DIR, f));

  const scenarios = files.map(loadScenarioFile);
  const ids = new Set<string>();
  for (const s of scenarios) {
    if (ids.has(s.id)) throw new Error(`Duplicate scenario id: ${s.id}`);
    ids.add(s.id);
  }
  return scenarios;
}

// =============================================================================
// Fixture weather → pipeline WeatherContext
// =============================================================================

export const cToF = (c: number) => (c * 9) / 5 + 32;

/**
 * Builds the WeatherContext the pipeline would have fetched from
 * OpenWeatherMap, using the same styling rules (pipeline/core/weather-styling).
 * Temperatures are converted to °F and rounded like services/weather.ts.
 */
export function buildWeatherContext(scenario: Scenario, date: string): WeatherContext {
  const { context, weatherFixture, baselineMapping } = scenario;
  const condition = baselineMapping.weatherCondition;
  const currentF = cToF(context.weather.temperatureC);
  const period = (c: number | undefined): WeatherPeriod => {
    const f = cToF(c ?? context.weather.temperatureC);
    return {
      temperature: Math.round(f),
      feelsLike: Math.round(f),
      condition,
      precipitation: context.weather.precipitationLikely ? 70 : 0,
    };
  };
  const forecast = {
    morning: period(weatherFixture.morningTempC),
    afternoon: period(weatherFixture.afternoonTempC),
    evening: period(weatherFixture.eveningTempC),
  };

  return {
    cityId: baselineMapping.cityId ?? "unsupported",
    date,
    fetchedAt: new Date(`${date}T12:00:00Z`),
    current: {
      temperature: Math.round(currentF),
      feelsLike: Math.round(cToF(weatherFixture.feelsLikeC ?? context.weather.temperatureC)),
      humidity: weatherFixture.humidity,
      windSpeed: Math.round(weatherFixture.windKph / 1.609), // pipeline stores mph
      condition,
      uvIndex: 5, // services/weather.ts hard-codes this too
    },
    forecast,
    stylingImplications: buildStylingImplications({
      currentTempF: currentF,
      condition,
      morningTempF: forecast.morning.temperature,
      afternoonTempF: forecast.afternoon.temperature,
    }),
  };
}
