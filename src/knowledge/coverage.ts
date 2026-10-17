/**
 * Scenario Knowledge Coverage
 *
 * Reports, for each benchmark scenario, which current knowledge the store can
 * offer. It reports what exists; it sets no minimums for regional or
 * contemporary evidence, and an empty result is an honest answer, not a gap
 * to fill with weaker claims.
 */

import { getSeason } from "../pipeline/core/trend-defaults";
import type { Scenario } from "../baseline/fixtures";
import { EVIDENCE_TYPES, type EvidenceType, type KnowledgeSeason } from "./schema";
import type { KnowledgeStore } from "./store";

export interface ScenarioCoverage {
  scenarioId: string;
  city: string;
  /** Knowledge region slug: the pipeline cityId, or a slug of the city name. */
  region: string;
  season: KnowledgeSeason;
  counts: Record<EvidenceType, number>;
  ids: Record<EvidenceType, string[]>;
  /** Plain statements about what is absent (no thresholds implied). */
  notes: string[];
}

export function regionForScenario(scenario: Scenario): string {
  return (
    scenario.baselineMapping.cityId ??
    scenario.context.city
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  );
}

/** Northern-hemisphere season for a date; all benchmark cities are northern. */
export function seasonFor(asOf: string): KnowledgeSeason {
  return getSeason(new Date(`${asOf}T12:00:00Z`).getUTCMonth()) as KnowledgeSeason;
}

export function scenarioCoverage(store: KnowledgeStore, scenarios: Scenario[], asOf: string): ScenarioCoverage[] {
  const season = seasonFor(asOf);
  return scenarios.map((scenario) => {
    const region = regionForScenario(scenario);
    const hits = store.query({ regions: [region], season, asOf });
    const ids = Object.fromEntries(
      EVIDENCE_TYPES.map((t) => [t, hits.filter((h) => h.evidence.type === t).map((h) => h.evidence.id)])
    ) as Record<EvidenceType, string[]>;
    const counts = Object.fromEntries(EVIDENCE_TYPES.map((t) => [t, ids[t].length])) as Record<EvidenceType, number>;

    const notes: string[] = [];
    if (counts.regional_influence === 0) notes.push(`no regional evidence curated for ${region}`);
    if (counts.contemporary_observation === 0) notes.push(`no current contemporary evidence for ${season}`);
    const approved = hits.filter((h) => h.evidence.editorialStatus === "approved").length;
    if (approved === 0) notes.push("all available evidence is provisional (not yet editor-approved)");

    return { scenarioId: scenario.id, city: scenario.context.city, region, season, counts, ids, notes };
  });
}
