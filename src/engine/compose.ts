/**
 * Outfit Composition stage (Phase 3)
 *
 * composeOutfits(concepts) → three validated outfits:
 *   1. the writer dresses the three concepts (template, or one model call);
 *   2. the outfits are validated; with a model, one revision with issue codes;
 *   3. if the model cannot produce valid outfits within its call budget, the
 *      deterministic template dresses the same concepts instead of looping.
 */

import type { RecommendationContext } from "../baseline/fixtures";
import type { KnowledgeHit, KnowledgeStore } from "../knowledge/store";
import { validateOutfits } from "./outfit-validate";
import { TemplateOutfitWriter, type OutfitWriter, type OutfitWriteRequest } from "./outfit-writer";
import type { OutfitDraft, OutfitIssue, OutfitSpec, OutfitValidation } from "./outfit-types";
import type { CollectionDiagnostics, InterpretedContext, StyleConcept, WriterAttempt } from "./types";

export const DEFAULT_MAX_OUTFIT_CALLS = 2;

export interface ComposeInput {
  context: RecommendationContext;
  interpreted: InterpretedContext;
  concepts: StyleConcept[];
  evidence: KnowledgeHit[];
  store: KnowledgeStore;
}

export interface ComposeOptions {
  writer: OutfitWriter;
  maxModelCalls?: number;
  sleep?: (ms: number) => Promise<void>;
  onPrompt?: (prompt: string, call: number) => void;
}

export interface ComposeResult {
  outfits: OutfitSpec[];
  validation: OutfitValidation;
  diagnostics: CollectionDiagnostics;
  fellBack: boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const ORDER = ["best_bet", "adjacent", "exploration"];

/** Drafts → specs in role order, with ids derived from their concepts (stable for the same request). */
export function toOutfitSpecs(drafts: OutfitDraft[], concepts: StyleConcept[], knowledgeVersion: string): OutfitSpec[] {
  return drafts
    .slice()
    .sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role))
    .map((d) => {
      const concept = concepts.find((c) => c.role === d.role)!;
      const id = `${concept.id}-outfit`;
      return { ...d, id, conceptId: concept.id, garments: d.garments.map((g, i) => ({ id: `${id}-g${i + 1}`, ...g })), knowledgeVersion };
    });
}

/** Specs → drafts (what a writer produces), for re-validation and scoring. */
export function toOutfitDrafts(outfits: OutfitSpec[]): OutfitDraft[] {
  return outfits.map(({ id: _i, conceptId: _c, knowledgeVersion: _k, garments, ...rest }) => ({ ...rest, garments: garments.map(({ id: _g, ...g }) => g) }));
}

export async function composeOutfits(input: ComposeInput, options: ComposeOptions): Promise<ComposeResult> {
  const startedAt = Date.now();
  const maxModelCalls = options.maxModelCalls ?? DEFAULT_MAX_OUTFIT_CALLS;
  const sleep = options.sleep ?? defaultSleep;
  const evidenceProvided = input.evidence.map((h) => h.evidence.id);
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
    evidenceProvided,
  };
  const validate = (drafts: OutfitDraft[]) =>
    validateOutfits(drafts, {
      interpreted: input.interpreted,
      concepts: input.concepts,
      providedEvidenceIds: evidenceProvided,
      hasRegionalEvidence: input.evidence.some((h) => h.evidence.type === "regional_influence"),
      hasContemporaryEvidence: input.evidence.some((h) => h.evidence.type === "contemporary_observation"),
    });
  const request: OutfitWriteRequest = { ...input };

  let accepted: { drafts: OutfitDraft[]; validation: OutfitValidation } | null = null;
  let fellBack = false;

  if (options.writer.mode === "template") {
    const result = await options.writer.write(request);
    accepted = { drafts: result.drafts!, validation: validate(result.drafts!) };
  } else {
    let feedback: OutfitIssue[] | undefined;
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
      fellBack = true;
      diagnostics.budgetExhausted = true;
      diagnostics.generationMode = "template_fallback";
      const fallback = await new TemplateOutfitWriter().write(request);
      accepted = { drafts: fallback.drafts!, validation: validate(fallback.drafts!) };
    }
    const reported = diagnostics.attempts.filter((a) => a.usage);
    if (reported.length > 0) {
      const sum = (k: "promptTokens" | "outputTokens" | "totalTokens") => reported.reduce((n, a) => n + (a.usage?.[k] ?? 0), 0);
      diagnostics.tokens = { prompt: sum("promptTokens"), output: sum("outputTokens"), total: sum("totalTokens") };
    }
  }

  const outfits = toOutfitSpecs(accepted.drafts, input.concepts, input.store.knowledgeVersion);

  diagnostics.latencyMs = Date.now() - startedAt;
  return { outfits, validation: accepted.validation, diagnostics, fellBack };
}
