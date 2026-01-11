/**
 * Stage 3: Style Matrix Generation
 *
 * Creates all valid signal combinations for each city.
 */

import { pipelineLogger as logger } from "../../utils/logger";
import type { CitySignalBundle } from "./2-signal-aggregation";
import type { StyleMatrix, StyleMatrixEntry } from "../../models/outfit";
import {
  PERSONAS,
  OCCASIONS,
  VIBES,
  COLOR_ENERGIES,
  isValidCombination,
  type SignalCombination,
  type TemperatureRange,
  type WeatherCondition,
} from "../../models/signals";
import { calculateRegionalScore } from "../../models/city";

// =============================================================================
// Stage Implementation
// =============================================================================

export async function runStyleMatrixGeneration(
  citySignals: Map<string, CitySignalBundle>
): Promise<Map<string, StyleMatrix>> {
  logger.info({ cityCount: citySignals.size }, "Stage 3: Starting style matrix generation");

  const matrices = new Map<string, StyleMatrix>();

  for (const [cityId, signals] of citySignals) {
    const matrix = generateMatrixForCity(signals);
    matrices.set(cityId, matrix);

    logger.debug(
      { cityId, entries: matrix.entries.length },
      "Generated style matrix for city"
    );
  }

  const totalEntries = Array.from(matrices.values()).reduce(
    (sum, m) => sum + m.entries.length,
    0
  );

  logger.info(
    { matricesCreated: matrices.size, totalEntries },
    "Stage 3: Style matrix generation complete"
  );

  return matrices;
}

// =============================================================================
// Matrix Generation Logic
// =============================================================================

function generateMatrixForCity(citySignal: CitySignalBundle): StyleMatrix {
  const entries: StyleMatrixEntry[] = [];
  const { prioritySignals, weather, cityProfile } = citySignal;

  // Use city's priority signals to focus generation
  const personas = prioritySignals.topPersonas.length > 0
    ? prioritySignals.topPersonas
    : PERSONAS.slice(0, 4);

  const occasions = prioritySignals.topOccasions.length > 0
    ? prioritySignals.topOccasions
    : OCCASIONS.slice(0, 5);

  const vibes = prioritySignals.topVibes.length > 0
    ? prioritySignals.topVibes
    : VIBES.slice(0, 4);

  // Current weather conditions
  const temperatureRange = weather.stylingImplications.temperatureRange;
  const weatherCondition = weather.current.condition;

  // Generate combinations
  for (const persona of personas) {
    for (const occasion of occasions) {
      for (const vibe of vibes) {
        for (const colorEnergy of COLOR_ENERGIES) {
          const signals: SignalCombination = {
            persona: persona as any,
            occasion: occasion as any,
            vibe: vibe as any,
            colorEnergy,
            weatherCondition,
            temperatureRange,
          };

          // Check compatibility
          if (!isValidCombination(signals)) {
            continue;
          }

          // Calculate scores
          const regionalBoost = calculateRegionalScore(cityProfile, {
            persona: signals.persona,
            vibe: signals.vibe,
            colorEnergy: signals.colorEnergy,
          });

          const confidence = calculateInitialConfidence(signals, citySignal);

          // Only include combinations with reasonable confidence
          if (confidence < 30) {
            continue;
          }

          const key = buildMatrixKey(signals);

          entries.push({
            key,
            signals,
            confidence,
            regionalBoost,
          });
        }
      }
    }
  }

  // Sort by confidence and regional boost
  entries.sort((a, b) => {
    const scoreA = a.confidence + a.regionalBoost * 0.3;
    const scoreB = b.confidence + b.regionalBoost * 0.3;
    return scoreB - scoreA;
  });

  // Limit entries based on city tier
  const maxEntries = cityProfile.pipelineConfig.outfitCombinations;
  const limitedEntries = entries.slice(0, maxEntries);

  return {
    cityId: citySignal.cityId,
    generatedAt: new Date(),
    personas: [...new Set(limitedEntries.map((e) => e.signals.persona))],
    occasions: [...new Set(limitedEntries.map((e) => e.signals.occasion))],
    vibes: [...new Set(limitedEntries.map((e) => e.signals.vibe))],
    colorEnergies: [...new Set(limitedEntries.map((e) => e.signals.colorEnergy))],
    entries: limitedEntries,
    stats: {
      totalEntries: limitedEntries.length,
      coveragePercentage: (limitedEntries.length / entries.length) * 100,
      avgConfidence:
        limitedEntries.reduce((sum, e) => sum + e.confidence, 0) / limitedEntries.length,
    },
  };
}

function buildMatrixKey(signals: SignalCombination): string {
  return [
    signals.persona,
    signals.occasion,
    signals.vibe,
    signals.colorEnergy,
    `${signals.temperatureRange}_${signals.weatherCondition}`,
  ].join("|");
}

function calculateInitialConfidence(
  signals: SignalCombination,
  citySignal: CitySignalBundle
): number {
  let confidence = 60; // Base confidence

  // Boost if persona matches city's top personas
  if (citySignal.prioritySignals.topPersonas.includes(signals.persona)) {
    confidence += 15;
  }

  // Boost if occasion matches city's top occasions
  if (citySignal.prioritySignals.topOccasions.includes(signals.occasion)) {
    confidence += 10;
  }

  // Boost if vibe matches city's top vibes
  if (citySignal.prioritySignals.topVibes.includes(signals.vibe)) {
    confidence += 10;
  }

  // Penalty for weather mismatches
  if (
    signals.temperatureRange === "cold" &&
    ["laid_back", "creative"].includes(signals.vibe)
  ) {
    confidence -= 5; // Harder to be creative in cold weather
  }

  return Math.max(0, Math.min(100, confidence));
}
