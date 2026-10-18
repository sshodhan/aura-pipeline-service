/**
 * Outfit Composition: contracts (Phase 3)
 *
 * Turns each StyleConcept into a complete garment specification that a
 * downstream image model can depict without reinterpreting, and that a
 * consumer adapter can map to its OutfitSuggestion (see
 * docs/CONSUMER_INTEGRATION_CONTRACT.md §A8 and docs/OUTFIT_COMPOSITION.md).
 *
 * Pure and key-free.
 */

import { z } from "zod";

import { GARMENT_CATEGORIES, GARMENT_LAYERS } from "../knowledge/schema";
import type { CollectionQuality, CurationDiagnostics, QualityAssessment } from "./curate";
import type { CollectionDiagnostics, CollectionValidation, ConceptRole, ConstraintCode, DirectionSelection, InterpretedContext, StyleConcept } from "./types";
import { ROLES } from "./types";

export const RECOMMEND_ENGINE_VERSION = "recommend-0.2";
export const RECOMMENDATION_SCHEMA_VERSION = "1.0";

/** Garments per outfit: footwear plus a top and bottom (or a dress) at minimum. */
export const MIN_GARMENTS = 3;
export const MAX_GARMENTS = 7;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const evidenceId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export const garmentDraftSchema = z
  .object({
    category: z.enum(GARMENT_CATEGORIES),
    /** Layering position for tops and outerwear; null for bottoms, footwear and accessories. */
    layer: z.enum(GARMENT_LAYERS).nullable(),
    /** Garment type without color ("wool wide-leg trousers"). */
    type: text(3, 60),
    /** Short display name: color word + type, no period (the consumer shows text before the first "."). */
    name: text(3, 80),
    color: text(3, 40),
    material: text(3, 60),
    fit: text(3, 40),
    silhouette: text(3, 60),
    details: text(3, 160).optional(),
    /** Why this garment is in the look (maps to the consumer's per-garment *Why). */
    why: text(10, 240),
  })
  .strict();
export type GarmentDraft = z.infer<typeof garmentDraftSchema>;

export const outfitDraftSchema = z
  .object({
    role: z.enum(ROLES),
    aesthetic: z.string().min(1).max(60),
    title: text(3, 80),
    garments: z.array(garmentDraftSchema).min(MIN_GARMENTS).max(MAX_GARMENTS),
    /** Layering order, and what comes off when it warms up or moves indoors. */
    layering: text(10, 400),
    proportionStrategy: text(10, 400),
    colorStrategy: text(10, 400),
    textureStrategy: text(10, 400),
    /** Concise editorial rationale (maps to the consumer's styleReasoning). */
    stylingRationale: text(20, 600),
    /** How the outfit handles the weather (maps to weatherStory). */
    weatherNotes: text(10, 400),
    proTip: text(10, 300),
    evidenceIds: z.array(evidenceId).min(1).max(16),
  })
  .strict();
export type OutfitDraft = z.infer<typeof outfitDraftSchema>;

export const outfitDraftsSchema = z.object({ outfits: z.array(outfitDraftSchema).length(3) }).strict();

export interface GarmentSpec extends GarmentDraft {
  id: string;
}

export interface OutfitSpec extends Omit<OutfitDraft, "garments"> {
  id: string;
  conceptId: string;
  garments: GarmentSpec[];
  knowledgeVersion: string;
}

// =============================================================================
// Validation
// =============================================================================

export const OUTFIT_ISSUE_CODES = [
  "outfit_coverage",
  "aesthetic_mismatch",
  "incomplete_outfit",
  "missing_outer_layer",
  "missing_constraint",
  "occasion_mismatch",
  "avoided_color",
  "name_format",
  "generic_why",
  "fit_not_honored",
  "not_distinct_garments",
  "evidence_not_provided",
  "unsupported_claim",
  "minor_safety",
] as const;
export type OutfitIssueCode = (typeof OUTFIT_ISSUE_CODES)[number];

/** `message` may quote request or model text; revision prompts use only code, role, field and category. */
export interface OutfitIssue {
  code: OutfitIssueCode;
  role?: ConceptRole;
  field?: keyof OutfitDraft | keyof GarmentDraft;
  category?: GarmentDraft["category"];
  constraint?: ConstraintCode;
  message: string;
}

export interface OutfitValidation {
  passed: boolean;
  issues: OutfitIssue[];
  /** Core slots (top or dress, bottom, outerwear, footwear) whose garment type differs, per pair. */
  differingCoreSlots: { a: ConceptRole; b: ConceptRole; slots: number }[];
}

// =============================================================================
// Collection
// =============================================================================

export interface Recommendation {
  role: ConceptRole;
  concept: StyleConcept;
  outfit: OutfitSpec;
  /** Phase 4 rubric assessment; absent when curation is off. */
  quality?: QualityAssessment;
}

export type RecommendationStatus = "ok" | "fallback" | "invalid_request" | "insufficient_knowledge";

export interface RecommendationCollection {
  schemaVersion: typeof RECOMMENDATION_SCHEMA_VERSION;
  engineVersion: typeof RECOMMEND_ENGINE_VERSION;
  /** The concept stage's engine version (src/engine/types.ts). */
  conceptEngineVersion: string;
  status: RecommendationStatus;
  requestId: string | null;
  contextFingerprint: string | null;
  knowledgeVersion: string;
  asOf: string;
  interpreted: InterpretedContext | null;
  selection: Omit<DirectionSelection, "candidates"> | null;
  recommendations: Recommendation[];
  validation: { concepts: CollectionValidation | null; outfits: OutfitValidation | null };
  /** Phase 4 rubric scores and curation decisions; null when curation is off or nothing was composed. */
  quality: CollectionQuality | null;
  errors: string[];
  diagnostics: {
    concepts: CollectionDiagnostics;
    outfits: CollectionDiagnostics | null;
    curation: CurationDiagnostics | null;
    totalModelCalls: number;
    latencyMs: number;
  };
}
