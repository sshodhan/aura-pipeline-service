/**
 * Fashion Knowledge Schema
 *
 * Based on the evidence contract in docs/FASHION_INTELLIGENCE_DESIGN.md, with
 * three questions kept apart (see docs/FASHION_KNOWLEDGE.md):
 *
 * - basis: where the claim comes from (Aura's own judgment, an external
 *   observation, or a measurement).
 * - sourceCheck: whether an external claim was confirmed against the source
 *   it cites. Only meaningful for external observations and measurements.
 * - editorialStatus / editorialReview: whether a human editor approved the
 *   record for use. Approval never implies the claim was externally verified.
 *
 * The design contract's single "verified" status maps to editorialStatus
 * "approved" here; external verification is recorded in sourceCheck.
 */

import { z } from "zod";

// =============================================================================
// Vocabularies
// =============================================================================

export const EVIDENCE_TYPES = [
  "timeless_principle",
  "contemporary_observation",
  "regional_influence",
  "aesthetic_reference",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

/** Durable types describe lasting knowledge: they become due for review but never expire. */
export const DURABLE_TYPES: readonly EvidenceType[] = ["timeless_principle", "aesthetic_reference"];

/** Editorial lifecycle: proposed → approved by a human editor → retired. */
export const EDITORIAL_STATUSES = ["provisional", "approved", "historical"] as const;
export type EditorialStatus = (typeof EDITORIAL_STATUSES)[number];

export const EVIDENCE_BASES = ["editorial_judgment", "external_observation", "measured"] as const;
export type EvidenceBasis = (typeof EVIDENCE_BASES)[number];

export const SOURCE_CHECK_STATUSES = ["checked_against_source", "not_checked"] as const;
export const SOURCE_CHECK_METHODS = ["full_page_read", "dataset_query", "excerpt_only"] as const;

export const SEASONS = ["spring", "summer", "fall", "winter"] as const;
export type KnowledgeSeason = (typeof SEASONS)[number];

/** Matches the pipeline's OutfitItem categories (src/models/outfit.ts). */
export const GARMENT_CATEGORIES = ["top", "bottom", "dress", "outerwear", "footwear", "accessory"] as const;

export const SOURCE_KINDS = ["aura_editorial", "publication", "brand", "dataset", "legacy_unsourced"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** Region slug for evidence that applies everywhere. */
export const GLOBAL_REGION = "global";

/** Contemporary observations must expire within this window. */
export const MAX_CONTEMPORARY_VALIDITY_DAYS = 366;

// =============================================================================
// Text hygiene (supplemental only)
// =============================================================================

/**
 * Cheap screen for obviously instruction-like text. This is hygiene, not a
 * security boundary: it misses paraphrases and other languages. The boundary
 * is that consumers treat evidence as untrusted data (src/knowledge/boundary.ts).
 */
const INSTRUCTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget)\b[^.]{0,40}\b(instructions?|prompts?|rules)\b/i,
  /\bsystem prompt\b/i,
  /\byou are (now )?(an? |the )?(ai|assistant|chatbot|language model|llm)\b/i,
  /<\/?(system|assistant|user|instructions?)>/i,
  /\b(respond|reply|answer) (only )?(with|in)\b/i,
  /```/,
];

export function findInstructionLikeText(text: string): string | null {
  const hit = INSTRUCTION_PATTERNS.find((p) => p.test(text));
  return hit ? hit.source : null;
}

const plainText = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .refine((t) => !/https?:\/\//i.test(t), "URLs belong in provenance, not in text")
    .refine((t) => findInstructionLikeText(t) === null, "Instruction-like text is not allowed in evidence");

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase-hyphenated slug");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const term = z.string().min(1).max(60).regex(/^[a-z0-9][a-z0-9 '&/-]*$/, "lowercase term");

// =============================================================================
// Sources
// =============================================================================

export const sourceSchema = z
  .object({
    id: slug,
    name: z.string().min(1).max(120),
    kind: z.enum(SOURCE_KINDS),
    url: z.string().url().optional(),
    /** How the source may be used (paraphrase only, licensing, caveats). */
    usageNote: z.string().min(1).max(400),
  })
  .strict();
export type KnowledgeSource = z.infer<typeof sourceSchema>;

// =============================================================================
// Evidence
// =============================================================================

export const provenanceSchema = z
  .object({
    sourceId: slug,
    sourceUrl: z.string().url().optional(),
    publishedAt: isoDate.optional(),
    /** When the source was read for this record. */
    accessedAt: isoDate.optional(),
  })
  .strict();

/** Was the claim confirmed against the content of the source it cites? */
export const sourceCheckSchema = z
  .object({
    status: z.enum(SOURCE_CHECK_STATUSES),
    checkedAt: isoDate.optional(),
    method: z.enum(SOURCE_CHECK_METHODS).optional(),
    note: z.string().max(300).optional(),
  })
  .strict()
  .refine((c) => c.status !== "checked_against_source" || (c.checkedAt && c.method), {
    message: "a source check needs checkedAt and method",
  });

/** Human editorial review. Approval is separate from source verification. */
export const editorialReviewSchema = z
  .object({
    /** Last time the record's content was written or reviewed. */
    lastReviewedAt: isoDate,
    reviewedBy: z.string().min(1).max(80),
    approvedBy: z.string().min(1).max(80).optional(),
    approvedAt: isoDate.optional(),
  })
  .strict();

export const measurementSchema = z
  .object({
    metric: z.string().min(1).max(80),
    value: z.number(),
    unit: z.string().max(20).optional(),
    method: z.string().min(1).max(300),
    sourceId: slug,
    measuredAt: isoDate,
  })
  .strict();

const daysBetween = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;

export const evidenceSchema = z
  .object({
    id: slug,
    type: z.enum(EVIDENCE_TYPES),
    title: plainText(3, 80),
    summary: plainText(20, 600),
    basis: z.enum(EVIDENCE_BASES),
    aesthetics: z.array(slug),
    garmentCategories: z.array(z.enum(GARMENT_CATEGORIES)),
    silhouettes: z.array(term),
    materials: z.array(term),
    regions: z.array(slug).min(1),
    relevantSeasons: z.array(z.enum(SEASONS)).min(1),
    provenance: z.array(provenanceSchema).min(1),
    sourceCheck: sourceCheckSchema.optional(),
    editorialStatus: z.enum(EDITORIAL_STATUSES),
    editorialReview: editorialReviewSchema,
    validFrom: isoDate.optional(),
    validUntil: isoDate.optional(),
    measurement: measurementSchema.optional(),
    /** Release in which this record was added or last changed (see snapshot releases). */
    knowledgeVersion: z.string().min(1),
  })
  .strict()
  .superRefine((e, ctx) => {
    const issue = (message: string, path: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] });

    // Basis vs measurement and source checks.
    if (e.measurement && e.basis !== "measured") issue("measurement is only allowed when basis is 'measured'", "measurement");
    if (e.basis === "measured" && !e.measurement) issue("measured evidence must include a measurement", "measurement");
    if (e.basis === "editorial_judgment" && e.sourceCheck) issue("editorial judgment has no external source to check", "sourceCheck");
    if (e.basis !== "editorial_judgment" && !e.sourceCheck) issue("external observations and measurements need a sourceCheck", "sourceCheck");

    // Editorial approval.
    const approved = e.editorialStatus === "approved";
    if (approved && !(e.editorialReview.approvedBy && e.editorialReview.approvedAt)) {
      issue("approved records need approvedBy and approvedAt", "editorialReview");
    }
    if (!approved && (e.editorialReview.approvedBy || e.editorialReview.approvedAt)) {
      issue("only approved records carry approvedBy/approvedAt", "editorialReview");
    }
    if (approved && e.basis !== "editorial_judgment" && e.sourceCheck?.status !== "checked_against_source") {
      issue("an external claim can only be approved after it is checked against its source", "editorialStatus");
    }

    // Validity windows.
    if (e.validFrom && e.validUntil && daysBetween(e.validFrom, e.validUntil) <= 0) {
      issue("validUntil must be after validFrom", "validUntil");
    }
    if (DURABLE_TYPES.includes(e.type) && e.validUntil) {
      issue(`${e.type} records do not expire; use editorial review instead of validUntil`, "validUntil");
    }
    if (e.type === "contemporary_observation") {
      if (!e.validFrom || !e.validUntil) issue("contemporary observations need validFrom and validUntil", "validUntil");
      else if (daysBetween(e.validFrom, e.validUntil) > MAX_CONTEMPORARY_VALIDITY_DAYS) {
        issue(`contemporary observations expire within ${MAX_CONTEMPORARY_VALIDITY_DAYS} days`, "validUntil");
      }
      if (e.basis === "editorial_judgment") issue("contemporary observations must be observed or measured", "basis");
    }

    // Scope.
    if (e.type === "regional_influence" && e.regions.includes(GLOBAL_REGION)) issue("regional influences must name specific regions", "regions");
    if (e.type === "aesthetic_reference" && e.aesthetics.length !== 1) issue("an aesthetic reference defines exactly one aesthetic", "aesthetics");
  });
export type FashionEvidence = z.infer<typeof evidenceSchema>;

// =============================================================================
// Snapshot manifest (release ledger)
// =============================================================================

export const releaseSchema = z
  .object({
    version: z.string().regex(/^fashion-\d{4}-\d{2}\.\d+$/, "fashion-YYYY-MM.N"),
    /** Canonical content hash of sources + evidence at release (see store.computeContentHash). */
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    releasedAt: isoDate,
    notes: z.string().min(1).max(400),
  })
  .strict();

export const snapshotSchema = z
  .object({
    /** Current release; always the last entry of releases. */
    knowledgeVersion: z.string().min(1),
    /** Append-only release ledger, oldest first. */
    releases: z.array(releaseSchema).min(1),
    /** Informational counts for the current content. */
    counts: z.record(z.enum(EVIDENCE_TYPES), z.number().int().min(0)),
  })
  .strict()
  .refine((s) => s.releases[s.releases.length - 1]!.version === s.knowledgeVersion, {
    message: "knowledgeVersion must be the latest release",
    path: ["knowledgeVersion"],
  });
export type KnowledgeSnapshot = z.infer<typeof snapshotSchema>;
export type KnowledgeRelease = z.infer<typeof releaseSchema>;
