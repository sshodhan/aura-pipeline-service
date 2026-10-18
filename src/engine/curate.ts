/**
 * Collection Curation (Phase 4)
 *
 * curateCollection(outfits) → assessed, possibly revised outfits:
 *   1. score every outfit with the rubric (src/engine/quality.ts), keeping
 *      hard checks (Phase 3 validation) separate from the editorial scores;
 *   2. decide per outfit: reject (hard checks fail), revise (a dimension
 *      below the threshold) or accept;
 *   3. one bounded revision for the outfits to revise: a deterministic
 *      template rewrite with hints, or one model call with issue codes only;
 *   4. keep a revision only if the whole collection still passes its hard
 *      checks, the outfit scores better and no other outfit scores worse;
 *      otherwise keep the original;
 *   5. an outfit still below the threshold is kept and flagged low_confidence.
 */

import type { RecommendationContext } from "../baseline/fixtures";
import type { KnowledgeHit, KnowledgeStore } from "../knowledge/store";
import { toOutfitDrafts, toOutfitSpecs } from "./compose";
import { validateOutfits } from "./outfit-validate";
import { TemplateOutfitWriter, type OutfitWriter, type TemplateHint } from "./outfit-writer";
import type { OutfitDraft, OutfitSpec, OutfitValidation } from "./outfit-types";
import { EVALUATOR_VERSION, QUALITY_DIMENSIONS, REVISE_BELOW, scoreCollection, totalScore, type QualityDimension, type QualityIssue, type QualityIssueCode, type RubricResult, type RubricScores } from "./quality";
import type { ConceptRole, InterpretedContext, StyleConcept, WriterAttempt } from "./types";

export const DEFAULT_MAX_CURATION_CALLS = 1;

export interface QualityAssessment {
  candidateId: string;
  role: ConceptRole;
  /** Phase 3's structural checks for this outfit; separate from the editorial scores. */
  hardChecks: { passed: boolean; violations: string[] };
  /** Rubric scores, 1–5. Not probabilities of user satisfaction; uncalibrated until Phase 6. */
  editorialAssessment: RubricScores & { rationale: string };
  reasons: Record<QualityDimension, string[]>;
  /** Rubric issue codes on the final version. */
  issueCodes: QualityIssueCode[];
  /** What the curator decided for the first version of this outfit. */
  decision: "accept" | "revise" | "reject";
  revisionInstructions?: string[];
  /** Where it ended up. */
  outcome: "accepted" | "revised" | "low_confidence" | "rejected";
  evaluatorVersion: typeof EVALUATOR_VERSION;
}

export interface CollectionQuality {
  evaluatorVersion: typeof EVALUATOR_VERSION;
  reviseBelow: number;
  assessments: QualityAssessment[];
  /** First-version scores, so revisions can be audited. */
  initialScores: Partial<Record<ConceptRole, RubricScores>>;
  revisedRoles: ConceptRole[];
  lowConfidence: ConceptRole[];
  /** Collection-level range and redundancy. */
  collection: { minDifferingCoreSlots: number; sharedColors: string[]; sharedGarmentTypes: string[] };
}

export interface CurationDiagnostics {
  mode: "template_repair" | "model_revision" | "none";
  modelCalls: number;
  maxModelCalls: number;
  attempts: WriterAttempt[];
  latencyMs: number;
}

export interface CurateInput {
  context: RecommendationContext;
  interpreted: InterpretedContext;
  concepts: StyleConcept[];
  outfits: OutfitSpec[];
  evidence: KnowledgeHit[];
  store: KnowledgeStore;
}

export interface CurateOptions {
  /**
   * The writer of model-written outfits. With it, weak outfits are revised by the model (maxModelCalls
   * calls, default 1; with 0 they are only flagged), never replaced by template garments. Without it,
   * the outfits are template output and the template rewrites them with hints, at no model cost.
   */
  modelWriter?: OutfitWriter;
  maxModelCalls?: number;
  reviseBelow?: number;
  onPrompt?: (prompt: string, call: number) => void;
}

export interface CurationResult {
  outfits: OutfitSpec[];
  validation: OutfitValidation;
  quality: CollectionQuality;
  diagnostics: CurationDiagnostics;
}

/** Hints that steer a template rewrite away from each flagged problem. */
function hintFor(result: RubricResult, outfit: OutfitDraft, others: OutfitDraft[]): TemplateHint {
  const hint: TemplateHint = {};
  const avoid = new Set<string>();
  const types = (pred: (g: OutfitDraft["garments"][number]) => boolean) => outfit.garments.filter(pred).map((g) => g.type);
  for (const issue of result.issues) {
    switch (issue.code) {
      case "too_many_accents":
        hint.maxAccents = 1;
        break;
      case "neutral_temperature_clash": {
        const warm = issue.message.match(/warm \((\d+)\)/)?.[1];
        const cool = issue.message.match(/cool \((\d+)\)/)?.[1];
        hint.neutralTemperature = Number(warm) >= Number(cool) ? "warm" : "cool";
        break;
      }
      case "single_texture":
        types((g) => g.category === "top" || g.layer === "mid").forEach((t) => avoid.add(t));
        break;
      case "proportion_unbalanced":
        types((g) => g.category === "bottom").forEach((t) => avoid.add(t));
        break;
      case "formality_drift":
      case "climate_drift":
        outfit.garments.filter((g) => issue.message.includes(g.type)).forEach((g) => avoid.add(g.type));
        break;
      case "low_distinctiveness":
      case "color_repetition":
        for (const o of others) for (const g of o.garments) if (outfit.garments.some((x) => x.type === g.type)) avoid.add(g.type);
        break;
      default:
        break;
    }
  }
  if (avoid.size > 0) hint.avoidTypes = [...avoid];
  return hint;
}

export async function curateCollection(input: CurateInput, options: CurateOptions = {}): Promise<CurationResult> {
  const startedAt = Date.now();
  const reviseBelow = options.reviseBelow ?? REVISE_BELOW;
  const maxModelCalls = options.maxModelCalls ?? DEFAULT_MAX_CURATION_CALLS;
  const providedEvidenceIds = input.evidence.map((h) => h.evidence.id);
  const validate = (drafts: OutfitDraft[]) =>
    validateOutfits(drafts, {
      interpreted: input.interpreted,
      concepts: input.concepts,
      providedEvidenceIds,
      hasRegionalEvidence: input.evidence.some((h) => h.evidence.type === "regional_influence"),
      hasContemporaryEvidence: input.evidence.some((h) => h.evidence.type === "contemporary_observation"),
    });
  const score = (drafts: OutfitDraft[]) => scoreCollection({ outfits: drafts, interpreted: input.interpreted, store: input.store });
  const below = (s: RubricScores) => QUALITY_DIMENSIONS.some((d) => s[d] < reviseBelow);

  let drafts = toOutfitDrafts(input.outfits);
  let validation = validate(drafts);
  const initial = score(drafts);
  const hardFailing = (role: ConceptRole) => validation.issues.filter((i) => i.role === role).map((i) => i.code);
  const decisions = new Map<ConceptRole, QualityAssessment["decision"]>();
  for (const r of initial) decisions.set(r.role, hardFailing(r.role).length > 0 ? "reject" : below(r.scores) ? "revise" : "accept");
  const toRevise = initial.filter((r) => decisions.get(r.role) === "revise");

  const diagnostics: CurationDiagnostics = { mode: "none", modelCalls: 0, maxModelCalls: options.modelWriter ? maxModelCalls : 0, attempts: [], latencyMs: 0 };
  const revised: ConceptRole[] = [];

  /**
   * Swap in the candidate's version of each flagged role, one at a time. A swap is kept only if the
   * collection still passes its hard checks, the revised outfit scores higher, and no other outfit
   * scores lower (distinctiveness is relative, so one outfit's revision can move the others).
   */
  const adopt = (candidate: OutfitDraft[]) => {
    for (const r of toRevise) {
      const replacement = candidate.find((d) => d.role === r.role);
      if (!replacement) continue;
      const trial = drafts.map((d) => (d.role === r.role ? replacement : d));
      const trialValidation = validate(trial);
      const before = new Map(score(drafts).map((x) => [x.role, totalScore(x.scores)]));
      const after = new Map(score(trial).map((x) => [x.role, totalScore(x.scores)]));
      const improves = after.get(r.role)! > before.get(r.role)! && [...after].every(([role, total]) => role === r.role || total >= before.get(role)!);
      if (trialValidation.passed && improves) {
        drafts = trial;
        validation = trialValidation;
        revised.push(r.role);
      }
    }
  };

  // With a model writer and no budget, weak outfits are only flagged.
  if (toRevise.length > 0) {
    if (options.modelWriter && maxModelCalls > 0) {
      diagnostics.mode = "model_revision";
      const feedback = toRevise.flatMap((r) => r.issues.map((i: QualityIssue) => ({ code: i.code, role: i.role, field: i.dimension })));
      const result = await options.modelWriter.write({ ...input, feedback });
      diagnostics.modelCalls++;
      if (result.prompt) options.onPrompt?.(result.prompt, 0);
      diagnostics.attempts.push({ call: 0, purpose: "revision", latencyMs: result.latencyMs, outcome: result.outcome, error: result.error, usage: result.usage });
      if (result.drafts) adopt(result.drafts);
    } else if (!options.modelWriter) {
      diagnostics.mode = "template_repair";
      const others = (role: ConceptRole) => drafts.filter((d) => d.role !== role);
      const templateHints = Object.fromEntries(toRevise.map((r) => [r.role, hintFor(r, drafts.find((d) => d.role === r.role)!, others(r.role))]));
      const result = await new TemplateOutfitWriter().write({ ...input, templateHints });
      if (result.drafts) adopt(result.drafts);
    }
  }

  const final = score(drafts);
  const outfits = toOutfitSpecs(drafts, input.concepts, input.store.knowledgeVersion);
  const assessments: QualityAssessment[] = final.map((r) => {
    const decision = decisions.get(r.role)!;
    const failing = validation.issues.filter((i) => i.role === r.role).map((i) => i.code);
    const outcome: QualityAssessment["outcome"] =
      failing.length > 0 ? "rejected" : revised.includes(r.role) ? (below(r.scores) ? "low_confidence" : "revised") : below(r.scores) ? "low_confidence" : "accepted";
    const flagged = r.issues.map((i) => i.message);
    return {
      candidateId: outfits.find((o) => o.role === r.role)!.id,
      role: r.role,
      hardChecks: { passed: failing.length === 0, violations: failing },
      editorialAssessment: {
        ...r.scores,
        rationale: flagged.length > 0 ? `Rubric notes: ${flagged.join("; ")}.` : "No rubric issues found. This is a structural reading, not a judgment of taste.",
      },
      reasons: r.reasons,
      issueCodes: [...new Set(r.issues.map((i) => i.code))],
      decision,
      revisionInstructions: decision === "revise" ? initial.find((x) => x.role === r.role)!.issues.map((i) => i.code) : undefined,
      outcome,
      evaluatorVersion: EVALUATOR_VERSION,
    };
  });

  // Collection-level range and redundancy.
  const count = (values: string[]) => values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>());
  const colorUse = count(drafts.flatMap((d) => [...new Set(d.garments.map((g) => g.color.toLowerCase()))]));
  const typeUse = count(drafts.flatMap((d) => [...new Set(d.garments.map((g) => g.type))]));
  diagnostics.latencyMs = Date.now() - startedAt;
  return {
    outfits,
    validation,
    quality: {
      evaluatorVersion: EVALUATOR_VERSION,
      reviseBelow,
      assessments,
      initialScores: Object.fromEntries(initial.map((r) => [r.role, r.scores])),
      revisedRoles: revised,
      lowConfidence: assessments.filter((a) => a.outcome === "low_confidence").map((a) => a.role),
      collection: {
        minDifferingCoreSlots: Math.min(...validation.differingCoreSlots.map((x) => x.slots)),
        sharedColors: [...colorUse].filter(([, n]) => n > 1).map(([c]) => c),
        sharedGarmentTypes: [...typeUse].filter(([, n]) => n > 1).map(([t]) => t),
      },
    },
    diagnostics,
  };
}
