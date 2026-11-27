/**
 * Style Direction Engine: contracts (Phase 2)
 *
 * Shapes follow the design's InterpretedContext and StyleConcept contracts
 * (docs/FASHION_INTELLIGENCE_DESIGN.md), with the additions documented in
 * docs/STYLE_DIRECTIONS.md: a concept also names its `aesthetic` and gives a
 * separate `proportionDirection`, and the interpreted context carries the
 * structured signals the planner and validator use.
 *
 * Pure and key-free: no config, network or model calls.
 */

import { z } from "zod";

import type { ClimateBand, KnowledgeSeason } from "../knowledge/schema";

export const ENGINE_VERSION = "concepts-0.1";
export const COLLECTION_SCHEMA_VERSION = "1.0";

export const ROLES = ["best_bet", "adjacent", "exploration"] as const;
export type ConceptRole = (typeof ROLES)[number];

// =============================================================================
// Interpreted context
// =============================================================================

/** Hard constraints the validator can check. Each maps to a requirement on every concept. */
export const CONSTRAINT_CODES = [
  "formality",
  "rain_protection",
  "snow_protection",
  "insulation",
  "warm_layer",
  "light_layer",
  "breathable",
  "wind_protection",
  "sun_protection",
  "performance",
  "avoid_colors",
  "minor_safe",
] as const;
export type ConstraintCode = (typeof CONSTRAINT_CODES)[number];

export interface HardConstraint {
  code: ConstraintCode;
  text: string;
}

export type OccasionKind =
  | "athletic"
  | "formal_event"
  | "business"
  | "home"
  | "office"
  | "date"
  | "dinner"
  | "errands"
  | "hangout"
  | "unrecognized";

/** Structured signals derived from the request. User-supplied strings stay data. */
export interface ContextSignals {
  occasionKind: OccasionKind;
  /** Acceptable formality for the occasion, 1 athletic/lounge … 5 formal. */
  formalityBand: [number, number];
  /** Where in the band to aim: the lifestyle's usual formality, clamped to the band. */
  targetFormality: number;
  /** Strict occasions allow no formality stretch (athletic, formal events, business). */
  strictFormality: boolean;
  temperatureC: number;
  climate: ClimateBand;
  season: KnowledgeSeason;
  region: string;
  city: string;
  precipitation: "none" | "rain" | "snow";
  windy: boolean;
  sunny: boolean;
  minor: boolean;
  genderExpression: string | null;
  ageRange: string | null;
  preferredColors: string[];
  avoidedColors: string[];
  fit: string | null;
  comfortPriority: string | null;
  /** Aesthetics matching the stated aesthetic preferences (phrases in the order stated; several matches for one phrase in store order). */
  preferredAesthetics: string[];
  /** Stated preferences that match no defined aesthetic (kept, not guessed). */
  unmatchedPreferences: string[];
  /** Aesthetics whose preference terms match the stated lifestyle. */
  lifestyleAesthetics: string[];
}

/** The design's InterpretedContext, plus structured signals and knowledge gaps. */
export interface InterpretedContext {
  hardConstraints: string[];
  explicitPreferences: string[];
  inferredOpportunities: string[];
  unknowns: string[];
  relevantEvidenceIds: string[];
  constraints: HardConstraint[];
  signals: ContextSignals;
  /** What the knowledge store cannot support for this context (stated, never filled in). */
  knowledgeGaps: string[];
}

// =============================================================================
// Direction selection
// =============================================================================

export interface AestheticCandidate {
  aesthetic: string;
  evidenceId: string;
  title: string;
  eligible: boolean;
  /** 0–1 context fit (formality, climate, lifestyle). Not a quality score. */
  fit: number;
  preferred: boolean;
  lifestyleMatch: boolean;
  /** Why the candidate scored as it did, or why it is ineligible. */
  reasons: string[];
}

export interface DirectionAssignment {
  role: ConceptRole;
  aesthetic: string;
  /** The aesthetic_reference record id. */
  evidenceId: string;
  title: string;
  fit: number;
  reasons: string[];
}

export interface DirectionSelection {
  status: "ok" | "insufficient_candidates";
  assignments: DirectionAssignment[];
  /** Pairwise attribute distance (0 identical … 1 unrelated) between the chosen aesthetics. */
  distances: { a: ConceptRole; b: ConceptRole; distance: number }[];
  candidates: AestheticCandidate[];
  notes: string[];
}

// =============================================================================
// Concepts
// =============================================================================

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const evidenceId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/** What a writer produces for one role, before the engine adds ids and versions. */
export const conceptDraftSchema = z
  .object({
    role: z.enum(ROLES),
    aesthetic: z.string().min(1).max(60),
    title: text(3, 80),
    aestheticThesis: text(20, 400),
    silhouetteDirection: text(10, 400),
    proportionDirection: text(10, 400),
    paletteDirection: text(10, 400),
    materialDirection: text(10, 400),
    definingDetails: z.array(text(3, 160)).min(2).max(5),
    contextRationale: text(20, 600),
    evidenceIds: z.array(evidenceId).min(1).max(12),
  })
  .strict();
export type ConceptDraft = z.infer<typeof conceptDraftSchema>;

export const conceptDraftsSchema = z.object({ concepts: z.array(conceptDraftSchema).length(3) }).strict();

/** The design's StyleConcept plus `aesthetic` and `proportionDirection`. */
export interface StyleConcept extends ConceptDraft {
  id: string;
  knowledgeVersion: string;
}

// =============================================================================
// Validation
// =============================================================================

export const ISSUE_CODES = [
  "role_coverage",
  "aesthetic_mismatch",
  "evidence_not_provided",
  "evidence_missing_reference",
  "avoided_color",
  "generic_thesis",
  "vague_direction",
  "missing_constraint",
  "not_distinct",
  "unsupported_claim",
  "minor_safety",
] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];

/**
 * A validation problem. `message` may quote request or model text, so it is
 * for people and logs; revision prompts use only `code`, `role` and `field`.
 */
export interface ValidationIssue {
  code: IssueCode;
  role?: ConceptRole;
  field?: keyof ConceptDraft;
  constraint?: ConstraintCode;
  message: string;
}

export interface CollectionValidation {
  passed: boolean;
  issues: ValidationIssue[];
  /** Token-overlap similarity (0–1) between each pair of concepts. */
  similarity: { a: ConceptRole; b: ConceptRole; jaccard: number }[];
}

// =============================================================================
// Collection
// =============================================================================

export type GenerationMode = "template" | "model" | "template_fallback";

export interface WriterAttempt {
  call: number; // 0-based model call within the request
  purpose: "draft" | "revision";
  latencyMs: number;
  outcome: "ok" | "provider_error" | "parse_error" | "schema_error" | "validation_failed";
  error?: string;
  /** Validation issue codes (concept or outfit stage). */
  issueCodes?: string[];
  usage?: { promptTokens?: number; outputTokens?: number; totalTokens?: number };
}

export interface CollectionDiagnostics {
  generationMode: GenerationMode;
  modelId: string | null;
  modelCalls: number;
  revisions: number;
  maxModelCalls: number;
  budgetExhausted: boolean;
  attempts: WriterAttempt[];
  /** Summed over attempts when the provider reports usage; null otherwise. */
  tokens: { prompt: number; output: number; total: number } | null;
  latencyMs: number;
  evidenceProvided: string[];
}

export type CollectionStatus = "ok" | "fallback" | "invalid_request" | "insufficient_knowledge";

export interface ConceptCollection {
  schemaVersion: typeof COLLECTION_SCHEMA_VERSION;
  engineVersion: typeof ENGINE_VERSION;
  status: CollectionStatus;
  requestId: string | null;
  contextFingerprint: string | null;
  knowledgeVersion: string;
  asOf: string;
  interpreted: InterpretedContext | null;
  selection: Omit<DirectionSelection, "candidates"> | null;
  concepts: StyleConcept[];
  validation: CollectionValidation | null;
  /** Request problems (invalid_request) or why planning stopped. */
  errors: string[];
  diagnostics: CollectionDiagnostics;
}
