/**
 * Concept benchmark runner (Phase 2)
 *
 * Runs the Phase 0 benchmark scenarios through planStyleDirections and
 * summarizes roles, aesthetics, diversity, validation, model calls and
 * latency. Key-free; the CLI (src/scripts/run-concepts.ts) injects a Gemini
 * writer when asked.
 */

import type { Scenario } from "../baseline/fixtures";
import { regionForScenario } from "../knowledge/coverage";
import type { KnowledgeStore } from "../knowledge/store";
import { planStyleDirections, type PlanOptions } from "./plan";
import type { ConceptCollection, ConceptRole } from "./types";
import type { ConceptWriter } from "./writer";

export interface ConceptRunOptions {
  store: KnowledgeStore;
  writer: ConceptWriter;
  asOf: string;
  maxModelCalls?: number;
  sleep?: PlanOptions["sleep"];
  onPrompt?: (scenarioId: string, prompt: string, call: number) => void;
}

export interface ConceptScenarioResult {
  scenarioId: string;
  title: string;
  collection: ConceptCollection;
}

export async function runConceptScenarios(scenarios: Scenario[], options: ConceptRunOptions): Promise<ConceptScenarioResult[]> {
  const results: ConceptScenarioResult[] = [];
  for (const scenario of scenarios) {
    const collection = await planStyleDirections(scenario.context, options.store, {
      writer: options.writer,
      asOf: options.asOf,
      region: regionForScenario(scenario),
      maxModelCalls: options.maxModelCalls,
      sleep: options.sleep,
      onPrompt: options.onPrompt ? (prompt, call) => options.onPrompt!(scenario.id, prompt, call) : undefined,
    });
    results.push({ scenarioId: scenario.id, title: scenario.title, collection });
  }
  return results;
}

export interface ConceptRunSummary {
  scenarios: number;
  byStatus: Record<ConceptCollection["status"], number>;
  validCollections: number;
  modelCalls: number;
  revisions: number;
  fallbacks: number;
  tokens: { prompt: number; output: number; total: number } | null;
  latencyMs: { p50: number; max: number };
  /** How often each aesthetic fills each role. */
  aestheticsByRole: Record<ConceptRole, Record<string, number>>;
  issueCounts: Record<string, number>;
  rows: {
    scenarioId: string;
    status: ConceptCollection["status"];
    mode: string;
    roles: Partial<Record<ConceptRole, string>>;
    minDistance: number | null;
    maxSimilarity: number | null;
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

export function summarizeConceptRun(results: ConceptScenarioResult[]): ConceptRunSummary {
  const byStatus = { ok: 0, fallback: 0, invalid_request: 0, insufficient_knowledge: 0 };
  const aestheticsByRole: ConceptRunSummary["aestheticsByRole"] = { best_bet: {}, adjacent: {}, exploration: {} };
  const issueCounts: Record<string, number> = {};
  let tokens: ConceptRunSummary["tokens"] = null;

  const rows = results.map(({ scenarioId, collection: c }) => {
    byStatus[c.status]++;
    const roles: Partial<Record<ConceptRole, string>> = {};
    for (const concept of c.concepts) {
      roles[concept.role] = concept.aesthetic;
      aestheticsByRole[concept.role][concept.aesthetic] = (aestheticsByRole[concept.role][concept.aesthetic] ?? 0) + 1;
    }
    // Count issues from model attempts too, so a run shows what the model got wrong before any fallback.
    const attemptIssues = c.diagnostics.attempts.flatMap((a) => a.issueCodes ?? []);
    for (const code of [...attemptIssues, ...(c.validation?.issues.map((i) => i.code) ?? [])]) issueCounts[code] = (issueCounts[code] ?? 0) + 1;
    if (c.diagnostics.tokens) {
      tokens = tokens ?? { prompt: 0, output: 0, total: 0 };
      tokens.prompt += c.diagnostics.tokens.prompt;
      tokens.output += c.diagnostics.tokens.output;
      tokens.total += c.diagnostics.tokens.total;
    }
    const distances = c.selection?.distances.map((d) => d.distance) ?? [];
    const similarities = c.validation?.similarity.map((s) => s.jaccard) ?? [];
    return {
      scenarioId,
      status: c.status,
      mode: c.diagnostics.generationMode,
      roles,
      minDistance: distances.length > 0 ? Math.min(...distances) : null,
      maxSimilarity: similarities.length > 0 ? Math.max(...similarities) : null,
      valid: c.validation?.passed ?? false,
      modelCalls: c.diagnostics.modelCalls,
      latencyMs: c.diagnostics.latencyMs,
      issues: [...(c.validation?.issues.map((i) => `${i.role ?? "collection"}: ${i.message}`) ?? []), ...c.errors],
    };
  });

  const latencies = rows.map((r) => r.latencyMs);
  return {
    scenarios: results.length,
    byStatus,
    validCollections: rows.filter((r) => r.valid).length,
    modelCalls: rows.reduce((n, r) => n + r.modelCalls, 0),
    revisions: results.reduce((n, r) => n + r.collection.diagnostics.revisions, 0),
    fallbacks: byStatus.fallback,
    tokens,
    latencyMs: { p50: percentile(latencies, 50), max: Math.max(0, ...latencies) },
    aestheticsByRole,
    issueCounts,
    rows,
  };
}

export function renderConceptSummaryMarkdown(
  summary: ConceptRunSummary,
  meta: { writer: string; modelId: string | null; asOf: string; knowledgeVersion: string; engineVersion: string; gitCommit: string | null }
): string {
  const lines = [
    "# Style direction run (Phase 2)",
    "",
    `- Writer: ${meta.writer}${meta.modelId ? ` (${meta.modelId})` : ""}; engine ${meta.engineVersion}; knowledge ${meta.knowledgeVersion}; as of ${meta.asOf}; commit ${meta.gitCommit ?? "unknown"}`,
    `- Collections: ${summary.scenarios}; valid: ${summary.validCollections}; status: ${Object.entries(summary.byStatus)
      .filter(([, n]) => n > 0)
      .map(([s, n]) => `${s} ${n}`)
      .join(", ")}`,
    `- Model calls: ${summary.modelCalls} (revisions ${summary.revisions}, template fallbacks ${summary.fallbacks}); tokens: ${
      summary.tokens ? `${summary.tokens.total} total (${summary.tokens.prompt} in / ${summary.tokens.output} out)` : "not reported"
    }`,
    `- Latency per collection: p50 ${summary.latencyMs.p50} ms, max ${summary.latencyMs.max} ms`,
    `- Issues seen (including failed model attempts): ${
      Object.entries(summary.issueCounts)
        .map(([c, n]) => `${c} ${n}`)
        .join(", ") || "none"
    }`,
    meta.writer === "template"
      ? "- Template concepts are deterministic compositions of knowledge records. They show the plan and the checks, not editorial quality."
      : "",
    "",
    "| Scenario | Status | Best bet | Adjacent | Exploration | Min aesthetic distance | Max text overlap | Valid | Calls | ms |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...summary.rows.map(
      (r) =>
        `| ${r.scenarioId} | ${r.status} (${r.mode}) | ${r.roles.best_bet ?? "–"} | ${r.roles.adjacent ?? "–"} | ${r.roles.exploration ?? "–"} | ` +
        `${r.minDistance ?? "–"} | ${r.maxSimilarity ?? "–"} | ${r.valid ? "yes" : "no"} | ${r.modelCalls} | ${r.latencyMs} |`
    ),
    "",
    "## Aesthetics by role",
    "",
    "| Role | Aesthetics (count) |",
    "|---|---|",
    ...(Object.entries(summary.aestheticsByRole) as [ConceptRole, Record<string, number>][]).map(
      ([role, counts]) =>
        `| ${role} | ${Object.entries(counts)
          .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
          .map(([a, n]) => `${a} ${n}`)
          .join(", ")} |`
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
