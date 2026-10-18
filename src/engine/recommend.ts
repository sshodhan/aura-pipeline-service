/**
 * recommend(context) → RecommendationCollection (Phases 3–4)
 *
 * The pure engine entry point: style directions (Phase 2), outfit
 * composition (Phase 3), then quality curation (Phase 4). The concept and
 * outfit stages each have their own model-call budget (default 2: a draft and
 * one revision) and fall back to their deterministic templates instead of
 * looping. Curation scores every outfit with the deterministic rubric and
 * revises weak ones once: with the model writer (default 1 call) when the
 * outfits came from a model, otherwise with a template rewrite (no call). A
 * request therefore makes at most 5 model calls by default.
 * Phase 5's HTTP route and any batch runner are meant to call this.
 *
 * Pure and key-free; models, if any, are injected through the writers.
 */

import type { KnowledgeStore } from "../knowledge/store";
import { composeOutfits, DEFAULT_MAX_OUTFIT_CALLS } from "./compose";
import { parseContext } from "./context";
import { curateCollection, DEFAULT_MAX_CURATION_CALLS } from "./curate";
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
  /** Score and curate the outfits (Phase 4). Default true; false returns Phase 3 output with quality null. */
  curate?: boolean;
  /** Rubric threshold that sends an outfit to revision (default REVISE_BELOW, uncalibrated). */
  reviseBelow?: number;
  /** Model calls allowed for the curation revision (default 1). */
  maxCurationCalls?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Receives each prompt sent (local diagnostics only). */
  onPrompt?: (stage: "concepts" | "outfits" | "curation", prompt: string, call: number) => void;
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
      quality: null,
      errors: plan.errors,
      diagnostics: { concepts: plan.diagnostics, outfits: null, curation: null, totalModelCalls: plan.diagnostics.modelCalls, latencyMs: Date.now() - startedAt },
    };
  }

  const evidence = evidenceForWriter(store, plan.interpreted, plan.selection.assignments.map((a) => a.evidenceId), asOf);
  const composeInput = { context: parsed.context, interpreted: plan.interpreted, concepts: plan.concepts, evidence, store };
  const composed = await composeOutfits(composeInput, {
    writer: options.outfitWriter,
    maxModelCalls: options.maxModelCallsPerStage ?? DEFAULT_MAX_OUTFIT_CALLS,
    sleep: options.sleep,
    onPrompt: options.onPrompt ? (p, call) => options.onPrompt!("outfits", p, call) : undefined,
  });

  // Model-written outfits are revised by the model; template output (including a fallback) is repaired by the template.
  const curated =
    options.curate === false
      ? null
      : await curateCollection(
          { ...composeInput, outfits: composed.outfits },
          {
            modelWriter: options.outfitWriter.mode === "model" && composed.diagnostics.generationMode === "model" ? options.outfitWriter : undefined,
            maxModelCalls: options.maxCurationCalls ?? DEFAULT_MAX_CURATION_CALLS,
            reviseBelow: options.reviseBelow,
            onPrompt: options.onPrompt ? (p, call) => options.onPrompt!("curation", p, call) : undefined,
          }
        );
  const outfits = curated?.outfits ?? composed.outfits;

  return {
    ...base,
    status: plan.status === "fallback" || composed.fellBack ? "fallback" : "ok",
    recommendations: plan.concepts.map((concept) => {
      const quality = curated?.quality.assessments.find((a) => a.role === concept.role);
      return { role: concept.role, concept, outfit: outfits.find((o) => o.role === concept.role)!, ...(quality ? { quality } : {}) };
    }),
    validation: { concepts: plan.validation, outfits: curated?.validation ?? composed.validation },
    quality: curated?.quality ?? null,
    errors: [],
    diagnostics: {
      concepts: plan.diagnostics,
      outfits: composed.diagnostics,
      curation: curated?.diagnostics ?? null,
      totalModelCalls: plan.diagnostics.modelCalls + composed.diagnostics.modelCalls + (curated?.diagnostics.modelCalls ?? 0),
      latencyMs: Date.now() - startedAt,
    },
  };
}
