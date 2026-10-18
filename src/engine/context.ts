/**
 * Context Interpreter (Phase 2)
 *
 * Turns a RecommendationContext into hard constraints, explicit preferences,
 * inferred opportunities and unknowns. Deterministic and key-free.
 *
 * Principles (docs/AURA_PRODUCT_CONTEXT.md, FASHION_INTELLIGENCE_DESIGN.md):
 * - the occasion and the weather are hard constraints; the everyday lifestyle
 *   is a preference that cannot override the occasion;
 * - age, city and gender expression are context, never taste: nothing here
 *   picks an aesthetic from them;
 * - unknowns stay unknown; no defaults are invented for unstated fields;
 * - every request string is untrusted data. It is length-capped here and only
 *   ever reaches a model inside a nonce-tagged data block (src/engine/prompt.ts).
 */

import { createHash } from "node:crypto";

import { recommendationContextSchema, type RecommendationContext } from "../baseline/fixtures";
import { seasonFor } from "../knowledge/coverage";
import type { ClimateBand } from "../knowledge/schema";
import type { KnowledgeStore } from "../knowledge/store";
import type { ContextSignals, HardConstraint, InterpretedContext, OccasionKind } from "./types";

// =============================================================================
// Request validation
// =============================================================================

export const MAX_TEXT_LENGTH = 120;
export const MAX_LIST_ITEMS = 8;

export type ParsedContext = { ok: true; context: RecommendationContext } | { ok: false; errors: string[] };

/** Schema check plus length caps on every free-text field. */
export function parseContext(input: unknown): ParsedContext {
  const parsed = recommendationContextSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "context"}: ${i.message}`) };
  }
  const errors: string[] = [];
  const walk = (value: unknown, path: string) => {
    if (typeof value === "string" && value.length > MAX_TEXT_LENGTH) errors.push(`${path}: longer than ${MAX_TEXT_LENGTH} characters`);
    else if (Array.isArray(value)) {
      if (value.length > MAX_LIST_ITEMS) errors.push(`${path}: more than ${MAX_LIST_ITEMS} items`);
      value.forEach((v, i) => walk(v, `${path}[${i}]`));
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k);
    }
  };
  walk(parsed.data, "");
  return errors.length > 0 ? { ok: false, errors } : { ok: true, context: parsed.data };
}

/** Stable identity of the request content (requestId excluded). */
export function contextFingerprint(context: RecommendationContext): string {
  const { requestId: _ignored, ...rest } = context;
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v as object)
              .sort()
              .map((k) => [k, canonical((v as Record<string, unknown>)[k])])
          )
        : v;
  return createHash("sha256").update(JSON.stringify(canonical(rest))).digest("hex").slice(0, 16);
}

// =============================================================================
// Rules
// =============================================================================

/** Temperature bands (°C, lower bound inclusive). Profiles in the knowledge store use these names. */
export function climateBand(temperatureC: number): ClimateBand {
  if (temperatureC < 5) return "cold";
  if (temperatureC < 13) return "cool";
  if (temperatureC < 21) return "mild";
  if (temperatureC < 28) return "warm";
  return "hot";
}

interface OccasionRule {
  kind: Exclude<OccasionKind, "unrecognized">;
  pattern: RegExp;
  band: [number, number];
  target: number;
  strict: boolean;
}

/** First match wins, so the more specific occasions come first ("running errands" is errands, not athletic). */
const OCCASION_RULES: OccasionRule[] = [
  { kind: "errands", pattern: /\b(errand|errands|groceries|grocery|shopping)\b/, band: [1, 2], target: 2, strict: false },
  { kind: "athletic", pattern: /\b(run|running|jog|jogging|gym|workout|work out|training|hike|hiking|yoga|cycling|climb|climbing)\b/, band: [1, 1], target: 1, strict: true },
  { kind: "formal_event", pattern: /\b(gala|black[- ]tie|wedding|ball|opera|formal|ceremony)\b/, band: [4, 5], target: 5, strict: true },
  { kind: "business", pattern: /\b(client|clients|interview|board|presentation|pitch|conference)\b/, band: [4, 4], target: 4, strict: true },
  { kind: "home", pattern: /\b(from home|wfh|at home|lounging|lounge)\b/, band: [1, 2], target: 2, strict: false },
  { kind: "office", pattern: /\b(office|workday|work day|work|meeting|meetings)\b/, band: [3, 4], target: 3, strict: false },
  { kind: "date", pattern: /\bdate\b/, band: [2, 4], target: 3, strict: false },
  { kind: "dinner", pattern: /\b(dinner|restaurant|drinks|cocktails?|brunch|supper)\b/, band: [2, 4], target: 3, strict: false },
  { kind: "hangout", pattern: /\b(hang|hanging|hangout|friends|after school|casual|weekend|park|beach)\b/, band: [2, 3], target: 2, strict: false },
];

/** A lifestyle's usual formality. More specific phrases first. */
const LIFESTYLE_FORMALITY: [RegExp, number][] = [
  [/\b(business casual|smart casual|elevated casual)\b/, 3],
  [/\bathleisure\b/, 2],
  [/\b(athletic|active|sport|sporty)\b/, 1],
  [/\b(professional|corporate|business)\b/, 4],
  [/\b(formal|dressy)\b/, 5],
  [/\b(casual|street|relaxed|laid[- ]back)\b/, 2],
];

const RAIN = /\b(rain|rainy|drizzle|shower|showers|storm|storms|thunderstorms?|thunder)\b/i;
const SNOW = /\b(snow|snowy|sleet|blizzard|flurries)\b/i;
const WIND = /\b(wind|windy|gust|gusty|gale)\b/i;
const SUN = /\b(clear|sunny|sun)\b/i;

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const clamp = (n: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, n));

/** True when the stated age range includes anyone under 18 (e.g. "15-18"). */
export function includesMinor(ageRange: string | undefined): boolean {
  const lower = ageRange?.match(/\d+/)?.[0];
  return lower !== undefined && Number(lower) < 18;
}

/** Fit words the engine can act on. A stated fit maps to the first of these it contains. */
export const FIT_TERMS = ["relaxed", "oversized", "loose", "regular", "slim", "fitted", "tailored", "structured", "wide", "cropped", "straight", "boxy", "flowing"] as const;

/** The fit term a stated fit names, or null when it names none ("not too tight"). */
export function recognizeFit(phrase: string): string | null {
  const p = normalize(phrase);
  return FIT_TERMS.find((t) => new RegExp(`\\b${t}\\b`).test(p)) ?? null;
}

/** A stated color the engine may use in garment names: a short plain phrase ("coral", "forest green"). */
export const isColorTerm = (phrase: string) => /^[a-z][a-z' -]{1,29}$/.test(normalize(phrase));

/** Aesthetics whose slug, title or preference terms equal the phrase. */
export function matchAesthetics(phrase: string, store: KnowledgeStore): string[] {
  const p = normalize(phrase);
  return store
    .query({ types: ["aesthetic_reference"], statuses: ["approved", "provisional"], includeExpired: true })
    .filter(({ evidence: e }) => {
      const terms = [e.aesthetics[0]!, e.aesthetics[0]!.replace(/-/g, " "), e.title.toLowerCase(), ...(e.profile?.preferenceTerms ?? [])];
      return terms.includes(p);
    })
    .map((h) => h.evidence.aesthetics[0]!);
}

const slugify = (city: string) =>
  city
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// =============================================================================
// Interpreter
// =============================================================================

export interface InterpretOptions {
  /** YYYY-MM-DD; selects season and evidence freshness. */
  asOf: string;
  /** Knowledge region slug; defaults to a slug of the city. */
  region?: string;
}

export function interpretContext(context: RecommendationContext, store: KnowledgeStore, options: InterpretOptions): InterpretedContext {
  const { weather, demographics, preferences } = context;
  const occasion = normalize(context.occasion);
  const lifestyle = normalize(context.lifestyle);
  const season = seasonFor(options.asOf);
  const region = options.region ?? slugify(context.city);

  const rule = OCCASION_RULES.find((r) => r.pattern.test(occasion));
  const band: [number, number] = rule?.band ?? [2, 4];
  const lifestyleFormality = LIFESTYLE_FORMALITY.find(([p]) => p.test(lifestyle))?.[1];
  const targetFormality = clamp(lifestyleFormality ?? rule?.target ?? 3, band);

  const temperatureC = weather.temperatureC;
  const climate = climateBand(temperatureC);
  const condition = weather.condition;
  const precipitation: ContextSignals["precipitation"] = SNOW.test(condition)
    ? "snow"
    : RAIN.test(condition) || weather.precipitationLikely
      ? "rain"
      : "none";
  const windy = WIND.test(condition);
  const sunny = SUN.test(condition) && (climate === "hot" || climate === "warm");
  const minor = includesMinor(demographics?.ageRange);

  // Stated values the engine acts on must be recognizable; anything else stays in the request data only.
  const statedColors = (preferences?.preferredColors ?? []).map(normalize);
  const preferredColors = statedColors.filter(isColorTerm);
  const unusableColors = statedColors.filter((c) => !isColorTerm(c));
  const statedFit = preferences?.fit ? normalize(preferences.fit) : null;
  const avoidedColors = (preferences?.avoidedColors ?? []).map(normalize);

  const preferredAesthetics: string[] = [];
  const unmatchedPreferences: string[] = [];
  for (const phrase of preferences?.preferredAesthetics ?? []) {
    const matches = matchAesthetics(phrase, store);
    if (matches.length === 0) unmatchedPreferences.push(normalize(phrase));
    for (const m of matches) if (!preferredAesthetics.includes(m)) preferredAesthetics.push(m);
  }
  const lifestyleAesthetics = matchAesthetics(lifestyle, store);

  const signals: ContextSignals = {
    occasionKind: rule?.kind ?? "unrecognized",
    formalityBand: band,
    targetFormality,
    strictFormality: rule?.strict ?? false,
    temperatureC,
    climate,
    season,
    region,
    city: context.city,
    precipitation,
    windy,
    sunny,
    minor,
    genderExpression: demographics?.genderExpression ?? null,
    ageRange: demographics?.ageRange ?? null,
    preferredColors,
    avoidedColors,
    fit: statedFit ? recognizeFit(statedFit) : null,
    comfortPriority: preferences?.comfortPriority ? normalize(preferences.comfortPriority) : null,
    preferredAesthetics,
    unmatchedPreferences,
    lifestyleAesthetics,
  };

  // --- Hard constraints -------------------------------------------------------
  const constraints: HardConstraint[] = [];
  const add = (code: HardConstraint["code"], text: string) => constraints.push({ code, text });
  const [lo, hi] = band;
  add("formality", `Formality ${lo === hi ? lo : `${lo}–${hi}`} on a 1–5 scale for the occasion (${signals.occasionKind}), aiming at ${targetFormality}`);
  if (precipitation === "snow") add("snow_protection", "Snow: insulated, water-resistant outer layer and footwear with grip");
  if (precipitation === "rain") add("rain_protection", "Rain likely: water-resistant outer layer and footwear");
  if (climate === "cold") add("insulation", `Cold (${temperatureC}°C): insulating layers and warm outerwear`);
  if (climate === "cool") add("warm_layer", `Cool (${temperatureC}°C): a warm mid-weight layer`);
  if (climate === "mild") add("light_layer", `Mild (${temperatureC}°C): a light removable layer`);
  if (climate === "warm" || climate === "hot") add("breathable", `${climate === "hot" ? "Hot" : "Warm"} (${temperatureC}°C): breathable, lightweight fabrics`);
  if (windy) add("wind_protection", "Wind: a closed, wind-resistant outer layer");
  if (sunny) add("sun_protection", "Sun: shade for the head or eyes and light colors");
  if (signals.occasionKind === "athletic") add("performance", "Athletic activity: technical, moisture-wicking garments and performance footwear");
  if (avoidedColors.length > 0) add("avoid_colors", `Avoid these colors entirely: ${avoidedColors.join(", ")}`);
  if (minor) add("minor_safe", "Wearer may be under 18: age-appropriate styling, no revealing or sexualized framing");

  // --- Explicit preferences ---------------------------------------------------
  const explicitPreferences: string[] = [`Lifestyle: ${lifestyle}`];
  if (lifestyleFormality !== undefined && (lifestyleFormality < lo || lifestyleFormality > hi)) {
    explicitPreferences.push(
      `The everyday lifestyle (formality ${lifestyleFormality}) sits outside the occasion's range; the occasion wins, aiming at ${targetFormality}`
    );
  }
  if (preferredColors.length > 0) explicitPreferences.push(`Preferred colors: ${preferredColors.join(", ")}`);
  if (unusableColors.length > 0) explicitPreferences.push(`Preferred colors not used as color names: ${unusableColors.join(", ")}`);
  if (signals.fit) explicitPreferences.push(`Fit: ${signals.fit}`);
  if (signals.comfortPriority) explicitPreferences.push(`Comfort: ${signals.comfortPriority}`);
  for (const phrase of preferences?.preferredAesthetics ?? []) {
    const matches = matchAesthetics(phrase, store);
    explicitPreferences.push(
      matches.length > 0 ? `Aesthetic preference "${normalize(phrase)}" → ${matches.join(", ")}` : `Aesthetic preference "${normalize(phrase)}" (no defined aesthetic matches)`
    );
  }

  // --- Opportunities and unknowns ----------------------------------------------
  const inferredOpportunities = [`Season: ${season} (northern hemisphere, by date)`, `Climate band: ${climate} (${temperatureC}°C, ${condition.toLowerCase()})`];
  if (lifestyleAesthetics.length > 0) inferredOpportunities.push(`Lifestyle points toward: ${lifestyleAesthetics.join(", ")}`);
  if (climate === "cool" || climate === "mild" || climate === "cold") inferredOpportunities.push("Layering can add texture contrast as well as warmth");
  if (signals.occasionKind === "home") inferredOpportunities.push("Working or staying home: comfortable layers with a presentable top");

  const unknowns: string[] = [];
  if (!signals.genderExpression) unknowns.push("Gender expression not stated: keep every direction open to any expression");
  if (!signals.ageRange) unknowns.push("Age range not stated");
  if (statedColors.length === 0 && avoidedColors.length === 0) unknowns.push("No color preferences stated");
  if (!statedFit) unknowns.push("Preferred fit not stated");
  else if (!signals.fit) unknowns.push("Stated fit names no recognized fit term; it is kept as stated in the request");
  if ((preferences?.preferredAesthetics ?? []).length === 0) unknowns.push("No aesthetic preference stated");
  if (!rule) unknowns.push(`Occasion not recognized: assuming formality ${band[0]}–${band[1]}`);
  if (lifestyleFormality === undefined) unknowns.push("Lifestyle formality not recognized");

  // --- Evidence -----------------------------------------------------------------
  const hits = store.query({ asOf: options.asOf, regions: [region], season });
  const relevantEvidenceIds = hits.map((h) => h.evidence.id);
  const knowledgeGaps: string[] = [];
  if (!hits.some((h) => h.evidence.type === "regional_influence")) knowledgeGaps.push(`No regional evidence for ${region}: no city-specific style claims`);
  if (!hits.some((h) => h.evidence.type === "contemporary_observation")) knowledgeGaps.push(`No current contemporary evidence for ${season}: no trend claims`);
  if (!hits.some((h) => h.evidence.editorialStatus === "approved")) knowledgeGaps.push("All evidence is provisional (not yet editor-approved)");

  return {
    hardConstraints: constraints.map((c) => c.text),
    explicitPreferences,
    inferredOpportunities,
    unknowns,
    relevantEvidenceIds,
    constraints,
    signals,
    knowledgeGaps,
  };
}
