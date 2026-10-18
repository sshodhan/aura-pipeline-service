/**
 * recommend(context) → RecommendationCollection (Phase 3)
 *
 * The pure engine entry point: style directions (Phase 2), then outfit
 * composition (Phase 3). Each stage has its own model-call budget (default 2:
 * a draft and one revision), so a request makes at most 4 model calls, and
 * each stage falls back to its deterministic template instead of looping.
 * Phase 5's HTTP route and any batch runner are meant to call this.
 *
 * Pure and key-free; models, if any, are injected through the writers.
 */

import type { KnowledgeStore } from "../knowledge/store";
import { composeOutfits, DEFAULT_MAX_OUTFIT_CALLS } from "./compose";
import { parseContext } from "./context";
import { DEFAULT_MAX_MODEL_CALLS, evidenceForWriter, planStyleDirections } from "./plan";
import { RECOMMEND_ENGINE_VERSION, RECOMMENDATION_SCHEMA_VERSION, type RecommendationCollection } from "./outfit-types";
import type { OutfitWriter } from "./outfit-writer";
import type { ConceptWriter } from "./writer";

export interface RecommendOptions {
  conceptWriter: ConceptWriter;
  outfitWriter: OutfitWriter;
  /** YYYY-MM-DD; defaults to today. */
  asOf?: string;
  /** Knowledge region slug; defaults to a slug of the city. */
  region?: string;
  /** Model calls allowed per stage (concepts, outfits). */
  maxModelCallsPerStage?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Receives each prompt sent (local diagnostics only). */
  onPrompt?: (stage: "concepts" | "outfits", prompt: string, call: number) => void;
}

export async function recommend(input: unknown, store: KnowledgeStore, options: RecommendOptions): Promise<RecommendationCollection> {
  const startedAt = Date.now();
  const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);

  const plan = await planStyleDirections(input, store, {
    writer: options.conceptWriter,
    asOf,
    region: options.region,
    maxModelCalls: options.maxModelCallsPerStage ?? DEFAULT_MAX_MODEL_CALLS,
    sleep: options.sleep,
    onPrompt: options.onPrompt ? (p, call) => options.onPrompt!("concepts", p, call) : undefined,
  });

  const base = {
    schemaVersion: RECOMMENDATION_SCHEMA_VERSION,
    engineVersion: RECOMMEND_ENGINE_VERSION,
    conceptEngineVersion: plan.engineVersion,
    requestId: plan.requestId,
    contextFingerprint: plan.contextFingerprint,
    knowledgeVersion: plan.knowledgeVersion,
    asOf,
    interpreted: plan.interpreted,
    selection: plan.selection,
  } as const;

  const parsed = parseContext(input);
  if (plan.status === "invalid_request" || plan.status === "insufficient_knowledge" || !parsed.ok || !plan.interpreted || !plan.selection) {
    return {
      ...base,
      status: plan.status === "invalid_request" || !parsed.ok ? "invalid_request" : "insufficient_knowledge",
      recommendations: [],
      validation: { concepts: plan.validation, outfits: null },
      errors: plan.errors,
      diagnostics: { concepts: plan.diagnostics, outfits: null, totalModelCalls: plan.diagnostics.modelCalls, latencyMs: Date.now() - startedAt },
    };
  }

  const evidence = evidenceForWriter(store, plan.interpreted, plan.selection.assignments.map((a) => a.evidenceId), asOf);
  const composed = await composeOutfits(
    { context: parsed.context, interpreted: plan.interpreted, concepts: plan.concepts, evidence, store },
    {
      writer: options.outfitWriter,
      maxModelCalls: options.maxModelCallsPerStage ?? DEFAULT_MAX_OUTFIT_CALLS,
      sleep: options.sleep,
      onPrompt: options.onPrompt ? (p, call) => options.onPrompt!("outfits", p, call) : undefined,
    }
  );

  return {
    ...base,
    status: plan.status === "fallback" || composed.fellBack ? "fallback" : "ok",
    recommendations: plan.concepts.map((concept) => ({ role: concept.role, concept, outfit: composed.outfits.find((o) => o.role === concept.role)! })),
    validation: { concepts: plan.validation, outfits: composed.validation },
    errors: [],
    diagnostics: {
      concepts: plan.diagnostics,
      outfits: composed.diagnostics,
      totalModelCalls: plan.diagnostics.modelCalls + composed.diagnostics.modelCalls,
      latencyMs: Date.now() - startedAt,
    },
  };
}
