/**
 * Outfit Validator (Phase 3)
 *
 * Deterministic, structural checks on three outfit drafts. Each outfit must
 * be complete and wearable for the context: the right garments for the
 * weather on the garment that handles it, nothing too casual for a strict
 * occasion, no avoided colors, names a consumer can display. The three
 * outfits must also differ in at least two core garments, the same rule the
 * consumer's Aisle gate applies (docs/CONSUMER_INTEGRATION_CONTRACT.md §A6).
 *
 * Keyword checks are heuristics: passing them shows each requirement is met
 * in words, not that the outfit is good. Quality is Phase 4.
 */

import { GARMENT_PATTERNS as P, NOT_FORMAL, TOO_CASUAL, garmentText } from "./garments";
import { escapeRegex } from "./palette";
import { HOLLOW, MINOR_UNSAFE, TREND_CLAIM, makesLocalClaim, words } from "./validate";
import { MAX_GARMENTS, MIN_GARMENTS, type GarmentDraft, type OutfitDraft, type OutfitIssue, type OutfitValidation } from "./outfit-types";
import { ROLES, type ConceptRole, type InterpretedContext, type StyleConcept } from "./types";

export interface OutfitValidationInput {
  interpreted: InterpretedContext;
  concepts: StyleConcept[];
  providedEvidenceIds: string[];
  hasRegionalEvidence: boolean;
  hasContemporaryEvidence: boolean;
}

/** Core slots compared for distinctness. A dress fills the top slot. */
const CORE_SLOTS = ["top", "bottom", "outerwear", "footwear"] as const;
export const MIN_DIFFERING_CORE_SLOTS = 2;

const slotType = (o: OutfitDraft, slot: (typeof CORE_SLOTS)[number]) => {
  const pick = (g: GarmentDraft) =>
    slot === "top" ? g.category === "dress" || (g.category === "top" && g.layer !== "mid") : g.category === slot && (slot !== "outerwear" || g.layer === "outer");
  return o.garments
    .filter(pick)
    .map((g) => g.type.toLowerCase().trim())
    .sort()
    .join(" + ");
};

export function differingCoreSlots(a: OutfitDraft, b: OutfitDraft): number {
  return CORE_SLOTS.filter((slot) => slotType(a, slot) !== slotType(b, slot)).length;
}

const outfitText = (o: OutfitDraft) =>
  [o.title, o.layering, o.proportionStrategy, o.colorStrategy, o.textureStrategy, o.stylingRationale, o.weatherNotes, o.proTip, ...o.garments.flatMap((g) => [g.name, g.type, g.material, g.fit, g.silhouette, g.details ?? "", g.why])]
    .join("\n")
    .toLowerCase();

export function genericWhyReason(why: string): string | null {
  const w = words(why);
  if (w.length < 5) return "fewer than 5 words";
  if (w.filter((x) => HOLLOW.has(x)).length / w.length > 0.2) return "relies on generic praise words";
  return null;
}

export function validateOutfits(drafts: OutfitDraft[], input: OutfitValidationInput): OutfitValidation {
  const issues: OutfitIssue[] = [];
  const s = input.interpreted.signals;
  const codes = new Set(input.interpreted.constraints.map((c) => c.code));
  const provided = new Set(input.providedEvidenceIds);
  const add = (issue: OutfitIssue) => issues.push(issue);

  for (const role of ROLES) {
    const count = drafts.filter((d) => d.role === role).length;
    if (count !== 1) add({ code: "outfit_coverage", role, message: `expected one ${role} outfit, found ${count}` });
  }

  for (const o of drafts) {
    const role = o.role;
    const concept = input.concepts.find((c) => c.role === role);
    if (concept && o.aesthetic !== concept.aesthetic) {
      add({ code: "aesthetic_mismatch", role, field: "aesthetic", message: `${role} outfit should be ${concept.aesthetic}, got ${o.aesthetic}` });
    }

    const by = (cat: GarmentDraft["category"]) => o.garments.filter((g) => g.category === cat);
    const outers = by("outerwear").filter((g) => g.layer === "outer");
    const footwear = by("footwear");
    const accessories = by("accessory");
    const hasDress = by("dress").length > 0;
    const baseTops = by("top").filter((g) => g.layer !== "mid");

    // Completeness.
    if (footwear.length !== 1) add({ code: "incomplete_outfit", role, category: "footwear", message: `needs exactly one pair of footwear, found ${footwear.length}` });
    if (!hasDress && (baseTops.length === 0 || by("bottom").length === 0)) {
      add({ code: "incomplete_outfit", role, message: "needs a dress, or a top and a bottom" });
    }
    if (o.garments.length < MIN_GARMENTS || o.garments.length > MAX_GARMENTS) {
      add({ code: "incomplete_outfit", role, field: "garments", message: `has ${o.garments.length} garments (${MIN_GARMENTS}–${MAX_GARMENTS})` });
    }

    // Weather, on the garment that handles it.
    const outerText = outers.map(garmentText).join(" ");
    const footText = footwear.map(garmentText).join(" ");
    const needsOuter = codes.has("rain_protection") || codes.has("snow_protection") || codes.has("insulation") || codes.has("wind_protection");
    if (needsOuter && outers.length === 0) add({ code: "missing_outer_layer", role, category: "outerwear", message: "the weather calls for an outer layer" });
    const missing = (constraint: OutfitIssue["constraint"], category: GarmentDraft["category"] | undefined, message: string) =>
      add({ code: "missing_constraint", role, constraint, category, message });
    if (outers.length > 0 || !needsOuter) {
      if ((codes.has("rain_protection") || codes.has("snow_protection")) && !P.water.test(outerText)) missing("rain_protection", "outerwear", "outer layer is not water-resistant");
      if ((codes.has("insulation") || codes.has("snow_protection")) && !P.insulating.test(outerText)) missing("insulation", "outerwear", "outer layer is not insulating");
      if (codes.has("wind_protection") && !P.wind.test(outerText)) missing("wind_protection", "outerwear", "outer layer is not wind-resistant");
    }
    if (codes.has("rain_protection") && !P.rainFootwear.test(footText)) missing("rain_protection", "footwear", "footwear is not suited to rain");
    if (codes.has("snow_protection") && !P.snowFootwear.test(footText)) missing("snow_protection", "footwear", "snow needs boots");
    if ((codes.has("warm_layer") || codes.has("light_layer")) && !o.garments.some((g) => g.layer === "mid" || g.layer === "outer")) {
      missing(codes.has("warm_layer") ? "warm_layer" : "light_layer", undefined, "needs a removable mid or outer layer");
    }
    if (codes.has("breathable")) {
      const heavy = o.garments.filter((g) => g.category !== "footwear" && g.category !== "accessory" && P.heavy.test(garmentText(g)));
      for (const g of heavy) missing("breathable", g.category, `${g.type} is too heavy for the heat`);
      if (![...baseTops, ...by("dress"), ...by("bottom")].some((g) => P.breathable.test(garmentText(g)))) missing("breathable", "top", "no breathable fabric next to the skin");
    }
    if (codes.has("sun_protection") && !accessories.some((g) => P.sunShade.test(garmentText(g)))) missing("sun_protection", "accessory", "needs a hat or sunglasses for the sun");
    if (codes.has("performance")) {
      if (!P.athleticFootwear.test(footText)) missing("performance", "footwear", "needs running or trail footwear");
      if (![...by("top"), ...by("bottom")].some((g) => P.technical.test(garmentText(g)))) missing("performance", "top", "needs technical fabrics");
    }

    // Occasion.
    if (s.occasionKind === "formal_event" || s.occasionKind === "business") {
      for (const g of o.garments) {
        const t = garmentText(g);
        if (TOO_CASUAL.test(t) || (s.occasionKind === "formal_event" && NOT_FORMAL.test(t))) {
          add({ code: "occasion_mismatch", role, category: g.category, message: `${g.type} is too casual for the occasion` });
        }
      }
    }

    // Colors and names.
    for (const g of o.garments) {
      for (const color of s.avoidedColors) {
        const pattern = new RegExp(`\\b${escapeRegex(color)}\\b`, "i");
        if (pattern.test(`${g.color} ${g.name} ${g.details ?? ""}`)) add({ code: "avoided_color", role, category: g.category, constraint: "avoid_colors", message: `${g.type} uses avoided color "${color}"` });
      }
      if (!g.name.toLowerCase().includes(g.color.toLowerCase()) || g.name.includes(".") || g.name.length > 80) {
        add({ code: "name_format", role, category: g.category, field: "name", message: `name must contain its color, no period, at most 80 characters` });
      }
      const generic = genericWhyReason(g.why);
      if (generic) add({ code: "generic_why", role, category: g.category, field: "why", message: `${g.type}: ${generic}` });
    }
    for (const color of s.avoidedColors) {
      if (new RegExp(`\\b${escapeRegex(color)}\\b`, "i").test(o.colorStrategy)) add({ code: "avoided_color", role, field: "colorStrategy", constraint: "avoid_colors", message: `color strategy mentions avoided color "${color}"` });
    }

    // Requested fit.
    if (s.fit && ![...by("top"), ...by("bottom"), ...by("outerwear"), ...by("dress")].some((g) => g.fit.toLowerCase().includes(s.fit!))) {
      add({ code: "fit_not_honored", role, field: "fit", message: `no garment is cut to the requested fit` });
    }

    // Evidence and claims.
    for (const id of o.evidenceIds) {
      if (!provided.has(id)) add({ code: "evidence_not_provided", role, field: "evidenceIds", message: `${id} was not in the evidence provided` });
    }
    const all = outfitText(o);
    if (!input.hasContemporaryEvidence && TREND_CLAIM.test(all)) add({ code: "unsupported_claim", role, message: "makes a trend claim without contemporary evidence" });
    if (!input.hasRegionalEvidence && makesLocalClaim(all, s.city)) add({ code: "unsupported_claim", role, message: "makes a city or regional style claim without regional evidence" });
    if (s.minor && MINOR_UNSAFE.test(all)) add({ code: "minor_safety", role, constraint: "minor_safe", message: "uses styling language unsuitable for a minor" });
  }

  // Distinctness across the collection.
  const differing: OutfitValidation["differingCoreSlots"] = [];
  const byRole = (r: ConceptRole) => drafts.find((d) => d.role === r);
  for (const [a, b] of [["best_bet", "adjacent"], ["best_bet", "exploration"], ["adjacent", "exploration"]] as [ConceptRole, ConceptRole][]) {
    const oa = byRole(a);
    const ob = byRole(b);
    if (!oa || !ob) continue;
    const slots = differingCoreSlots(oa, ob);
    differing.push({ a, b, slots });
    if (slots < MIN_DIFFERING_CORE_SLOTS) add({ code: "not_distinct_garments", role: b, message: `${a} and ${b} differ in only ${slots} core garment(s)` });
  }

  return { passed: issues.length === 0, issues, differingCoreSlots: differing };
}
