/**
 * Baseline Runner (Variant B: current pipeline)
 *
 * Runs benchmark scenarios through the existing pipeline's own code paths:
 * stage 2–3 replay for coverage, the stage-4 prompt/model/parse loop, bundle
 * assembly and stage-5 rule-based scoring. No Redis, no weather API, and no
 * API keys unless the Gemini provider is selected.
 */

import { createHash } from "node:crypto";

import { getCityById, calculateRegionalScore } from "../models/city";
import type { PrecomputedOutfit, QualityMetrics, StyleMatrixEntry } from "../models/outfit";
import type { SignalCombination } from "../models/signals";
import { buildOutfitPrompt } from "../pipeline/core/outfit-prompt";
import {
  generateOutfitsWithModel,
  type GenerationAttempt,
  type TextGenerationModel,
} from "../pipeline/core/generate-outfits";
import { buildOutfitBundle } from "../pipeline/core/bundle";
import { buildMatrixKey } from "../pipeline/stages/3-style-matrix";
import { scoreBundle } from "../pipeline/stages/5-quality-scoring";
import { buildWeatherContext, type Scenario } from "./fixtures";
import { computeCoverage, computeInputLoss, type Coverage, type InputLoss } from "./analysis";

/** Mirrors config.cache.ttl.outfit (asserted equal in tests). */
export const OUTFIT_TTL_SECONDS = 24 * 60 * 60;

/** Orchestrator drops bundles below this score (src/pipeline/orchestrator.ts). */
export const PUBLISH_THRESHOLD = 40;

export const RESULT_SCHEMA_VERSION = 1;

// =============================================================================
// Types
// =============================================================================

export interface Pricing {
  inputPerMillionTokensUsd: number;
  outputPerMillionTokensUsd: number;
}

export interface RunOptions {
  provider: "mock" | "gemini";
  model: TextGenerationModel;
  modelId: string;
  /** True when modelId differs from the pipeline's configured model. */
  modelOverride: boolean;
  /** Run date (YYYY-MM-DD) used for weather, season and cache keys. */
  date: string;
  sleep?: (ms: number) => Promise<void>;
  pricing?: Pricing;
}

export interface ScenarioResult {
  resultSchemaVersion: number;
  variant: "B-current-pipeline";
  scenario: Pick<Scenario, "id" | "title" | "expectedConstraints" | "knownFailureCases">;
  context: Scenario["context"];
  mappedSignals: SignalCombination | null;
  run: { provider: RunOptions["provider"]; modelId: string; modelOverride: boolean; date: string };
  inputLoss: InputLoss;
  coverage: Omit<Coverage, "matchedEntry">;
  generation:
    | { status: "ok"; outfits: PrecomputedOutfit[] }
    | { status: "failed"; error: string }
    | { status: "skipped"; reason: string };
  quality: {
    ruleBased: QualityMetrics;
    mlScoring: "skipped";
    passesPublishThreshold: boolean;
  } | null;
  diagnostics: {
    modelCalls: number;
    retries: number;
    attempts: GenerationAttempt[];
    modelLatencyMs: number;
    wallClockMs: number;
    tokens: { prompt: number; output: number; total: number } | null;
    estimatedCostUsd: number | null;
    promptChars: number | null;
    promptSha256: string | null;
  };
  prompt: string | null;
}

// =============================================================================
// Scenario execution
// =============================================================================

export async function runScenario(scenario: Scenario, options: RunOptions): Promise<ScenarioResult> {
  const month = new Date(`${options.date}T12:00:00Z`).getUTCMonth();
  const weather = buildWeatherContext(scenario, options.date);
  const { matchedEntry, ...coverage } = computeCoverage(scenario, weather, month);
  const inputLoss = computeInputLoss(scenario);
  const m = scenario.baselineMapping;

  const base = {
    resultSchemaVersion: RESULT_SCHEMA_VERSION,
    variant: "B-current-pipeline" as const,
    scenario: {
      id: scenario.id,
      title: scenario.title,
      expectedConstraints: scenario.expectedConstraints,
      knownFailureCases: scenario.knownFailureCases,
    },
    context: scenario.context,
    run: {
      provider: options.provider,
      modelId: options.modelId,
      modelOverride: options.modelOverride,
      date: options.date,
    },
    inputLoss,
    coverage,
  };

  const city = m.cityId ? getCityById(m.cityId) : undefined;
  if (!city) {
    return {
      ...base,
      mappedSignals: null,
      generation: { status: "skipped", reason: `city "${scenario.context.city}" is not one of the pipeline's cities` },
      quality: null,
      diagnostics: emptyDiagnostics(),
      prompt: null,
    };
  }

  const signals: SignalCombination = {
    persona: m.persona,
    occasion: m.occasion,
    vibe: m.vibe,
    colorEnergy: m.colorEnergy,
    weatherCondition: weather.current.condition,
    temperatureRange: weather.stylingImplications.temperatureRange,
  };
  const promptContext = { signals, city, weather };
  const prompt = buildOutfitPrompt(promptContext);

  const attempts: GenerationAttempt[] = [];
  const started = Date.now();
  let generation: ScenarioResult["generation"];
  let outfits: PrecomputedOutfit[] | null = null;
  try {
    outfits = await generateOutfitsWithModel(options.model, promptContext, {
      sleep: options.sleep,
      onAttempt: (a) => attempts.push(a),
    });
    generation = { status: "ok", outfits };
  } catch (error) {
    generation = { status: "failed", error: (error as Error).message };
  }
  const wallClockMs = Date.now() - started;

  let quality: ScenarioResult["quality"] = null;
  if (outfits) {
    // Requests outside the matrix get the entry stage 3 would have built;
    // stage 5 recomputes everything except regionalRelevance.
    const entry: StyleMatrixEntry = matchedEntry ?? {
      key: buildMatrixKey(signals),
      signals,
      confidence: 0,
      regionalBoost: calculateRegionalScore(city, signals),
    };
    const scored = scoreBundle(buildOutfitBundle(entry, city.cityId, outfits, OUTFIT_TTL_SECONDS));
    quality = {
      ruleBased: scored.qualityMetrics as QualityMetrics,
      mlScoring: "skipped",
      passesPublishThreshold: scored.qualityMetrics.confidenceScore >= PUBLISH_THRESHOLD,
    };
  }

  return {
    ...base,
    mappedSignals: signals,
    generation,
    quality,
    diagnostics: buildDiagnostics(attempts, wallClockMs, prompt, options.pricing),
    prompt,
  };
}

function emptyDiagnostics(): ScenarioResult["diagnostics"] {
  return {
    modelCalls: 0,
    retries: 0,
    attempts: [],
    modelLatencyMs: 0,
    wallClockMs: 0,
    tokens: null,
    estimatedCostUsd: null,
    promptChars: null,
    promptSha256: null,
  };
}

function buildDiagnostics(
  attempts: GenerationAttempt[],
  wallClockMs: number,
  prompt: string,
  pricing?: Pricing
): ScenarioResult["diagnostics"] {
  const withUsage = attempts.filter((a) => a.usage);
  const tokens =
    withUsage.length > 0
      ? withUsage.reduce(
          (t, a) => ({
            prompt: t.prompt + (a.usage?.promptTokens ?? 0),
            output: t.output + (a.usage?.outputTokens ?? 0),
            total: t.total + (a.usage?.totalTokens ?? 0),
          }),
          { prompt: 0, output: 0, total: 0 }
        )
      : null;
  // Cost is only reported when the caller supplies prices; never assumed.
  const estimatedCostUsd =
    tokens && pricing
      ? (tokens.prompt * pricing.inputPerMillionTokensUsd + tokens.output * pricing.outputPerMillionTokensUsd) / 1e6
      : null;

  return {
    modelCalls: attempts.length,
    retries: Math.max(0, attempts.length - 1),
    attempts,
    modelLatencyMs: attempts.reduce((s, a) => s + a.latencyMs, 0),
    wallClockMs,
    tokens,
    estimatedCostUsd,
    promptChars: prompt.length,
    promptSha256: createHash("sha256").update(prompt).digest("hex"),
  };
}

// =============================================================================
// Batch execution and summary
// =============================================================================

export interface BaselineSummary {
  resultSchemaVersion: number;
  variant: "B-current-pipeline";
  provider: RunOptions["provider"];
  modelId: string;
  modelOverride: boolean;
  date: string;
  scenarioCount: number;
  coverage: {
    citySupported: number;
    inMatrix: number;
    servedExact: number;
    servedFuzzy: number;
    reasons: Record<string, number>;
  };
  generation: { ok: number; failed: number; skipped: number };
  publishable: number;
  modelCalls: number;
  retries: number;
  latencyMs: { p50: number | null; p95: number | null; max: number | null };
  tokens: { prompt: number; output: number; total: number } | null;
  estimatedCostUsd: number | null;
  inputLoss: { scenariosDroppingInputs: number; droppedFieldCounts: Record<string, number> };
}

export async function runBaseline(scenarios: Scenario[], options: RunOptions): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];
  // Sequential on purpose: per-call latency is part of what is measured.
  for (const scenario of scenarios) {
    results.push(await runScenario(scenario, options));
  }
  return results;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

export function summarize(results: ScenarioResult[], options: RunOptions): BaselineSummary {
  const reasons: Record<string, number> = {};
  const droppedFieldCounts: Record<string, number> = {};
  for (const r of results) {
    for (const reason of r.coverage.reasons) reasons[reason] = (reasons[reason] ?? 0) + 1;
    for (const field of r.inputLoss.dropped) droppedFieldCounts[field] = (droppedFieldCounts[field] ?? 0) + 1;
  }

  const latencies = results
    .filter((r) => r.generation.status === "ok")
    .map((r) => r.diagnostics.modelLatencyMs)
    .sort((a, b) => a - b);
  const withTokens = results.filter((r) => r.diagnostics.tokens);
  const tokens =
    withTokens.length > 0
      ? withTokens.reduce(
          (t, r) => ({
            prompt: t.prompt + r.diagnostics.tokens!.prompt,
            output: t.output + r.diagnostics.tokens!.output,
            total: t.total + r.diagnostics.tokens!.total,
          }),
          { prompt: 0, output: 0, total: 0 }
        )
      : null;
  // A total is only meaningful when every scenario that called the model has a cost.
  const called = results.filter((r) => r.diagnostics.modelCalls > 0);
  const estimatedCostUsd =
    called.length > 0 && called.every((r) => r.diagnostics.estimatedCostUsd !== null)
      ? called.reduce((s, r) => s + r.diagnostics.estimatedCostUsd!, 0)
      : null;

  return {
    resultSchemaVersion: RESULT_SCHEMA_VERSION,
    variant: "B-current-pipeline",
    provider: options.provider,
    modelId: options.modelId,
    modelOverride: options.modelOverride,
    date: options.date,
    scenarioCount: results.length,
    coverage: {
      citySupported: results.filter((r) => r.coverage.citySupported).length,
      inMatrix: results.filter((r) => r.coverage.inMatrix).length,
      servedExact: results.filter((r) => r.coverage.apiRetrieval === "exact").length,
      servedFuzzy: results.filter((r) => r.coverage.apiRetrieval === "fuzzy").length,
      reasons,
    },
    generation: {
      ok: results.filter((r) => r.generation.status === "ok").length,
      failed: results.filter((r) => r.generation.status === "failed").length,
      skipped: results.filter((r) => r.generation.status === "skipped").length,
    },
    publishable: results.filter((r) => r.quality?.passesPublishThreshold).length,
    modelCalls: results.reduce((s, r) => s + r.diagnostics.modelCalls, 0),
    retries: results.reduce((s, r) => s + r.diagnostics.retries, 0),
    latencyMs: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies.length ? latencies[latencies.length - 1]! : null,
    },
    tokens,
    estimatedCostUsd,
    inputLoss: {
      scenariosDroppingInputs: results.filter((r) => r.inputLoss.dropped.length > 0).length,
      droppedFieldCounts,
    },
  };
}

export function renderSummaryMarkdown(summary: BaselineSummary, results: ScenarioResult[]): string {
  const lines: string[] = [];
  const mock = summary.provider === "mock";
  lines.push(`# Baseline run: Variant B (current pipeline)`);
  lines.push("");
  lines.push(`- Provider: \`${summary.provider}\`${mock ? " (placeholder outfits; NOT a quality baseline)" : ""}`);
  lines.push(`- Model: \`${summary.modelId}\`${summary.modelOverride ? " (override: differs from the pipeline's configured model)" : ""}`);
  lines.push(`- Run date: ${summary.date} · Scenarios: ${summary.scenarioCount}`);
  lines.push(
    `- Coverage: ${summary.coverage.citySupported} in a supported city, ${summary.coverage.inMatrix} in the nightly matrix ` +
      `(${summary.coverage.servedExact} exact-key, ${summary.coverage.servedFuzzy} fuzzy-scan retrieval)`
  );
  lines.push(
    `- Generation: ${summary.generation.ok} ok, ${summary.generation.failed} failed, ${summary.generation.skipped} skipped · ` +
      `${summary.modelCalls} model calls, ${summary.retries} retries · ${summary.publishable} pass the publish threshold`
  );
  lines.push(
    `- Model latency (ok scenarios): p50 ${fmt(summary.latencyMs.p50)} ms, p95 ${fmt(summary.latencyMs.p95)} ms, max ${fmt(summary.latencyMs.max)} ms`
  );
  lines.push(
    `- Tokens: ${summary.tokens ? `${summary.tokens.prompt} in / ${summary.tokens.output} out` : "not reported"} · ` +
      `Estimated cost: ${summary.estimatedCostUsd === null ? "not computed (no pricing supplied)" : `$${summary.estimatedCostUsd.toFixed(4)}`}`
  );
  lines.push("");
  lines.push("| Scenario | City | In matrix | Reasons | Retrieval | Generation | Calls | Latency ms | Rule score | Dropped inputs |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    lines.push(
      [
        r.scenario.id,
        r.context.city,
        r.coverage.inMatrix ? "yes" : "no",
        r.coverage.reasons.join(", "),
        r.coverage.apiRetrieval,
        r.generation.status,
        String(r.diagnostics.modelCalls),
        String(r.diagnostics.modelLatencyMs),
        r.quality ? r.quality.ruleBased.confidenceScore.toFixed(1) : "–",
        r.inputLoss.dropped.length ? r.inputLoss.dropped.join(", ") : "–",
      ]
        .map((c) => c.replace(/\|/g, "\\|"))
        .join(" | ")
        .replace(/^/, "| ")
        .concat(" |")
    );
  }
  lines.push("");
  return lines.join("\n");
}

function fmt(n: number | null): string {
  return n === null ? "–" : String(Math.round(n));
}
