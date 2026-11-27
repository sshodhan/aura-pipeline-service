/**
 * Concept Writers (Phase 2)
 *
 * Both writers turn the planner's three assignments into concept drafts:
 *
 * - TemplateConceptWriter: deterministic, no model. Composes concepts from
 *   the aesthetic reference records, their profiles and the interpreted
 *   context. It runs without keys (tests, local runs, and the fallback when a
 *   model fails within budget). It makes no claim to editorial quality.
 * - ModelConceptWriter: one model call per write through the
 *   TextGenerationModel interface (src/pipeline/core/generate-outfits.ts),
 *   with the request and evidence passed as untrusted data
 *   (src/engine/prompt.ts). The planner owns the call budget and revisions.
 */

import type { RecommendationContext } from "../baseline/fixtures";
import type { TextGenerationModel } from "../pipeline/core/generate-outfits";
import type { KnowledgeHit, KnowledgeStore } from "../knowledge/store";
import { OCCASION_LABEL, capitalize, composePalette, list, mentionsAny } from "./palette";
import { buildConceptPrompt, parseConceptResponse } from "./prompt";
import type { ConceptDraft, ConstraintCode, DirectionAssignment, InterpretedContext, ValidationIssue, WriterAttempt } from "./types";

export interface WriteRequest {
  context: RecommendationContext;
  interpreted: InterpretedContext;
  assignments: DirectionAssignment[];
  /** Everything the writer may cite. */
  evidence: KnowledgeHit[];
  store: KnowledgeStore;
  /** Issues from the previous attempt (revision only). */
  feedback?: ValidationIssue[];
}

export interface WriteResult {
  drafts: ConceptDraft[] | null;
  outcome: Exclude<WriterAttempt["outcome"], "validation_failed">;
  latencyMs: number;
  error?: string;
  usage?: WriterAttempt["usage"];
  /** The prompt sent, for local diagnostics only (never part of a response). */
  prompt?: string;
}

export interface ConceptWriter {
  readonly mode: "template" | "model";
  readonly modelId: string | null;
  write(request: WriteRequest): Promise<WriteResult>;
}

// =============================================================================
// Template writer
// =============================================================================

const ROLE_ANGLE: Record<DirectionAssignment["role"], string> = {
  best_bet: "the most direct answer to the occasion and the weather",
  adjacent: "a different but approachable take on the same day",
  exploration: "a broader take that keeps every constraint",
};

/** Remedy phrases; each satisfies the matching validator pattern. */
const WEATHER_REMEDY: Partial<Record<ConstraintCode, string>> = {
  snow_protection: "an insulated, water-resistant outer layer with lug-soled boots for grip",
  rain_protection: "a water-resistant outer layer and treated or rubber-soled footwear",
  insulation: "insulating wool or quilted layers under a warm coat",
  warm_layer: "a warm mid-weight layer such as a fine wool knit or jacket",
  light_layer: "a light removable layer such as a jacket or cardigan",
  breathable: "breathable, lightweight fabrics such as linen and cotton",
  wind_protection: "a closed, wind-resistant outer layer",
  sun_protection: "a brimmed hat or sunglasses for shade",
  performance: "technical, moisture-wicking performance layers and running shoes",
};

const HEAVY = /\b(tweed|corduroy|fleece|mohair|velvet|waxed|cable knit|shearling|cashmere|suede)\b/;
const LIGHT = /\b(linen|chiffon|raffia|voile|crochet)\b/;
const FULL_SHAPES = /\b(wide|oversized|maxi|flowing|cocoon|boxy|relaxed|layered|a-line|statement)\b/;


/** The garment list in a reference's first sentence: "Lead: a, b, and c." → ["a", "b", "c"]. */
function summaryItems(summary: string): string[] {
  const afterColon = summary.split(/\.\s/)[0]!.split(":")[1];
  if (!afterColon) return [];
  return afterColon
    .replace(/\.$/, "")
    .split(/,\s*/)
    .map((x) => x.trim().replace(/^and\s+/, ""))
    .filter((x) => x.length > 3);
}

export class TemplateConceptWriter implements ConceptWriter {
  readonly mode = "template" as const;
  readonly modelId = null;

  async write(request: WriteRequest): Promise<WriteResult> {
    const startedAt = Date.now();
    const drafts = request.assignments.map((a) => this.draft(a, request));
    return { drafts, outcome: "ok", latencyMs: Date.now() - startedAt };
  }

  private draft(assignment: DirectionAssignment, request: WriteRequest): ConceptDraft {
    const { interpreted } = request;
    const s = interpreted.signals;
    const record = request.store.get(assignment.evidenceId)!;
    const profile = record.profile!;
    const avoided = s.avoidedColors;
    const provided = new Set(request.evidence.map((h) => h.evidence.id));
    const codes = new Set(interpreted.constraints.map((c) => c.code));

    // Thesis: the reference's own definition, framed for this occasion and role.
    const firstSentence = record.summary.split(/(?<=\.)\s/)[0]!;
    const base = mentionsAny(firstSentence, avoided)
      ? `${record.title} built on ${list(record.silhouettes)} shapes in ${list(record.materials.slice(0, 3))}.`
      : firstSentence;
    const aestheticThesis = `${base} For ${OCCASION_LABEL[s.occasionKind]}, it is ${ROLE_ANGLE[assignment.role]}.`;

    const silhouetteDirection =
      `Lead with ${list(record.silhouettes)} shapes` + (s.fit ? `, cut to the requested ${s.fit} fit.` : ".");
    const full = record.silhouettes.some((x) => FULL_SHAPES.test(x));
    const proportionDirection = full
      ? "Let the fuller piece lead and keep the other half closer to the body so the outline stays clear."
      : "Keep a long, unbroken line, with outer layers that sit cleanly over what is underneath.";

    // Palette: the aesthetic's colors minus anything avoided, with stated preferences as the accent.
    const { base: baseColors, accents } = composePalette(profile, s);
    const accentText =
      accents.length > 0
        ? `${list(accents)} as the accent the person asked for`
        : baseColors.length > 1
          ? `${baseColors[baseColors.length - 1]} as the accent`
          : "one tonal accent";
    const baseText = baseColors.length > 0 ? list(baseColors.slice(0, 3)) : "deep neutrals outside the avoided colors";
    const paletteDirection =
      `Base of ${baseText}, with ${accentText}` +
      (profile.expressiveness >= 4 ? "; color and print can be bold." : profile.expressiveness <= 2 ? "; keep the accent to one or two places." : ".");

    // Materials: drop fabrics wrong for the climate, then add every weather remedy.
    const climateOk = record.materials.filter((m) =>
      s.climate === "hot" || s.climate === "warm" ? !HEAVY.test(m) : s.climate === "cold" ? !LIGHT.test(m) : true
    );
    const usable = (climateOk.length > 0 ? climateOk : record.materials).filter((m) => !mentionsAny(m, avoided));
    const materials = usable.length > 0 ? usable : ["fabrics suited to the weather"];
    const remedies = interpreted.constraints.map((c) => WEATHER_REMEDY[c.code]).filter((x): x is string => Boolean(x));
    const materialDirection = `${capitalize(list(materials))}` + (remedies.length > 0 ? `, with ${remedies.join("; ")}.` : ".");

    const details = summaryItems(record.summary).filter((d) => !mentionsAny(d, avoided)).slice(0, 3);
    const definingDetails = details.length >= 2 ? details : [...details, ...record.silhouettes].slice(0, 3);

    const [lo, hi] = s.formalityBand;
    const contextRationale = [
      `${capitalize(assignment.reasons[0]!)}`,
      `For ${OCCASION_LABEL[s.occasionKind]} (formality ${lo === hi ? lo : `${lo}–${hi}`}) at ${s.temperatureC}°C: ${assignment.reasons.slice(1).join("; ")}`,
      remedies.length > 0 ? `Weather is handled with ${remedies.join("; ")}` : "",
    ]
      .filter(Boolean)
      .join(". ") + ".";

    // Evidence: the aesthetic's record plus the principles this template applied.
    const principles = [
      "tp-footwear-register",
      "tp-formality-one-notch",
      full ? "tp-volume-balance" : "tp-vertical-line",
      profile.expressiveness <= 2 ? "tp-neutral-base-one-accent" : profile.expressiveness >= 4 ? "tp-pattern-scale" : "tp-color-temperature",
      ...(["rain_protection", "snow_protection", "insulation", "breathable", "wind_protection"].some((c) => codes.has(c as ConstraintCode)) ? ["tp-fabric-for-weather"] : []),
      ...(codes.has("insulation") || codes.has("warm_layer") ? ["tp-layer-light-to-heavy"] : []),
      ...(codes.has("light_layer") ? ["tp-removable-layers"] : []),
    ].filter((id) => provided.has(id));

    return {
      role: assignment.role,
      aesthetic: assignment.aesthetic,
      title: record.title,
      aestheticThesis,
      silhouetteDirection,
      proportionDirection,
      paletteDirection,
      materialDirection,
      definingDetails,
      contextRationale,
      evidenceIds: [record.id, ...principles],
    };
  }
}

// =============================================================================
// Model writer
// =============================================================================

export class ModelConceptWriter implements ConceptWriter {
  readonly mode = "model" as const;

  constructor(
    private readonly model: TextGenerationModel,
    readonly modelId: string
  ) {}

  async write(request: WriteRequest): Promise<WriteResult> {
    const prompt = buildConceptPrompt({
      context: request.context,
      interpreted: request.interpreted,
      assignments: request.assignments,
      evidence: request.evidence,
      feedback: request.feedback,
    });
    const startedAt = Date.now();
    let usage: WriteResult["usage"];
    try {
      const result = await this.model.generateContent(prompt.text);
      const meta = result.response.usageMetadata;
      usage = meta ? { promptTokens: meta.promptTokenCount, outputTokens: meta.candidatesTokenCount, totalTokens: meta.totalTokenCount } : undefined;
      const text = result.response.text(); // throws on blocked responses
      const parsed = parseConceptResponse(text);
      const latencyMs = Date.now() - startedAt;
      if (!parsed.ok) return { drafts: null, outcome: parsed.kind, latencyMs, error: parsed.error, usage, prompt: prompt.text };
      return { drafts: parsed.drafts, outcome: "ok", latencyMs, usage, prompt: prompt.text };
    } catch (error) {
      return { drafts: null, outcome: "provider_error", latencyMs: Date.now() - startedAt, error: (error as Error).message, usage, prompt: prompt.text };
    }
  }
}
