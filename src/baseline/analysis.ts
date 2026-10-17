/**
 * Baseline Analysis
 *
 * Deterministic replays of the current pipeline that need no model calls:
 * - coverage: would the nightly batch ever cache a bundle for this request,
 *   and how would GET /outfits/:cityId retrieve it?
 * - input loss: which parts of a RecommendationContext the pipeline drops or
 *   has to invent.
 * - call volume: how many Gemini calls one nightly run makes, and how many of
 *   the resulting bundles survive the Redis cache key.
 */

import {
  PERSONAS,
  OCCASIONS,
  VIBES,
  PERSONA_OCCASION_COMPATIBILITY,
  OCCASION_VIBE_COMPATIBILITY,
  type SignalCombination,
  type TemperatureRange,
} from "../models/signals";
import { PRIORITY_CITIES, getCityById, type CityStyleProfile } from "../models/city";
import {
  buildBundleCacheKey,
  type StyleMatrix,
  type StyleMatrixEntry,
  type WeatherContext,
} from "../models/outfit";
import { aggregateSignals, type CitySignalBundle } from "../pipeline/stages/2-signal-aggregation";
import { generateMatrixForCity, buildMatrixKey } from "../pipeline/stages/3-style-matrix";
import { getSeasonalTrendDefaults } from "../pipeline/core/trend-defaults";
import { buildStylingImplications } from "../pipeline/core/weather-styling";
import type { Scenario } from "./fixtures";

// =============================================================================
// Matrix replay
// =============================================================================

export interface CityMatrixReplay {
  city: CityStyleProfile;
  citySignal: CitySignalBundle;
  matrix: StyleMatrix;
}

/** Stage 2 + stage 3 for one city, exactly as the nightly run computes them. */
export function replayCityMatrix(
  city: CityStyleProfile,
  weather: WeatherContext,
  month: number
): CityMatrixReplay {
  const { trends } = getSeasonalTrendDefaults(month);
  const citySignal = aggregateSignals(city, weather, trends);
  return { city, citySignal, matrix: generateMatrixForCity(citySignal) };
}

// =============================================================================
// Coverage
// =============================================================================

export type CoverageReason =
  | "in_matrix"
  | "city_not_supported"
  | "persona_occasion_incompatible"
  | "occasion_vibe_incompatible"
  | "persona_not_prioritized_for_city"
  | "occasion_not_prioritized_for_city"
  | "vibe_not_prioritized_for_city"
  | "cut_by_city_limit";

export interface Coverage {
  citySupported: boolean;
  inMatrix: boolean;
  /** Every reason that applies, in pipeline order; ["in_matrix"] when served. */
  reasons: CoverageReason[];
  /** What GET /outfits/:cityId would do for this request today. */
  apiRetrieval: "exact" | "fuzzy" | "miss";
  /** Signal triples (persona|occasion|vibe) the city's matrix covers. */
  cityTriplesCovered?: number;
  /** Matrix entries (= Gemini calls) for this city per nightly run. */
  cityMatrixEntries?: number;
  /** Redis key the bundle would be stored under (colorEnergy is not part of it). */
  bundleCacheKey?: string;
  /** Matrix entries written to that same key; all but the last are overwritten. */
  entriesSharingCacheKey?: number;
  matchedEntry?: StyleMatrixEntry;
}

export function computeCoverage(
  scenario: Scenario,
  weather: WeatherContext,
  month: number
): Coverage {
  const m = scenario.baselineMapping;
  const city = m.cityId ? getCityById(m.cityId) : undefined;
  if (!city) {
    return {
      citySupported: false,
      inMatrix: false,
      reasons: ["city_not_supported"],
      apiRetrieval: "miss",
    };
  }

  const { citySignal, matrix } = replayCityMatrix(city, weather, month);
  const signals: SignalCombination = {
    persona: m.persona,
    occasion: m.occasion,
    vibe: m.vibe,
    colorEnergy: m.colorEnergy,
    weatherCondition: weather.current.condition,
    temperatureRange: weather.stylingImplications.temperatureRange,
  };

  const key = buildMatrixKey(signals);
  const matchedEntry = matrix.entries.find((e) => e.key === key);

  const reasons: CoverageReason[] = [];
  if (!PERSONA_OCCASION_COMPATIBILITY[m.persona].includes(m.occasion)) {
    reasons.push("persona_occasion_incompatible");
  }
  if (!OCCASION_VIBE_COMPATIBILITY[m.occasion].includes(m.vibe)) {
    reasons.push("occasion_vibe_incompatible");
  }
  // Stage 3 falls back to the first N signals when a city has no priorities
  // (src/pipeline/stages/3-style-matrix.ts:65-75).
  const { topPersonas, topOccasions, topVibes } = citySignal.prioritySignals;
  const considered = {
    personas: topPersonas.length > 0 ? topPersonas : PERSONAS.slice(0, 4),
    occasions: topOccasions.length > 0 ? topOccasions : OCCASIONS.slice(0, 5),
    vibes: topVibes.length > 0 ? topVibes : VIBES.slice(0, 4),
  };
  if (!considered.personas.includes(m.persona)) reasons.push("persona_not_prioritized_for_city");
  if (!considered.occasions.includes(m.occasion)) reasons.push("occasion_not_prioritized_for_city");
  if (!considered.vibes.includes(m.vibe)) reasons.push("vibe_not_prioritized_for_city");
  if (!matchedEntry && reasons.length === 0) reasons.push("cut_by_city_limit");

  const triples = new Set(
    matrix.entries.map((e) => `${e.signals.persona}|${e.signals.occasion}|${e.signals.vibe}`)
  );

  const bundleCacheKey = buildBundleCacheKey({
    cityId: city.cityId,
    date: weather.date,
    weatherCondition: signals.weatherCondition,
    temperatureRange: signals.temperatureRange,
    persona: m.persona,
    occasion: m.occasion,
    vibes: [m.vibe],
  });
  const entriesSharingCacheKey = matrix.entries.filter(
    (e) =>
      e.signals.persona === m.persona &&
      e.signals.occasion === m.occasion &&
      e.signals.vibe === m.vibe
  ).length;

  // GET /outfits/:cityId tries an exact key with hard-coded "mild"/"clear"
  // (src/api/routes/outfits.ts), then a KEYS pattern scan that ignores weather.
  const exactKeyWeather =
    signals.temperatureRange === "mild" && signals.weatherCondition === "clear";
  const apiRetrieval = matchedEntry ? (exactKeyWeather ? "exact" : "fuzzy") : "miss";

  return {
    citySupported: true,
    inMatrix: Boolean(matchedEntry),
    reasons: matchedEntry ? ["in_matrix"] : reasons,
    apiRetrieval,
    cityTriplesCovered: triples.size,
    cityMatrixEntries: matrix.entries.length,
    bundleCacheKey,
    entriesSharingCacheKey,
    matchedEntry,
  };
}

// =============================================================================
// Input loss
// =============================================================================

export interface InputLoss {
  /** Context fields the current pipeline has no way to use. */
  dropped: string[];
  /** Signals the pipeline requires that the context did not supply. */
  invented: string[];
  /** Free-form context mapped onto a fixed enum. */
  lossyMappings: string[];
}

export function computeInputLoss(scenario: Scenario): InputLoss {
  const { context, baselineMapping: m } = scenario;
  const dropped: string[] = [];
  const invented: string[] = [];
  const lossyMappings: string[] = [];

  if (context.demographics?.genderExpression) dropped.push("demographics.genderExpression");
  if (context.demographics?.ageRange) dropped.push("demographics.ageRange");
  const prefs = context.preferences ?? {};
  if (prefs.preferredColors?.length) dropped.push("preferences.preferredColors");
  if (prefs.avoidedColors?.length) dropped.push("preferences.avoidedColors");
  if (prefs.fit) dropped.push("preferences.fit");
  if (prefs.comfortPriority) dropped.push("preferences.comfortPriority");
  if (prefs.preferredAesthetics && prefs.preferredAesthetics.length > 1) {
    dropped.push("preferences.preferredAesthetics[1..] (one vibe per bundle)");
  }

  if (!prefs.preferredAesthetics?.length) invented.push(`vibe=${m.vibe}`);
  // colorEnergy has no RecommendationContext field; at best it approximates
  // the stated colors (which themselves never reach the prompt).
  if (prefs.preferredColors?.length) {
    lossyMappings.push(`preferredColors [${prefs.preferredColors.join(", ")}] → colorEnergy ${m.colorEnergy}`);
  } else {
    invented.push(`colorEnergy=${m.colorEnergy}`);
  }

  if (m.cityId === null) lossyMappings.push(`city "${context.city}" → unsupported`);
  else lossyMappings.push(`city "${context.city}" → ${m.cityId}`);
  lossyMappings.push(`occasion "${context.occasion}" → ${m.occasion}`);
  lossyMappings.push(`lifestyle "${context.lifestyle}" → persona ${m.persona}`);
  lossyMappings.push(`weather "${context.weather.condition}" → ${m.weatherCondition}`);

  return { dropped, invented, lossyMappings };
}

// =============================================================================
// Call volume
// =============================================================================

export interface CityVolume {
  cityId: string;
  tier: number;
  tierLimit: number;
  matrixEntries: number;
  distinctBundleKeys: number;
  overwrittenBundles: number;
  triplesCovered: string[];
  occasionsCovered: string[];
  personasCovered: string[];
}

export interface CallVolumeReport {
  temperatureRangesChecked: TemperatureRange[];
  entriesVaryWithTemperature: boolean;
  cities: CityVolume[];
  totals: {
    geminiCallsPerRun: number;
    worstCaseCallsWithRetries: number;
    distinctBundleKeys: number;
    overwrittenBundles: number;
    overwrittenShare: number;
  };
  occasionsNeverServed: string[];
  personasNeverServed: string[];
}

const REPRESENTATIVE_TEMPS_F: Record<TemperatureRange, number> = {
  cold: 30,
  cool: 48,
  mild: 62,
  warm: 78,
  hot: 92,
};

function syntheticWeather(cityId: string, tempF: number, date: string): WeatherContext {
  const period = { temperature: tempF, feelsLike: tempF, condition: "clear" as const, precipitation: 0 };
  return {
    cityId,
    date,
    fetchedAt: new Date(`${date}T12:00:00Z`),
    current: { temperature: tempF, feelsLike: tempF, humidity: 50, windSpeed: 5, condition: "clear", uvIndex: 5 },
    forecast: { morning: period, afternoon: period, evening: period },
    stylingImplications: buildStylingImplications({
      currentTempF: tempF,
      condition: "clear",
      morningTempF: tempF,
      afternoonTempF: tempF,
    }),
  };
}

/**
 * Replays stages 2–3 for every city at each temperature range. A nightly run
 * makes one Gemini call per matrix entry (plus up to 2 retries each), and
 * stage 6 writes each bundle to a key that omits colorEnergy.
 */
export function analyzeCallVolume(date: string, month: number): CallVolumeReport {
  const ranges = Object.keys(REPRESENTATIVE_TEMPS_F) as TemperatureRange[];
  let entriesVaryWithTemperature = false;
  const cities: CityVolume[] = [];

  for (const city of PRIORITY_CITIES) {
    const perRange = ranges.map((r) =>
      replayCityMatrix(city, syntheticWeather(city.cityId, REPRESENTATIVE_TEMPS_F[r], date), month)
    );
    const counts = new Set(perRange.map((p) => p.matrix.entries.length));
    if (counts.size > 1) entriesVaryWithTemperature = true;

    const { matrix } = perRange[ranges.indexOf("mild")]!;
    const keys = new Set(
      matrix.entries.map((e) =>
        buildBundleCacheKey({
          cityId: city.cityId,
          date,
          weatherCondition: e.signals.weatherCondition,
          temperatureRange: e.signals.temperatureRange,
          persona: e.signals.persona,
          occasion: e.signals.occasion,
          vibes: [e.signals.vibe],
        })
      )
    );
    const triples = [
      ...new Set(matrix.entries.map((e) => `${e.signals.persona}|${e.signals.occasion}|${e.signals.vibe}`)),
    ].sort();
    cities.push({
      cityId: city.cityId,
      tier: city.tier,
      tierLimit: city.pipelineConfig.outfitCombinations,
      matrixEntries: matrix.entries.length,
      distinctBundleKeys: keys.size,
      overwrittenBundles: matrix.entries.length - keys.size,
      triplesCovered: triples,
      occasionsCovered: [...new Set(matrix.entries.map((e) => e.signals.occasion))].sort(),
      personasCovered: [...new Set(matrix.entries.map((e) => e.signals.persona))].sort(),
    });
  }

  const calls = cities.reduce((s, c) => s + c.matrixEntries, 0);
  const keys = cities.reduce((s, c) => s + c.distinctBundleKeys, 0);
  const servedOccasions = new Set(cities.flatMap((c) => c.occasionsCovered));
  const servedPersonas = new Set(cities.flatMap((c) => c.personasCovered));

  return {
    temperatureRangesChecked: ranges,
    entriesVaryWithTemperature,
    cities,
    totals: {
      geminiCallsPerRun: calls,
      worstCaseCallsWithRetries: calls * 3,
      distinctBundleKeys: keys,
      overwrittenBundles: calls - keys,
      overwrittenShare: calls === 0 ? 0 : (calls - keys) / calls,
    },
    occasionsNeverServed: OCCASIONS.filter((o) => !servedOccasions.has(o)),
    personasNeverServed: PERSONAS.filter((p) => !servedPersonas.has(p)),
  };
}
