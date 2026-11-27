/**
 * Style Direction Planner (Phase 2)
 *
 * planStyleDirections(context) → ConceptCollection:
 *   1. validate the request (schema and length caps);
 *   2. interpret it (hard constraints, preferences, opportunities, unknowns);
 *   3. select three distinct aesthetics deterministically;
 *   4. write one concept per role (template, or a model within budget);
 *   5. validate the collection; with a model, revise once with issue codes;
 *   6. if the model cannot produce a valid collection within the call budget,
 *      fall back to the deterministic template instead of looping.
 *
 * Pure and key-free; the model, if any, is injected through the writer.
 */

import type { KnowledgeHit, KnowledgeStore } from "../knowledge/store";
import { contextFingerprint, interpretContext, parseContext } from "./context";
import { selectDirections } from "./directions";
import { validateCollection } from "./validate";
import { TemplateConceptWriter, type ConceptWriter, type WriteRequest } from "./writer";
import {
  COLLECTION_SCHEMA_VERSION,
  ENGINE_VERSION,
  type CollectionDiagnostics,
  type CollectionValidation,
  type ConceptCollection,
  type ConceptDraft,
  type GenerationMode,
  type StyleConcept,
  type ValidationIssue,
  type WriterAttempt,
} from "./types";

/** Model calls allowed per request: one draft plus one revision. */
export const DEFAULT_MAX_MODEL_CALLS = 2;

export interface PlanOptions {
  writer: ConceptWriter;
  /** YYYY-MM-DD; defaults to today. */
  asOf?: string;
  /** Knowledge region slug; defaults to a slug of the city. */
  region?: string;
  maxModelCalls?: number;
  /** Wait before retrying after a provider error; injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Receives each prompt sent (local diagnostics only). */
  onPrompt?: (prompt: string, call: number) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Evidence a writer may cite: the three aesthetic records plus current principles and any regional or contemporary records. */
export function evidenceForWriter(store: KnowledgeStore, interpreted: ReturnType<typeof interpretContext>, aestheticIds: string[], asOf: string): KnowledgeHit[] {
  const s = interpreted.signals;
  const aesthetics = store.query({ types: ["aesthetic_reference"], asOf }).filter((h) => aestheticIds.includes(h.evidence.id));
  const supporting = store.query({
    types: ["timeless_principle", "regional_influence", "contemporary_observation"],
    regions: [s.region],
    season: s.season,
    asOf,
  });
  return [...aesthetics, ...supporting];
}

export async function planStyleDirections(input: unknown, store: KnowledgeStore, options: PlanOptions): Promise<ConceptCollection> {
  const startedAt = Date.now();
  const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
  const maxModelCalls = options.maxModelCalls ?? DEFAULT_MAX_MODEL_CALLS;
  const sleep = options.sleep ?? defaultSleep;

  const diagnostics: CollectionDiagnostics = {
    generationMode: options.writer.mode === "model" ? "model" : "template",
    modelId: options.writer.modelId,
    modelCalls: 0,
    revisions: 0,
    maxModelCalls: options.writer.mode === "model" ? maxModelCalls : 0,
    budgetExhausted: false,
    attempts: [],
    tokens: null,
    latencyMs: 0,
    evidenceProvided: [],
  };
  const base = {
    schemaVersion: COLLECTION_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    knowledgeVersion: store.knowledgeVersion,
    asOf,
  } as const;
  const finish = (c: Omit<ConceptCollection, keyof typeof base | "diagnostics">): ConceptCollection => ({
    ...base,
    ...c,
    diagnostics: { ...diagnostics, latencyMs: Date.now() - startedAt },
  });

  // 1. Request
  const parsed = parseContext(input);
  if (!parsed.ok) {
    return finish({ status: "invalid_request", requestId: null, contextFingerprint: null, interpreted: null, selection: null, concepts: [], validation: null, errors: parsed.errors });
  }
  const context = parsed.context;
  const fingerprint = contextFingerprint(context);

  // 2–3. Interpretation and selection
  const interpreted = interpretContext(context, store, { asOf, region: options.region });
  const selection = selectDirections(interpreted, store, asOf);
  const { candidates: _candidates, ...selectionSummary } = selection;
  if (selection.status !== "ok") {
    return finish({
      status: "insufficient_knowledge",
      requestId: context.requestId,
      contextFingerprint: fingerprint,
      interpreted,
      selection: selectionSummary,
      concepts: [],
      validation: null,
      errors: selection.notes,
    });
  }

  // 4–6. Writing, validation, bounded revision, fallback
  const evidence = evidenceForWriter(store, interpreted, selection.assignments.map((a) => a.evidenceId), asOf);
  diagnostics.evidenceProvided = evidence.map((h) => h.evidence.id);
  const validate = (drafts: ConceptDraft[]) =>
    validateCollection(drafts, {
      interpreted,
      assignments: selection.assignments,
      providedEvidenceIds: diagnostics.evidenceProvided,
      hasRegionalEvidence: evidence.some((h) => h.evidence.type === "regional_influence"),
      hasContemporaryEvidence: evidence.some((h) => h.evidence.type === "contemporary_observation"),
    });
  const request: WriteRequest = { context, interpreted, assignments: selection.assignments, evidence, store };

  let accepted: { drafts: ConceptDraft[]; validation: CollectionValidation } | null = null;
  let lastValidation: CollectionValidation | null = null;

  if (options.writer.mode === "template") {
    const result = await options.writer.write(request);
    if (result.drafts) {
      lastValidation = validate(result.drafts);
      accepted = { drafts: result.drafts, validation: lastValidation };
    }
  } else {
    let feedback: ValidationIssue[] | undefined;
    for (let call = 0; call < maxModelCalls; call++) {
      const purpose: WriterAttempt["purpose"] = feedback ? "revision" : "draft";
      if (purpose === "revision") diagnostics.revisions++;
      const result = await options.writer.write({ ...request, feedback });
      diagnostics.modelCalls++;
      if (result.prompt) options.onPrompt?.(result.prompt, call);
      const attempt: WriterAttempt = { call, purpose, latencyMs: result.latencyMs, outcome: result.outcome, error: result.error, usage: result.usage };
      diagnostics.attempts.push(attempt);

      if (result.drafts) {
        const validation = validate(result.drafts);
        lastValidation = validation;
        if (validation.passed) {
          accepted = { drafts: result.drafts, validation };
          break;
        }
        attempt.outcome = "validation_failed";
        attempt.issueCodes = [...new Set(validation.issues.map((i) => i.code))];
        feedback = validation.issues;
      } else if (result.outcome === "provider_error" && call + 1 < maxModelCalls) {
        await sleep(1000);
      }
    }
    if (!accepted) {
      diagnostics.budgetExhausted = true;
      const fallback = await new TemplateConceptWriter().write(request);
      diagnostics.generationMode = "template_fallback";
      lastValidation = validate(fallback.drafts!);
      accepted = { drafts: fallback.drafts!, validation: lastValidation };
    }
    diagnostics.tokens = sumTokens(diagnostics.attempts);
  }

  const mode: GenerationMode = diagnostics.generationMode;
  const concepts: StyleConcept[] = accepted!.drafts
    .slice()
    .sort((a, b) => order(a.role) - order(b.role))
    .map((d) => ({ id: `${fingerprint.slice(0, 8)}-${d.role}`, ...d, knowledgeVersion: store.knowledgeVersion }));

  return finish({
    status: mode === "template_fallback" ? "fallback" : "ok",
    requestId: context.requestId,
    contextFingerprint: fingerprint,
    interpreted,
    selection: selectionSummary,
    concepts,
    validation: accepted!.validation,
    errors: [],
  });
}

const order = (role: string) => ["best_bet", "adjacent", "exploration"].indexOf(role);

function sumTokens(attempts: WriterAttempt[]): CollectionDiagnostics["tokens"] {
  const reported = attempts.filter((a) => a.usage);
  if (reported.length === 0) return null;
  const sum = (k: "promptTokens" | "outputTokens" | "totalTokens") => reported.reduce((n, a) => n + (a.usage?.[k] ?? 0), 0);
  return { prompt: sum("promptTokens"), output: sum("outputTokens"), total: sum("totalTokens") };
}
