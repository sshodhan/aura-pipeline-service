/**
 * Quality Rubric (Phase 4)
 *
 * Deterministic editorial scores for each outfit, 1 (weak) … 5 (strong), on
 * the design's four dimensions, each with the reasons behind it. The rubric
 * reads only garment attributes and knowledge-store vocabularies, never the
 * outfit's own wording, so praise words such as "perfect" or "elegant" cannot
 * raise a score.
 *
 * These are rubric scores, not probabilities of user satisfaction, and the
 * thresholds are uncalibrated until Phase 6's human evaluation.
 * visualPotential is a specificity proxy: it checks that each garment is
 * described concretely enough to depict, not that the outfit looks good.
 */

import type { GarmentOption } from "../knowledge/schema";
import type { KnowledgeStore } from "../knowledge/store";
import { classifyColor } from "./colors";
import { climateDistance } from "./garments";
import { differingCoreSlots } from "./outfit-validate";
import type { OutfitDraft } from "./outfit-types";
import type { ConceptRole, InterpretedContext } from "./types";

export const EVALUATOR_VERSION = "rubric-0.1";
/** A dimension below this sends the outfit to revision. Uncalibrated. */
export const REVISE_BELOW = 3;

export const QUALITY_DIMENSIONS = ["composition", "contextualRelevance", "distinctiveness", "visualPotential"] as const;
export type QualityDimension = (typeof QUALITY_DIMENSIONS)[number];

export const QUALITY_ISSUE_CODES = [
  "too_many_accents",
  "neutral_temperature_clash",
  "proportion_unbalanced",
  "single_texture",
  "formality_drift",
  "climate_drift",
  "preferred_colors_unused",
  "low_distinctiveness",
  "color_repetition",
  "low_specificity",
] as const;
export type QualityIssueCode = (typeof QUALITY_ISSUE_CODES)[number];

export interface QualityIssue {
  code: QualityIssueCode;
  role: ConceptRole;
  dimension: QualityDimension;
  message: string;
}

export interface RubricScores {
  composition: number;
  contextualRelevance: number;
  distinctiveness: number;
  visualPotential: number;
}

export interface RubricResult {
  role: ConceptRole;
  scores: RubricScores;
  reasons: Record<QualityDimension, string[]>;
  issues: QualityIssue[];
}

const clamp = (n: number) => Math.max(1, Math.min(5, n));
/** "x is" / "x, y are": subject-verb agreement for a list of garment names. */
const subject = (names: string[], one: string, many: string) => `${names.join(", ")} ${names.length === 1 ? one : many}`;
const FULL = /\b(oversized|loose|boxy)\b/;
const GENERIC_COLOR = /^(neutral|colorful|colourful|bright|dark|light|muted|multi|mixed|various)$/;
const GENERIC_MATERIAL = /^(fabric|material|textile|cloth|mixed|various|blend)$/;
const GENERIC_FIT = /^(normal|standard|any|average|usual)$/;

/** Material families, for texture contrast. */
const MATERIAL_FAMILIES: [string, RegExp][] = [
  ["wool", /\b(wool|merino|cashmere|tweed|flannel|boucle|mohair|felt)\b/],
  ["silk", /\b(silk|satin|crepe|chiffon)\b/],
  ["leather", /\b(leather|suede|patent)\b/],
  ["technical", /\b(nylon|technical|synthetic|ripstop|stretch|mesh|fleece|down)\b/],
  ["linen", /\b(linen|raffia|straw)\b/],
  ["velvet", /\b(velvet|corduroy|jacquard)\b/],
  ["cotton", /\b(cotton|poplin|oxford|chambray|jersey|voile|gauze|twill|chino|canvas|denim|pique|gabardine|waxed|oiled)\b/],
  ["knit", /\bknit\b/],
];
const materialFamily = (material: string) => MATERIAL_FAMILIES.find(([, p]) => p.test(material.toLowerCase()))?.[0] ?? "other";

/** Garment options across all aesthetics, by type, for formality and climate lookups. */
function vocabulary(store: KnowledgeStore): Map<string, GarmentOption> {
  const map = new Map<string, GarmentOption>();
  for (const { evidence } of store.query({ types: ["aesthetic_reference"], includeExpired: true })) {
    for (const g of evidence.profile?.garments ?? []) if (!map.has(g.type)) map.set(g.type, g);
  }
  return map;
}

export interface RubricInput {
  outfits: OutfitDraft[];
  interpreted: InterpretedContext;
  store: KnowledgeStore;
}

/** Scores every outfit; distinctiveness is relative to the other two. */
export function scoreCollection(input: RubricInput): RubricResult[] {
  const vocab = vocabulary(input.store);
  return input.outfits.map((o) => scoreOutfit(o, input, vocab));
}

function scoreOutfit(o: OutfitDraft, input: RubricInput, vocab: Map<string, GarmentOption>): RubricResult {
  const s = input.interpreted.signals;
  const role = o.role;
  const reasons: RubricResult["reasons"] = { composition: [], contextualRelevance: [], distinctiveness: [], visualPotential: [] };
  const issues: QualityIssue[] = [];
  const flag = (code: QualityIssueCode, dimension: QualityDimension, message: string) => {
    issues.push({ code, role, dimension, message });
    reasons[dimension].push(message);
  };
  const reference = input.store.query({ types: ["aesthetic_reference"], aesthetics: [o.aesthetic], includeExpired: true })[0]?.evidence;
  const profile = reference?.profile;
  const expressiveness = profile?.expressiveness ?? 3;
  const wearables = o.garments.filter((g) => g.category !== "footwear" && g.category !== "accessory");

  // --- Composition: color, proportion, texture -------------------------------
  let composition = 5;
  const classes = o.garments.map((g) => ({ g, c: classifyColor(g.color) }));
  const accents = classes.filter((x) => x.c.role === "accent");
  const allowed = expressiveness <= 2 ? 1 : expressiveness === 3 ? 2 : 4;
  if (accents.length > allowed) {
    composition -= Math.min(2, accents.length - allowed);
    flag("too_many_accents", "composition", `${accents.length} accent colors where this aesthetic carries ${allowed} (tp-neutral-base-one-accent)`);
  } else reasons.composition.push(`${accents.length} accent color(s), within the aesthetic's ${allowed}`);
  const warm = classes.filter((x) => x.c.role === "neutral" && x.c.temperature === "warm").length;
  const cool = classes.filter((x) => x.c.role === "neutral" && x.c.temperature === "cool").length;
  if (warm >= 2 && cool >= 2 && Math.max(warm, cool) < 2 * Math.min(warm, cool)) {
    composition -= 1;
    flag("neutral_temperature_clash", "composition", `warm (${warm}) and cool (${cool}) neutrals compete with neither leading (tp-color-temperature)`);
  } else reasons.composition.push(`neutral temperature: ${warm} warm, ${cool} cool`);
  const top = o.garments.find((g) => g.category === "top" && g.layer !== "mid");
  const bottom = o.garments.find((g) => g.category === "bottom");
  const shape = (g?: { fit: string; silhouette: string; type: string }) => (g ? `${g.fit} ${g.silhouette} ${g.type}`.toLowerCase() : "");
  // Aesthetics built on volume (streetwear's oversized shapes) are exempt from the balance rule.
  const ownsVolume = (reference?.silhouettes ?? []).some((x) => /\boversized\b/.test(x));
  if (top && bottom && FULL.test(shape(top)) && FULL.test(shape(bottom)) && !ownsVolume) {
    composition -= 1;
    flag("proportion_unbalanced", "composition", "both halves are full; nothing closer to the body anchors the shape (tp-volume-balance)");
  } else reasons.composition.push("volume is balanced between top and bottom");
  const families = new Set(wearables.map((g) => materialFamily(g.material)));
  if (families.size < 2) {
    composition -= 1;
    flag("single_texture", "composition", `one material family (${[...families].join(", ")}): no texture contrast (tp-texture-contrast)`);
  } else reasons.composition.push(`${families.size} material families`);

  // --- Contextual relevance: formality, climate, preferences -----------------
  let relevance = 5;
  const known = o.garments.map((g) => ({ g, v: vocab.get(g.type) })).filter((x) => x.v);
  const unknown = o.garments.length - known.length;
  if (unknown > 0) reasons.contextualRelevance.push(`${unknown} garment(s) not in the vocabulary: formality and climate unchecked`);
  const drift = known.filter(({ v }) => s.targetFormality < v!.formality[0] || s.targetFormality > v!.formality[1]);
  if (drift.length > 0) {
    relevance -= drift.length >= 3 ? 2 : 1;
    flag("formality_drift", "contextualRelevance", `${subject(drift.map((x) => x.g.type), "sits", "sit")} outside the target formality ${s.targetFormality}`);
  } else reasons.contextualRelevance.push(`every known garment covers the target formality ${s.targetFormality}`);
  const offClimate = known.filter(({ g, v }) => g.category !== "accessory" && climateDistance(v!, s.climate) >= 1);
  if (offClimate.length > 0) {
    relevance -= offClimate.length >= 3 ? 2 : 1;
    flag("climate_drift", "contextualRelevance", `${subject(offClimate.map((x) => x.g.type), "is", "are")} meant for other weather than ${s.climate}`);
  } else reasons.contextualRelevance.push(`every known garment suits ${s.climate} weather`);
  if (s.preferredColors.length > 0 && !o.garments.some((g) => s.preferredColors.includes(g.color.toLowerCase()))) {
    relevance -= 1;
    flag("preferred_colors_unused", "contextualRelevance", `none of the preferred colors (${s.preferredColors.join(", ")}) is used`);
  }

  // --- Distinctiveness (relative to the other outfits) -----------------------
  let distinctiveness = 5;
  const others = input.outfits.filter((x) => x.role !== role);
  if (others.length > 0) {
    const minSlots = Math.min(...others.map((x) => differingCoreSlots(o, x)));
    distinctiveness = minSlots >= 4 ? 5 : minSlots === 3 ? 4 : minSlots === 2 ? 3 : 1;
    if (minSlots < 2) flag("low_distinctiveness", "distinctiveness", `differs from another outfit in only ${minSlots} core garment(s)`);
    else reasons.distinctiveness.push(`differs from the nearest outfit in ${minSlots} of 4 core garments`);
    const colors = new Set(o.garments.map((g) => g.color.toLowerCase()));
    const overlap = Math.max(...others.map((x) => {
      const oc = new Set(x.garments.map((g) => g.color.toLowerCase()));
      const union = new Set([...colors, ...oc]);
      return [...colors].filter((c) => oc.has(c)).length / union.size;
    }));
    if (overlap >= 0.6) {
      distinctiveness -= 1;
      flag("color_repetition", "distinctiveness", `shares ${Math.round(overlap * 100)}% of its colors with another outfit`);
    }
  }

  // --- Visual potential (specificity proxy) ----------------------------------
  let visual = 5;
  const generic = (pattern: RegExp, value: string) => pattern.test(value.toLowerCase().trim());
  const vague = o.garments.filter(
    (g) => generic(GENERIC_COLOR, g.color) || generic(GENERIC_MATERIAL, g.material) || generic(GENERIC_FIT, g.fit) || g.type.trim().split(/\s+/).length < 2
  );
  if (vague.length > 0) {
    visual -= Math.min(3, vague.length);
    flag("low_specificity", "visualPotential", `${subject(vague.map((g) => g.name), "is", "are")} too vague to depict exactly`);
  } else reasons.visualPotential.push("every garment names a specific color, material, fit and type (proxy, not a judgment of looks)");

  return {
    role,
    scores: { composition: clamp(composition), contextualRelevance: clamp(relevance), distinctiveness: clamp(distinctiveness), visualPotential: clamp(visual) },
    reasons,
    issues,
  };
}

export const totalScore = (s: RubricScores) => s.composition + s.contextualRelevance + s.distinctiveness + s.visualPotential;
export const needsRevision = (s: RubricScores) => QUALITY_DIMENSIONS.some((d) => s[d] < REVISE_BELOW);
