/**
 * Concept Collection Validator (Phase 2)
 *
 * Deterministic, structural checks on three concept drafts. They catch
 * missing roles, uncited or invented evidence, avoided colors, weather
 * constraints left unaddressed, generic theses, near-duplicate concepts and
 * claims the knowledge store cannot support. Keyword checks are heuristics:
 * passing them shows a concept addresses each requirement in words, not that
 * it is good. Aesthetic quality and the editorial rubric belong to Phase 4.
 */

import type { ConstraintCode, ConceptDraft, ConceptRole, CollectionValidation, DirectionAssignment, InterpretedContext, ValidationIssue } from "./types";
import { ROLES } from "./types";

/** Concepts more similar than this (token Jaccard) are not meaningfully different. */
export const MAX_PAIR_SIMILARITY = 0.45;

// Patterns name the remedy, not the weather, so restating the forecast ("rainy", "windy") never counts.
const WATER = /\b(water[- ]?(resistant|repellent|proof)|waterproof|raincoat|rain (jacket|shell|coat|boots?)|trench|waxed|shell|treated|rubber\w*|gore-tex)\b/;

/** Every pattern must match somewhere in the concept for the constraint to count as addressed. */
const CONSTRAINT_PATTERNS: Partial<Record<ConstraintCode, RegExp[]>> = {
  rain_protection: [WATER],
  snow_protection: [WATER, /\b(boots?|grip|tread|lug\w*)\b/],
  insulation: [/\b(insulat\w*|down|padded|quilted|wool|cashmere|shearling|fleece|thermal|puffer|heavyweight|lined|merino)\b/],
  warm_layer: [/\b(knit\w*|sweater|cardigan|wool|merino|fleece|overshirt|jacket|layer\w*|cashmere|flannel|corduroy|quilted)\b/],
  light_layer: [/\b(layer\w*|jacket|cardigan|overshirt|blazer|knit\w*|wrap|shawl|trench|coat)\b/],
  breathable: [/\b(linen|cotton|breathab\w*|lightweight|airy|open[- ]weave|seersucker|poplin|voile|silk|mesh|wicking|gauze|chambray|jersey)\b/],
  wind_protection: [/\b(wind[- ]?(resistant|proof)|windbreaker|wind-cheating|shell|nylon|waxed|zip\w*|closed|dense|tightly woven|leather|storm flap)\b/],
  sun_protection: [/\b(sun ?hats?|sunglasses|hats?|caps?|brim\w*|shade|uv|spf)\b/],
  performance: [/\b(technical|performance|wicking|moisture|stretch|running (shoes|tights|shorts|jacket|layer))\b/],
};

export const MINOR_UNSAFE = /\b(sexy|sultry|seductive|sheer|see[- ]through|plunging|low[- ]cut|bodycon|cut[- ]?outs?|lingerie|corset\w*|micro[- ]?mini|backless|bralette|revealing)\b/;
export const TREND_CLAIM = /\b(trend\w*|on-trend|viral|it[- ](bag|girl|piece)|runways?|catwalk|this season'?s?|of the moment|currently popular|everyone is wearing|must[- ]have)\b/;
export const LOCAL_CLAIM = /\b(locals|local (style|fashion|uniform|taste|dress\w*)|parisians?|londoners?|new yorkers?|angelenos?|milanese|chicagoans?|bostonians?|seattleites?|portlanders?|austinites?|nashvillians?|atlantans?|miamians?|denverites?|san franciscans?)\b/;

/** Words that sound like taste but carry no direction. */
export const HOLLOW = new Set([
  "stylish", "chic", "trendy", "perfect", "perfectly", "elegant", "effortless", "effortlessly", "timeless", "fashionable",
  "sophisticated", "flattering", "beautiful", "gorgeous", "iconic", "versatile", "cool", "fresh", "modern", "amazing",
  "stunning", "sleek", "classy", "fabulous", "great", "nice", "polished", "elevated",
]);

/** Concrete vocabulary: a thesis must name at least one garment, shape or material. */
const CONCRETE = /\b(trousers?|pants|jeans|denim|chinos?|shorts|skirts?|dress(es)?|jackets?|coats?|blazers?|knits?|knitwear|sweaters?|cardigans?|shirts?|tees?|t-shirts?|hoodies?|sweatshirts?|tops?|blouses?|overshirts?|suits?|layers?|boots?|sneakers?|loafers?|sandals?|shoes|heels|flats|scarf|scarves|hats?|bags?|leggings|joggers|outerwear|trench|parka|puffer|wool|cashmere|linen|cotton|silk|leather|suede|tweed|corduroy|canvas|jersey|fleece|nylon|velvet|lace|chiffon|crochet|silhouettes?|proportions?|volume|wide|cropped|tailor\w*|oversized|longline|cocoon|maxi|structured|fluid|flowing|boxy|print\w*|pattern\w*|texture\w*|tonal|monochrome|palette|colou?rs?)\b/;

const STOPWORDS = new Set([
  "the", "and", "with", "for", "that", "this", "from", "into", "onto", "over", "under", "its", "it's", "are", "was", "but", "not",
  "one", "two", "three", "keep", "lets", "let", "while", "where", "which", "what", "when", "your", "their", "them", "then", "than",
  "such", "each", "every", "more", "most", "less", "very", "also", "here", "there", "both", "only", "own", "same", "other", "out",
  "about", "through", "rather", "like", "look", "looks", "wear", "worn", "wearing", "piece", "pieces", "outfit",
]);

export const words = (text: string) => text.toLowerCase().match(/[a-z][a-z'-]*/g) ?? [];
const contentTokens = (text: string) => new Set(words(text).filter((w) => w.length >= 3 && !STOPWORDS.has(w)));

function jaccard(a: Set<string>, b: Set<string>): number {
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return Math.round((shared / union.size) * 1000) / 1000;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const allText = (d: ConceptDraft) =>
  [d.title, d.aestheticThesis, d.silhouetteDirection, d.proportionDirection, d.paletteDirection, d.materialDirection, ...d.definingDetails, d.contextRationale]
    .join("\n")
    .toLowerCase();

/** Fields that describe the look itself (the rationale may explain an avoidance, so it is excluded). */
const LOOK_FIELDS = ["title", "aestheticThesis", "silhouetteDirection", "proportionDirection", "paletteDirection", "materialDirection", "definingDetails"] as const;

/** Text used for distinctness: what the look is, not the shared weather and context reasoning. */
const identityText = (d: ConceptDraft) =>
  [d.title, d.aestheticThesis, d.silhouetteDirection, d.proportionDirection, d.paletteDirection, ...d.definingDetails].join(" ");

/** A city- or region-authority claim ("Parisian", "locals", "<city> style"), checked when there is no regional evidence. */
export function makesLocalClaim(text: string, city: string): boolean {
  const cityClaim = new RegExp(`\\b${escapeRegex(city.toLowerCase())}('s)?\\s+(\\w+\\s+)?(style|fashion|dressers?|dressing|chic|uniform|aesthetic|crowd|wardrobe|sensibility)\\b`);
  return LOCAL_CLAIM.test(text) || cityClaim.test(text);
}

export interface ValidationInput {
  interpreted: InterpretedContext;
  assignments: DirectionAssignment[];
  /** Evidence ids the writer was given. */
  providedEvidenceIds: string[];
  /** Whether the provided evidence includes regional / contemporary records. */
  hasRegionalEvidence: boolean;
  hasContemporaryEvidence: boolean;
}

export function genericThesisReason(thesis: string): string | null {
  const w = words(thesis);
  if (w.length < 8) return "fewer than 8 words";
  if (!CONCRETE.test(thesis.toLowerCase())) return "names no garment, shape or material";
  const hollow = w.filter((x) => HOLLOW.has(x)).length;
  if (hollow >= 3 || hollow / w.length > 0.2) return "relies on generic praise words";
  return null;
}

export function validateCollection(drafts: ConceptDraft[], input: ValidationInput): CollectionValidation {
  const issues: ValidationIssue[] = [];
  const { interpreted, assignments } = input;
  const s = interpreted.signals;
  const provided = new Set(input.providedEvidenceIds);

  // Roles and aesthetics.
  for (const role of ROLES) {
    const count = drafts.filter((d) => d.role === role).length;
    if (count !== 1) issues.push({ code: "role_coverage", role, message: `expected one ${role} concept, found ${count}` });
  }

  for (const d of drafts) {
    const role = d.role;
    const assignment = assignments.find((a) => a.role === role);
    if (assignment && d.aesthetic !== assignment.aesthetic) {
      issues.push({ code: "aesthetic_mismatch", role, field: "aesthetic", message: `${role} should be ${assignment.aesthetic}, got ${d.aesthetic}` });
    }

    // Evidence: only what was provided, and always the aesthetic's own record.
    for (const id of d.evidenceIds) {
      if (!provided.has(id)) issues.push({ code: "evidence_not_provided", role, field: "evidenceIds", message: `${id} was not in the evidence provided` });
    }
    if (assignment && !d.evidenceIds.includes(assignment.evidenceId)) {
      issues.push({ code: "evidence_missing_reference", role, field: "evidenceIds", message: `does not cite ${assignment.evidenceId}` });
    }

    // Avoided colors never appear in the look.
    for (const color of s.avoidedColors) {
      const pattern = new RegExp(`\\b${escapeRegex(color)}\\b`, "i");
      for (const field of LOOK_FIELDS) {
        const value = d[field];
        const text = Array.isArray(value) ? value.join(" ") : value;
        if (pattern.test(text)) issues.push({ code: "avoided_color", role, field, constraint: "avoid_colors", message: `${field} mentions avoided color "${color}"` });
      }
    }

    // Specific thesis and directions.
    const generic = genericThesisReason(d.aestheticThesis);
    if (generic) issues.push({ code: "generic_thesis", role, field: "aestheticThesis", message: `thesis is generic: ${generic}` });
    for (const field of ["silhouetteDirection", "proportionDirection", "paletteDirection", "materialDirection"] as const) {
      if (words(d[field]).length < 4) issues.push({ code: "vague_direction", role, field, message: `${field} is too short to direct anything` });
    }

    // Hard constraints addressed in words.
    const text = allText(d);
    for (const c of interpreted.constraints) {
      const patterns = CONSTRAINT_PATTERNS[c.code];
      if (patterns && !patterns.every((p) => p.test(text))) {
        issues.push({ code: "missing_constraint", role, constraint: c.code, message: `does not address: ${c.text}` });
      }
    }

    // Claims the knowledge store cannot support.
    if (!input.hasContemporaryEvidence && TREND_CLAIM.test(text)) {
      issues.push({ code: "unsupported_claim", role, message: "makes a trend claim without contemporary evidence" });
    }
    if (!input.hasRegionalEvidence && makesLocalClaim(text, s.city)) {
      issues.push({ code: "unsupported_claim", role, message: "makes a city or regional style claim without regional evidence" });
    }

    if (s.minor && MINOR_UNSAFE.test(text)) issues.push({ code: "minor_safety", role, constraint: "minor_safe", message: "uses styling language unsuitable for a minor" });
  }

  // Pairwise distinctness.
  const similarity: CollectionValidation["similarity"] = [];
  const byRole = (r: ConceptRole) => drafts.find((d) => d.role === r);
  for (const [a, b] of [["best_bet", "adjacent"], ["best_bet", "exploration"], ["adjacent", "exploration"]] as [ConceptRole, ConceptRole][]) {
    const da = byRole(a);
    const db = byRole(b);
    if (!da || !db) continue;
    const j = jaccard(contentTokens(identityText(da)), contentTokens(identityText(db)));
    similarity.push({ a, b, jaccard: j });
    if (j > MAX_PAIR_SIMILARITY) issues.push({ code: "not_distinct", role: b, message: `${a} and ${b} overlap too much (${j})` });
  }

  return { passed: issues.length === 0, issues, similarity };
}
