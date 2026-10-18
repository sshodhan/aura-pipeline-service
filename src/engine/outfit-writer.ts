/**
 * Outfit Writers (Phase 3)
 *
 * - TemplateOutfitWriter: deterministic, no model. Dresses each concept from
 *   its aesthetic's garment vocabulary (knowledge store, profile.garments),
 *   choosing for climate, formality and the weather each garment handles,
 *   with colors from the same palette logic as the concept template
 *   (src/engine/palette.ts). It makes no claim to editorial quality.
 * - ModelOutfitWriter: one model call per write through TextGenerationModel,
 *   with the request, the concepts and the evidence as data blocks
 *   (src/engine/outfit-prompt.ts). composeOutfits owns the budget.
 */

import type { RecommendationContext } from "../baseline/fixtures";
import type { TextGenerationModel } from "../pipeline/core/generate-outfits";
import type { GarmentOption, GarmentProtection } from "../knowledge/schema";
import type { KnowledgeHit, KnowledgeStore } from "../knowledge/store";
import { GARMENT_PATTERNS as P, climateDistance, templateUsable } from "./garments";
import { OCCASION_LABEL, capitalize, composePalette, list, mentionsAny } from "./palette";
import { buildOutfitPrompt, parseOutfitResponse } from "./outfit-prompt";
import { classifyColor } from "./colors";
import type { GarmentDraft, OutfitDraft } from "./outfit-types";
import type { ConceptRole, InterpretedContext, StyleConcept, WriterAttempt } from "./types";

/** Steering for a template rewrite during curation (Phase 4); ignored by the model writer. */
export interface TemplateHint {
  /** Garment types to steer away from; the next-best options are used instead. */
  avoidTypes?: string[];
  /** Keep at most this many accent colors; the rest become palette neutrals. */
  maxAccents?: number;
  /** Use neutrals of one temperature only. */
  neutralTemperature?: "warm" | "cool";
}

/** Revision feedback: codes, roles and field or category names only. */
export interface FeedbackIssue {
  code: string;
  role?: ConceptRole;
  field?: string;
  category?: string;
  constraint?: string;
}

export interface OutfitWriteRequest {
  context: RecommendationContext;
  interpreted: InterpretedContext;
  concepts: StyleConcept[];
  evidence: KnowledgeHit[];
  store: KnowledgeStore;
  feedback?: FeedbackIssue[];
  templateHints?: Partial<Record<ConceptRole, TemplateHint>>;
}

export interface OutfitWriteResult {
  drafts: OutfitDraft[] | null;
  outcome: Exclude<WriterAttempt["outcome"], "validation_failed">;
  latencyMs: number;
  error?: string;
  usage?: WriterAttempt["usage"];
  prompt?: string;
}

export interface OutfitWriter {
  readonly mode: "template" | "model";
  readonly modelId: string | null;
  write(request: OutfitWriteRequest): Promise<OutfitWriteResult>;
}

// =============================================================================
// Template writer
// =============================================================================

type Slot = "top" | "mid" | "outer" | "bottom" | "footwear" | "accessory";

const ROLE_NOTE: Record<ConceptRole, string> = {
  best_bet: "the most direct answer to the day",
  adjacent: "a different but approachable take",
  exploration: "a broader take within the same constraints",
};

/** Neutrals used for footwear, and for any slot when the whole palette is avoided. */
const FOOTWEAR_NEUTRALS = ["black", "brown", "tan", "white", "grey", "navy"];
const FALLBACK_NEUTRALS = ["charcoal", "olive", "burgundy", "taupe", "forest green", "rust", "ink blue"];
const SHAPE = /\b(wide-leg|wide|straight|cropped|longline|oversized|boxy|tapered|flared|slim|relaxed|belted|wrapped|loose|pleated|close)\b/;
const LIGHT_FABRIC = /\b(linen|voile|gauze|chiffon|raffia|mesh)\b/;

const PROTECTION_PHRASE: Record<GarmentProtection, string> = { rain: "rain", wind: "wind", cold: "cold", sun: "sun" };

interface Choice {
  slot: Slot;
  option: GarmentOption;
  color: string;
}

export class TemplateOutfitWriter implements OutfitWriter {
  readonly mode = "template" as const;
  readonly modelId = null;

  async write(request: OutfitWriteRequest): Promise<OutfitWriteResult> {
    const startedAt = Date.now();
    const used = new Map<string, Set<string>>(); // category → garment types used by earlier outfits
    const drafts = request.concepts.map((c) => this.outfit(c, request, used));
    return { drafts, outcome: "ok", latencyMs: Date.now() - startedAt };
  }

  private outfit(concept: StyleConcept, request: OutfitWriteRequest, used: Map<string, Set<string>>): OutfitDraft {
    const { interpreted, store } = request;
    const s = interpreted.signals;
    const codes = new Set(interpreted.constraints.map((c) => c.code));
    const record = store.query({ types: ["aesthetic_reference"], aesthetics: [concept.aesthetic], includeExpired: true })[0]!.evidence;
    const profile = record.profile!;
    const options = (profile.garments ?? []).filter(templateUsable);
    const hint = request.templateHints?.[concept.role];

    const rain = codes.has("rain_protection") || codes.has("snow_protection");
    const cold = codes.has("insulation") || codes.has("snow_protection");
    const needOuter = rain || cold || codes.has("wind_protection") || codes.has("warm_layer");
    const outerNeeds: GarmentProtection[] = [...(rain ? ["rain" as const] : []), ...(cold ? ["cold" as const] : []), ...(codes.has("wind_protection") ? ["wind" as const] : [])];

    const [lo, hi] = s.formalityBand;
    const score = (g: GarmentOption, needs: GarmentProtection[]): number | null => {
      const cd = climateDistance(g, s.climate);
      if (cd > 1) return null;
      const overlaps = g.formality[0] <= hi && g.formality[1] >= lo;
      const gap = overlaps ? 0 : g.formality[1] < lo ? lo - g.formality[1] : g.formality[0] - hi;
      if (gap > (s.strictFormality ? 0 : 1)) return null;
      const t = `${g.type} ${g.material}`;
      let v = (cd === 0 ? 4 : 1) + (overlaps ? 2 : 0) + (g.formality[0] <= s.targetFormality && s.targetFormality <= g.formality[1] ? 2 : 0);
      for (const n of needs) if ((g.protects ?? []).includes(n)) v += 3;
      if (codes.has("performance")) v += (P.technical.test(t) || P.athleticFootwear.test(t) ? 4 : -2) - (P.heavy.test(t) ? 6 : 0);
      if ((s.climate === "warm" || s.climate === "hot") && g.category !== "footwear" && g.category !== "accessory" && P.heavy.test(t)) v -= 6;
      if (s.climate === "cold" && LIGHT_FABRIC.test(t)) v -= 3;
      if (used.get(g.category)?.has(g.type)) v -= 5;
      if (hint?.avoidTypes?.includes(g.type)) v -= 8;
      return v;
    };
    // Weather needs are a hard filter whenever some garment meets them all; otherwise the closest scores best.
    const best = (pred: (g: GarmentOption) => boolean, needs: GarmentProtection[] = []): GarmentOption | null => {
      const eligible = options.filter((g) => pred(g) && score(g, needs) !== null);
      const meeting = eligible.filter((g) => needs.every((n) => (g.protects ?? []).includes(n)));
      let top: { g: GarmentOption; v: number } | null = null;
      for (const g of meeting.length > 0 ? meeting : eligible) {
        const v = score(g, needs);
        if (v !== null && (!top || v > top.v)) top = { g, v };
      }
      return top?.g ?? null;
    };

    // Slots: base top, bottom and footwear always; layers and accessories as the weather asks.
    const picks: { slot: Slot; option: GarmentOption }[] = [];
    const take = (slot: Slot, g: GarmentOption | null) => g && picks.push({ slot, option: g });
    take("top", best((g) => g.category === "top" && g.layer !== "mid" && g.layer !== "outer"));
    if (s.climate === "cold" || s.climate === "cool") take("mid", best((g) => g.layer === "mid" && (g.category === "top" || g.category === "outerwear")));
    if (needOuter || (s.climate !== "warm" && s.climate !== "hot" && rain)) {
      take("outer", best((g) => g.category === "outerwear" && g.layer === "outer", outerNeeds));
    } else if (codes.has("light_layer")) {
      take("mid", best((g) => (g.layer === "mid" || g.layer === "outer") && (g.category === "top" || g.category === "outerwear") && !P.heavy.test(`${g.type} ${g.material}`)));
    } else if (rain) {
      take("outer", best((g) => g.category === "outerwear" && g.layer === "outer", ["rain"]));
    }
    // Formal and business occasions get a tailored layer even when the weather needs none.
    if ((s.occasionKind === "formal_event" || s.occasionKind === "business") && !picks.some((p) => p.slot === "mid" || p.slot === "outer")) {
      const hot = s.climate === "warm" || s.climate === "hot";
      take("mid", best((g) => g.category === "outerwear" && g.layer === "mid" && !(hot && P.heavy.test(`${g.type} ${g.material}`))));
    }
    take("bottom", best((g) => g.category === "bottom"));
    const footNeeds: GarmentProtection[] = [...(rain ? ["rain" as const] : []), ...(codes.has("snow_protection") ? ["cold" as const] : [])];
    take("footwear", best((g) => g.category === "footwear" && (!codes.has("snow_protection") || P.snowFootwear.test(g.type)), footNeeds) ?? best((g) => g.category === "footwear", footNeeds));
    if (codes.has("sun_protection")) take("accessory", best((g) => g.category === "accessory" && (g.protects ?? []).includes("sun"), ["sun"]));
    else if (cold) take("accessory", best((g) => g.category === "accessory" && (g.protects ?? []).includes("cold"), ["cold"]));

    for (const p of picks) {
      if (!used.has(p.option.category)) used.set(p.option.category, new Set());
      used.get(p.option.category)!.add(p.option.type);
    }

    // Colors: palette base minus avoided colors; a stated preference becomes the top's color.
    const palette = composePalette(profile, s);
    const notAvoided = (c: string) => !mentionsAny(c, s.avoidedColors) && !s.avoidedColors.some((a) => c.includes(a));
    let base = palette.base.length > 0 ? palette.base : FALLBACK_NEUTRALS.filter(notAvoided);
    if (hint?.neutralTemperature) {
      const oneTemperature = base.filter((c) => classifyColor(c).role !== "neutral" || classifyColor(c).temperature === hint.neutralTemperature);
      if (oneTemperature.filter((c) => classifyColor(c).role === "neutral").length >= 2) base = oneTemperature;
    }
    const at = (i: number) => base[Math.min(i, base.length - 1)]!;
    const footwearColor = FOOTWEAR_NEUTRALS.find((c) => base.includes(c)) ?? FOOTWEAR_NEUTRALS.find(notAvoided) ?? at(0);
    const colorFor: Record<Slot, string> = {
      bottom: at(0),
      top: palette.accents[0] ?? at(1),
      mid: at(2),
      outer: base.length > 3 ? at(3) : at(2),
      footwear: footwearColor,
      accessory: palette.accents[1] ?? palette.accents[0] ?? at(base.length - 1),
    };
    const choices: Choice[] = picks.map((p) => ({ ...p, color: colorFor[p.slot] }));
    if (hint?.maxAccents !== undefined) {
      // Recolor surplus accents to neutrals, keeping the accent on the accessory, then the top.
      const neutrals = [...base, ...FALLBACK_NEUTRALS, ...FOOTWEAR_NEUTRALS].filter((c) => notAvoided(c) && classifyColor(c).role === "neutral");
      const priority: Slot[] = ["outer", "mid", "bottom", "footwear", "top", "accessory"];
      let accents = choices.filter((c) => classifyColor(c.color).role === "accent").length;
      for (const slot of priority) {
        if (accents <= hint.maxAccents) break;
        const c = choices.find((x) => x.slot === slot);
        if (c && classifyColor(c.color).role === "accent" && neutrals.length > 0) {
          c.color = neutrals[priority.indexOf(slot) % neutrals.length]!;
          accents--;
        }
      }
    }

    const garments = choices.map((c) => this.garment(c, concept, request));
    const find = (slot: Slot) => choices.find((c) => c.slot === slot);
    return {
      role: concept.role,
      aesthetic: concept.aesthetic,
      title: `${concept.title} for ${OCCASION_LABEL[s.occasionKind]}`,
      garments,
      layering: this.layering(find),
      proportionStrategy: `${concept.proportionDirection} Here the ${find("bottom")?.option.type ?? "bottom"} and the ${find("top")?.option.type ?? "top"} carry it.`,
      colorStrategy: this.colorStrategy(find),
      textureStrategy: `${capitalize(list([...new Set(choices.map((c) => c.option.material))]))}: different surfaces keep a ${base.length > 0 ? "restrained" : "tonal"} palette from looking flat.`,
      stylingRationale:
        `${concept.title}, ${ROLE_NOTE[concept.role]}: the ${find("top")?.option.type} with ${find("bottom")?.option.type}` +
        (find("outer") ? ` under the ${find("outer")!.option.type}` : "") +
        `, finished with ${find("footwear")?.option.type}. ${concept.aestheticThesis.split(/(?<=\.)\s/)[0]}`,
      weatherNotes: this.weatherNotes(find, interpreted),
      proTip: this.proTip(find, interpreted),
      evidenceIds: this.evidence(concept, request, choices),
    };
  }

  private garment(c: Choice, concept: StyleConcept, request: OutfitWriteRequest): GarmentDraft {
    const s = request.interpreted.signals;
    const g = c.option;
    const fit = s.fit && (c.slot === "top" || c.slot === "bottom" || c.slot === "outer") ? s.fit : g.fit;
    return {
      category: g.category,
      layer: c.slot === "top" ? "base" : c.slot === "mid" ? "mid" : c.slot === "outer" ? "outer" : null,
      type: g.type,
      name: `${c.color} ${g.type}`,
      color: c.color,
      material: g.material,
      fit,
      silhouette: g.type.match(SHAPE)?.[0] ?? fit,
      why: this.why(c, concept, request),
    };
  }

  private why(c: Choice, concept: StyleConcept, request: OutfitWriteRequest): string {
    const s = request.interpreted.signals;
    const g = c.option;
    const protects = (g.protects ?? []).map((p) => PROTECTION_PHRASE[p]);
    switch (c.slot) {
      case "top":
        return `The ${g.type} is the base layer; ${g.material} stays ${s.climate === "hot" || s.climate === "warm" ? "breathable" : s.climate === "mild" ? "comfortable" : "warm"} at ${s.temperatureC}°C.`;
      case "mid":
        return `The ${g.type} is the removable middle layer for moving between outdoors and in.`;
      case "outer":
        return protects.length > 0
          ? `The ${g.type} handles the ${list(protects)} while keeping the ${concept.title.toLowerCase()} line.`
          : `The ${g.type} adds the outer layer ${s.climate} weather calls for.`;
      case "bottom":
        return `The ${g.type} ${/s$/.test(g.type) ? "set" : "sets"} the ${g.fit} silhouette the ${concept.title.toLowerCase()} direction is built on.`;
      case "footwear":
        return `The ${g.type} set the register for ${OCCASION_LABEL[s.occasionKind]}${protects.includes("rain") ? " and cope with wet ground" : ""}.`;
      case "accessory":
        return protects.includes("sun") ? `The ${g.type} gives shade in the strong sun.` : `The ${g.type} adds warmth and carries the ${c.color} accent.`;
    }
  }

  private layering(find: (slot: Slot) => Choice | undefined): string {
    const [top, mid, outer] = [find("top"), find("mid"), find("outer")];
    const order = [top && `base: ${top.option.type}`, mid && `middle: ${mid.option.type}`, outer && `outer: ${outer.option.type}`].filter(Boolean).join("; ");
    const off = outer && mid
      ? `The ${outer.option.type} comes off indoors, and the ${mid.option.type} works on its own.`
      : mid
        ? `The ${mid.option.type} comes off when it warms up.`
        : outer
          ? `The ${outer.option.type} comes off indoors.`
          : "A single layer: nothing needs to come off.";
    return `${capitalize(order)}. ${off}`;
  }

  private colorStrategy(find: (slot: Slot) => Choice | undefined): string {
    const [top, bottom, outer, acc] = [find("top"), find("bottom"), find("outer"), find("accessory")];
    const main = `${capitalize(bottom!.color)} ${bottom!.option.type} with a ${top!.color} ${top!.option.type}` + (outer ? `, under a ${outer.color} ${outer.option.type}` : "");
    return `${main}; ${acc ? `${acc.color} on the ${acc.option.type} is the accent` : "footwear stays neutral so the palette reads as one family"}.`;
  }

  private weatherNotes(find: (slot: Slot) => Choice | undefined, interpreted: InterpretedContext): string {
    const s = interpreted.signals;
    const [top, mid, outer, bottom, foot, acc] = [find("top"), find("mid"), find("outer"), find("bottom"), find("footwear"), find("accessory")];
    const notes: string[] = [];
    for (const c of interpreted.constraints) {
      if (c.code === "rain_protection" && outer && foot) notes.push(`the ${outer.option.type} and ${foot.option.type} handle the rain`);
      if (c.code === "snow_protection" && outer && foot) notes.push(`the ${outer.option.type} and ${foot.option.type} handle the snow`);
      if (c.code === "insulation" && outer) notes.push(`the ${outer.option.type} insulates against the cold`);
      if (c.code === "wind_protection" && outer) notes.push(`the ${outer.option.type} blocks the wind`);
      if (c.code === "warm_layer" && (mid ?? outer)) notes.push(`the ${(mid ?? outer)!.option.type} adds warmth`);
      if (c.code === "light_layer" && (mid ?? outer)) notes.push(`the ${(mid ?? outer)!.option.type} covers the cooler part of the day`);
      if (c.code === "breathable" && top && bottom) notes.push(`the ${top.option.type} and ${bottom.option.type} stay breathable`);
      if (c.code === "sun_protection" && acc) notes.push(`the ${acc.option.type} gives shade`);
      if (c.code === "performance" && foot) notes.push(`the ${foot.option.type} and technical layers are made for the activity`);
    }
    return notes.length > 0
      ? `${capitalize(notes.join("; "))} at ${s.temperatureC}°C.`
      : `At ${s.temperatureC}°C and ${s.precipitation === "none" ? "dry" : s.precipitation}, no special weather pieces are needed.`;
  }

  private proTip(find: (slot: Slot) => Choice | undefined, interpreted: InterpretedContext): string {
    const codes = new Set(interpreted.constraints.map((c) => c.code));
    const [top, mid, outer] = [find("top"), find("mid"), find("outer")];
    if (codes.has("performance")) return `Start slightly cool: the ${(outer ?? mid ?? top)!.option.type} should feel a little light when you set off.`;
    if ((codes.has("rain_protection") || codes.has("snow_protection")) && outer) {
      return `Size the ${outer.option.type} to close over the ${(mid ?? top)!.option.type} without pulling at the shoulders.`;
    }
    if (codes.has("insulation") && outer) return `Layer thin to thick: the ${top!.option.type} first, then ${mid ? `the ${mid.option.type}, then ` : ""}the ${outer.option.type}.`;
    if (codes.has("light_layer") && (mid ?? outer)) return `Carry the ${(mid ?? outer)!.option.type} for later; the outfit still works with it off.`;
    if (codes.has("breathable")) return `Leave the ${top!.option.type} loosely tucked or untucked so air can move.`;
    return `Keep the ${top!.option.type} and ${find("bottom")!.option.type} in the same color family and let the footwear set the register.`;
  }

  private evidence(concept: StyleConcept, request: OutfitWriteRequest, choices: Choice[]): string[] {
    const provided = new Set(request.evidence.map((h) => h.evidence.id));
    const layered = choices.filter((c) => c.slot === "top" || c.slot === "mid" || c.slot === "outer").length >= 2;
    const ids = [...concept.evidenceIds, "tp-texture-contrast", ...(layered ? ["tp-layer-light-to-heavy"] : [])];
    return [...new Set(ids)].filter((id) => provided.has(id));
  }
}

// =============================================================================
// Model writer
// =============================================================================

export class ModelOutfitWriter implements OutfitWriter {
  readonly mode = "model" as const;

  constructor(
    private readonly model: TextGenerationModel,
    readonly modelId: string
  ) {}

  async write(request: OutfitWriteRequest): Promise<OutfitWriteResult> {
    const prompt = buildOutfitPrompt(request);
    const startedAt = Date.now();
    let usage: OutfitWriteResult["usage"];
    try {
      const result = await this.model.generateContent(prompt.text);
      const meta = result.response.usageMetadata;
      usage = meta ? { promptTokens: meta.promptTokenCount, outputTokens: meta.candidatesTokenCount, totalTokens: meta.totalTokenCount } : undefined;
      const parsed = parseOutfitResponse(result.response.text()); // text() throws on blocked responses
      const latencyMs = Date.now() - startedAt;
      if (!parsed.ok) return { drafts: null, outcome: parsed.kind, latencyMs, error: parsed.error, usage, prompt: prompt.text };
      return { drafts: parsed.drafts, outcome: "ok", latencyMs, usage, prompt: prompt.text };
    } catch (error) {
      return { drafts: null, outcome: "provider_error", latencyMs: Date.now() - startedAt, error: (error as Error).message, usage, prompt: prompt.text };
    }
  }
}
