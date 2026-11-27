/**
 * Knowledge Freshness
 *
 * Two independent questions:
 *
 * - validity: is a time-sensitive claim still current? Contemporary
 *   observations (and regional records that set validUntil) expire. Durable
 *   knowledge (timeless principles, aesthetic references) never expires.
 * - review: is the record due for routine editorial review? Review-due
 *   records stay usable; the flag asks an editor to take another look.
 */

import { DURABLE_TYPES, type EvidenceType, type FashionEvidence } from "./schema";

/** Days after editorialReview.lastReviewedAt before routine review is due. */
export const REVIEW_INTERVAL_DAYS: Record<EvidenceType, number> = {
  timeless_principle: 365,
  aesthetic_reference: 365,
  regional_influence: 180,
  contemporary_observation: 90,
};

export type Validity = "current" | "expired" | "not_yet_valid";
export type ReviewState = "current" | "review_due";

export interface Freshness {
  timeSensitive: boolean;
  validity: Validity;
  review: ReviewState;
  lastReviewedAt: string;
  reviewDueOn: string;
  validFrom?: string;
  validUntil?: string;
}

const DAY_MS = 86_400_000;
const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toDate = (t: number) => new Date(t).toISOString().slice(0, 10);

export function isTimeSensitive(evidence: FashionEvidence): boolean {
  if (DURABLE_TYPES.includes(evidence.type)) return false;
  return evidence.type === "contemporary_observation" || Boolean(evidence.validUntil);
}

/** Freshness of one record on a given date (YYYY-MM-DD). */
export function assessFreshness(evidence: FashionEvidence, asOf: string): Freshness {
  const now = toTime(asOf);
  const lastReviewedAt = evidence.editorialReview.lastReviewedAt;
  const reviewDueOn = toDate(toTime(lastReviewedAt) + REVIEW_INTERVAL_DAYS[evidence.type] * DAY_MS);

  let validity: Validity = "current";
  if (evidence.validFrom && now < toTime(evidence.validFrom)) validity = "not_yet_valid";
  else if (evidence.validUntil && now > toTime(evidence.validUntil)) validity = "expired";

  return {
    timeSensitive: isTimeSensitive(evidence),
    validity,
    review: now > toTime(reviewDueOn) ? "review_due" : "current",
    lastReviewedAt,
    reviewDueOn,
    validFrom: evidence.validFrom,
    validUntil: evidence.validUntil,
  };
}
