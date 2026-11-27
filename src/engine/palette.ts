/**
 * Shared template helpers (Phase 2 concepts and Phase 3 outfits)
 *
 * The keyless template writers for concepts and outfits must agree on
 * colors and wording, so the rules live here once.
 */

import type { AestheticProfile } from "../knowledge/schema";
import type { ContextSignals, OccasionKind } from "./types";

export const OCCASION_LABEL: Record<OccasionKind, string> = {
  athletic: "the activity",
  formal_event: "a formal event",
  business: "a business day",
  home: "a day at home",
  office: "an office day",
  date: "a date",
  dinner: "dinner",
  errands: "errands",
  hangout: "a casual hangout",
  unrecognized: "this occasion",
};

export const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** True when the text contains any term as a whole word (case-insensitive). */
export const mentionsAny = (text: string, terms: string[]) =>
  terms.some((t) => new RegExp(`\\b${escapeRegex(t)}\\b`, "i").test(text));

export interface TemplatePalette {
  /** The aesthetic's palette minus anything avoided, in profile order. */
  base: string[];
  /** Stated preferred colors that are not avoided and not already in the base. */
  accents: string[];
}

/** An aesthetic's palette adjusted for the person's avoided and preferred colors. */
export function composePalette(profile: AestheticProfile, signals: Pick<ContextSignals, "avoidedColors" | "preferredColors">): TemplatePalette {
  const avoided = signals.avoidedColors;
  const base = profile.palette.filter((c) => !mentionsAny(c, avoided) && !avoided.some((a) => c.includes(a)));
  const accents = signals.preferredColors.filter((c) => !mentionsAny(c, avoided) && !base.includes(c));
  return { base, accents };
}
