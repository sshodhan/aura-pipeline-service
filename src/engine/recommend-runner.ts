/**
 * Recommendation benchmark runner (Phases 3–4)
 *
 * Runs the benchmark scenarios through recommend() and summarizes each role's
 * outfit, validity, distinctness, rubric scores, curation, model calls and
 * latency, and builds the blind calibration sheet for human raters (Phase 6).
 * Key-free; the CLI (src/scripts/run-recommend.ts) injects Gemini writers
 * when asked.
 */

import { createHash } from "node:crypto";

import type { Scenario } from "../baseline/fixtures";
import { regionForScenario } from "../knowledge/coverage";
import type { KnowledgeStore } from "../knowledge/store";
import { recommend, type RecommendOptions } from "./recommend";
import type { RecommendationCollection } from "./outfit-types";
import { QUALITY_DIMENSIONS, type QualityDimension } from "./quality";
import type { ConceptRole } from "./types";

export interface RecommendRunOptions extends Omit<RecommendOptions, "region" | "onPrompt"> {
  store: KnowledgeStore;
  asOf: string;
  onPrompt?: (scenarioId: string, stage: "concepts" | "outfits" | "curation", prompt: string, call: number) => void;
}

export interface RecommendScenarioResult {
  scenarioId: string;
  collection: RecommendationCollection;
}

export async function runRecommendScenarios(scenarios: Scenario[], options: RecommendRunOptions): Promise<RecommendScenarioResult[]> {
  const { store, onPrompt, ...rest } = options;
  const results: RecommendScenarioResult[] = [];
  for (const scenario of scenarios) {
    const collection = await recommend(scenario.context, store, {
      ...rest,
      region: regionForScenario(scenario),
      onPrompt: onPrompt ? (stage, prompt, call) => onPrompt(scenario.id, stage, prompt, call) : undefined,
    });
    results.push({ scenarioId: scenario.id, collection });
  }
  return results;
}

export interface RecommendRunSummary {
  scenarios: number;
  byStatus: Record<RecommendationCollection["status"], number>;
  validCollections: number;
  modelCalls: { concepts: number; outfits: number; curation: number; total: number };
  fallbacks: { concepts: number; outfits: number };
  latencyMs: { p50: number; max: number };
  issueCounts: Record<string, number>;
  /** Phase 4 rubric; null when curation was off for every scenario. */
  quality: {
    outfits: number;
    meanScores: Record<QualityDimension, number>;
    revised: number;
    lowConfidence: number;
    rubricIssueCounts: Record<string, number>;
  } | null;
  rows: {
    scenarioId: string;
    status: RecommendationCollection["status"];
    modes: string;
    garments: Partial<Record<ConceptRole, string>>;
    /** Rubric scores per role as "composition/relevance/distinctiveness/visual", plus the curation outcome when not accepted. */
    scores: Partial<Record<ConceptRole, string>>;
    minDifferingSlots: number | null;
    valid: boolean;
    modelCalls: number;
    latencyMs: number;
    issues: string[];
  }[];
}

const percentile = (values: number[], p: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
};

export function summarizeRecommendRun(results: RecommendScenarioResult[]): RecommendRunSummary {
  const byStatus = { ok: 0, fallback: 0, invalid_request: 0, insufficient_knowledge: 0 };
  const issueCounts: Record<string, number> = {};
  const modelCalls = { concepts: 0, outfits: 0, curation: 0, total: 0 };
  const fallbacks = { concepts: 0, outfits: 0 };
  const assessments = results.flatMap(({ collection: c }) => c.quality?.assessments ?? []);
  const rubricIssueCounts: Record<string, number> = {};

  const rows = results.map(({ scenarioId, collection: c }) => {
    byStatus[c.status]++;
    const d = c.diagnostics;
    modelCalls.concepts += d.concepts.modelCalls;
    modelCalls.outfits += d.outfits?.modelCalls ?? 0;
    modelCalls.curation += d.curation?.modelCalls ?? 0;
    modelCalls.total += d.totalModelCalls;
    if (d.concepts.generationMode === "template_fallback") fallbacks.concepts++;
    if (d.outfits?.generationMode === "template_fallback") fallbacks.outfits++;
    const attemptCodes = [...d.concepts.attempts, ...(d.outfits?.attempts ?? [])].flatMap((a) => a.issueCodes ?? []);
    const finalCodes = [...(c.validation.concepts?.issues ?? []), ...(c.validation.outfits?.issues ?? [])].map((i) => i.code);
    for (const code of [...attemptCodes, ...finalCodes]) issueCounts[code] = (issueCounts[code] ?? 0) + 1;
    const garments: Partial<Record<ConceptRole, string>> = {};
    const scores: Partial<Record<ConceptRole, string>> = {};
    for (const r of c.recommendations) {
      garments[r.role] = r.outfit.garments.map((g) => g.name).join(" / ");
      if (r.quality) {
        const e = r.quality.editorialAssessment;
        scores[r.role] = `${QUALITY_DIMENSIONS.map((dim) => e[dim]).join("/")}${r.quality.outcome === "accepted" ? "" : ` ${r.quality.outcome}`}`;
      }
    }
    for (const code of (c.quality?.assessments ?? []).flatMap((a) => a.issueCodes)) rubricIssueCounts[code] = (rubricIssueCounts[code] ?? 0) + 1;
    const slots = c.validation.outfits?.differingCoreSlots.map((x) => x.slots) ?? [];
    return {
      scenarioId,
      status: c.status,
      modes: `${d.concepts.generationMode} → ${d.outfits?.generationMode ?? "–"}${d.curation && d.curation.mode !== "none" ? ` → ${d.curation.mode}` : ""}`,
      garments,
      scores,
      minDifferingSlots: slots.length > 0 ? Math.min(...slots) : null,
      valid: Boolean(c.validation.concepts?.passed && c.validation.outfits?.passed),
      modelCalls: d.totalModelCalls,
      latencyMs: d.latencyMs,
      issues: [
        ...(c.validation.concepts?.issues ?? []).map((i) => `concept ${i.role ?? ""}: ${i.message}`),
        ...(c.validation.outfits?.issues ?? []).map((i) => `outfit ${i.role ?? ""}: ${i.message}`),
        ...c.errors,
      ],
    };
  });

  const latencies = rows.map((r) => r.latencyMs);
  return {
    scenarios: results.length,
    byStatus,
    validCollections: rows.filter((r) => r.valid).length,
    modelCalls,
    fallbacks,
    latencyMs: { p50: percentile(latencies, 50), max: Math.max(0, ...latencies) },
    issueCounts,
    quality:
      assessments.length === 0
        ? null
        : {
            outfits: assessments.length,
            meanScores: Object.fromEntries(
              QUALITY_DIMENSIONS.map((dim) => [dim, Math.round((assessments.reduce((n, a) => n + a.editorialAssessment[dim], 0) / assessments.length) * 100) / 100])
            ) as Record<QualityDimension, number>,
            revised: assessments.filter((a) => a.outcome === "revised").length,
            lowConfidence: assessments.filter((a) => a.outcome === "low_confidence").length,
            rubricIssueCounts,
          },
    rows,
  };
}

export function renderRecommendSummaryMarkdown(
  summary: RecommendRunSummary,
  meta: { writer: string; modelId: string | null; asOf: string; knowledgeVersion: string; engineVersion: string; gitCommit: string | null }
): string {
  const lines = [
    "# Recommendation run (concepts, outfits, curation)",
    "",
    `- Writer: ${meta.writer}${meta.modelId ? ` (${meta.modelId})` : ""}; engine ${meta.engineVersion}; knowledge ${meta.knowledgeVersion}; as of ${meta.asOf}; commit ${meta.gitCommit ?? "unknown"}`,
    `- Collections: ${summary.scenarios}; valid: ${summary.validCollections}; status: ${Object.entries(summary.byStatus)
      .filter(([, n]) => n > 0)
      .map(([s, n]) => `${s} ${n}`)
      .join(", ")}`,
    `- Model calls: ${summary.modelCalls.total} (concepts ${summary.modelCalls.concepts}, outfits ${summary.modelCalls.outfits}, curation ${summary.modelCalls.curation}); template fallbacks: concepts ${summary.fallbacks.concepts}, outfits ${summary.fallbacks.outfits}`,
    summary.quality
      ? `- Rubric (uncalibrated, 1–5): mean ${QUALITY_DIMENSIONS.map((d) => `${d} ${summary.quality!.meanScores[d]}`).join(", ")}; revised ${summary.quality.revised}, low confidence ${summary.quality.lowConfidence} of ${summary.quality.outfits}; rubric issues: ${
          Object.entries(summary.quality.rubricIssueCounts)
            .map(([c, n]) => `${c} ${n}`)
            .join(", ") || "none"
        }`
      : "- Rubric: curation off",
    `- Latency per request: p50 ${summary.latencyMs.p50} ms, max ${summary.latencyMs.max} ms`,
    `- Issues seen (including failed model attempts): ${
      Object.entries(summary.issueCounts)
        .map(([c, n]) => `${c} ${n}`)
        .join(", ") || "none"
    }`,
    meta.writer === "template"
      ? "- Template outfits are deterministic picks from the knowledge store's garment vocabularies. They show the composition and the checks, not editorial quality."
      : "",
    "",
    "| Scenario | Status | Modes | Best bet | Adjacent | Exploration | Rubric (C/R/D/V per role) | Min differing core garments | Valid | Calls | ms |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...summary.rows.map(
      (r) =>
        `| ${r.scenarioId} | ${r.status} | ${r.modes} | ${r.garments.best_bet ?? "–"} | ${r.garments.adjacent ?? "–"} | ${r.garments.exploration ?? "–"} | ` +
        `${[r.scores.best_bet, r.scores.adjacent, r.scores.exploration].map((x) => x ?? "–").join(" · ")} | ` +
        `${r.minDifferingSlots ?? "–"} | ${r.valid ? "yes" : "no"} | ${r.modelCalls} | ${r.latencyMs} |`
    ),
    "",
  ];
  const withIssues = summary.rows.filter((r) => r.issues.length > 0);
  if (withIssues.length > 0) {
    lines.push("## Issues", "");
    for (const r of withIssues) lines.push(`- **${r.scenarioId}**: ${r.issues.join("; ")}`);
    lines.push("");
  }
  return lines.filter((l, i, all) => !(l === "" && all[i - 1] === "")).join("\n");
}

// =============================================================================
// Calibration sheet (Phase 6 input)
// =============================================================================

export const CALIBRATION_SHEET_COLUMNS = [
  "item_id",
  "group",
  "context",
  "garments",
  "composition_1to5",
  "contextual_relevance_1to5",
  "distinctiveness_1to5",
  "visual_potential_1to5",
  "overall_1to5",
  "notes",
] as const;

export const CALIBRATION_KEY_COLUMNS = [
  "item_id",
  "scenario_id",
  "role",
  "aesthetic",
  "composition",
  "contextual_relevance",
  "distinctiveness",
  "visual_potential",
  "decision",
  "outcome",
  "issue_codes",
  "evaluator_version",
  "engine_version",
  "knowledge_version",
] as const;

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (header: readonly string[], rows: (string | number)[][]) => [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";

/** A plain description of the request for a rater: what the person told Aura, nothing the engine decided. */
function describeContext(c: Scenario["context"]): string {
  const w = c.weather;
  const parts = [
    c.city,
    c.occasion,
    c.lifestyle ? `${c.lifestyle} lifestyle` : "",
    w ? `${w.temperatureC}°C, ${w.condition}${w.precipitationLikely ? ", precipitation likely" : ""}` : "",
    ...Object.entries(c.demographics ?? {}).map(([k, v]) => `${k}: ${v}`),
    ...Object.entries(c.preferences ?? {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`),
  ];
  return parts.filter(Boolean).join(" · ");
}

/**
 * Two sheets: a blind one for raters (garments and context only; no roles,
 * aesthetics, prose or scores, and roles shuffled within each scenario) and
 * the key that joins their ratings back to the rubric. Item ids are stable
 * for the same scenario and role, so repeated runs can be compared.
 */
export function calibrationSheets(scenarios: Scenario[], results: RecommendScenarioResult[]): { sheet: string; key: string } {
  const sheet: (string | number)[][] = [];
  const key: (string | number)[][] = [];
  results.forEach(({ scenarioId, collection: c }, index) => {
    const scenario = scenarios.find((s) => s.id === scenarioId);
    if (!scenario) return;
    const group = `S${String(index + 1).padStart(2, "0")}`;
    const items = c.recommendations
      .map((r) => ({ r, itemId: createHash("sha256").update(`${scenarioId}:${r.role}`).digest("hex").slice(0, 8) }))
      .sort((a, b) => a.itemId.localeCompare(b.itemId));
    for (const { r, itemId } of items) {
      const garments = r.outfit.garments.map((g) => `${g.name} (${[...new Set([g.material, g.fit, g.silhouette])].join(", ")})`).join("; ");
      sheet.push([itemId, group, describeContext(scenario.context), garments, "", "", "", "", "", ""]);
      const e = r.quality?.editorialAssessment;
      key.push([
        itemId,
        scenarioId,
        r.role,
        r.outfit.aesthetic,
        e?.composition ?? "",
        e?.contextualRelevance ?? "",
        e?.distinctiveness ?? "",
        e?.visualPotential ?? "",
        r.quality?.decision ?? "",
        r.quality?.outcome ?? "",
        (r.quality?.issueCodes ?? []).join(" "),
        r.quality?.evaluatorVersion ?? "",
        c.engineVersion,
        c.knowledgeVersion,
      ]);
    }
  });
  return { sheet: toCsv(CALIBRATION_SHEET_COLUMNS, sheet), key: toCsv(CALIBRATION_KEY_COLUMNS, key) };
}
