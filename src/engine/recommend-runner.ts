/**
 * Recommendation benchmark runner (Phase 3)
 *
 * Runs the benchmark scenarios through recommend() and summarizes each role's
 * outfit, validity, distinctness, model calls and latency. Key-free; the CLI
 * (src/scripts/run-recommend.ts) injects Gemini writers when asked.
 */

import type { Scenario } from "../baseline/fixtures";
import { regionForScenario } from "../knowledge/coverage";
import type { KnowledgeStore } from "../knowledge/store";
import { recommend, type RecommendOptions } from "./recommend";
import type { RecommendationCollection } from "./outfit-types";
import type { ConceptRole } from "./types";

export interface RecommendRunOptions extends Omit<RecommendOptions, "region" | "onPrompt"> {
  store: KnowledgeStore;
  asOf: string;
  onPrompt?: (scenarioId: string, stage: "concepts" | "outfits", prompt: string, call: number) => void;
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
  modelCalls: { concepts: number; outfits: number; total: number };
  fallbacks: { concepts: number; outfits: number };
  latencyMs: { p50: number; max: number };
  issueCounts: Record<string, number>;
  rows: {
    scenarioId: string;
    status: RecommendationCollection["status"];
    modes: string;
    garments: Partial<Record<ConceptRole, string>>;
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
  const modelCalls = { concepts: 0, outfits: 0, total: 0 };
  const fallbacks = { concepts: 0, outfits: 0 };

  const rows = results.map(({ scenarioId, collection: c }) => {
    byStatus[c.status]++;
    const d = c.diagnostics;
    modelCalls.concepts += d.concepts.modelCalls;
    modelCalls.outfits += d.outfits?.modelCalls ?? 0;
    modelCalls.total += d.totalModelCalls;
    if (d.concepts.generationMode === "template_fallback") fallbacks.concepts++;
    if (d.outfits?.generationMode === "template_fallback") fallbacks.outfits++;
    const attemptCodes = [...d.concepts.attempts, ...(d.outfits?.attempts ?? [])].flatMap((a) => a.issueCodes ?? []);
    const finalCodes = [...(c.validation.concepts?.issues ?? []), ...(c.validation.outfits?.issues ?? [])].map((i) => i.code);
    for (const code of [...attemptCodes, ...finalCodes]) issueCounts[code] = (issueCounts[code] ?? 0) + 1;
    const garments: Partial<Record<ConceptRole, string>> = {};
    for (const r of c.recommendations) garments[r.role] = r.outfit.garments.map((g) => g.name).join(" / ");
    const slots = c.validation.outfits?.differingCoreSlots.map((x) => x.slots) ?? [];
    return {
      scenarioId,
      status: c.status,
      modes: `${d.concepts.generationMode} → ${d.outfits?.generationMode ?? "–"}`,
      garments,
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
    rows,
  };
}

export function renderRecommendSummaryMarkdown(
  summary: RecommendRunSummary,
  meta: { writer: string; modelId: string | null; asOf: string; knowledgeVersion: string; engineVersion: string; gitCommit: string | null }
): string {
  const lines = [
    "# Recommendation run (Phase 3: concepts + outfits)",
    "",
    `- Writer: ${meta.writer}${meta.modelId ? ` (${meta.modelId})` : ""}; engine ${meta.engineVersion}; knowledge ${meta.knowledgeVersion}; as of ${meta.asOf}; commit ${meta.gitCommit ?? "unknown"}`,
    `- Collections: ${summary.scenarios}; valid: ${summary.validCollections}; status: ${Object.entries(summary.byStatus)
      .filter(([, n]) => n > 0)
      .map(([s, n]) => `${s} ${n}`)
      .join(", ")}`,
    `- Model calls: ${summary.modelCalls.total} (concepts ${summary.modelCalls.concepts}, outfits ${summary.modelCalls.outfits}); template fallbacks: concepts ${summary.fallbacks.concepts}, outfits ${summary.fallbacks.outfits}`,
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
    "| Scenario | Status | Modes | Best bet | Adjacent | Exploration | Min differing core garments | Valid | Calls | ms |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...summary.rows.map(
      (r) =>
        `| ${r.scenarioId} | ${r.status} | ${r.modes} | ${r.garments.best_bet ?? "–"} | ${r.garments.adjacent ?? "–"} | ${r.garments.exploration ?? "–"} | ` +
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
