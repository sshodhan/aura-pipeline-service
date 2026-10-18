/**
 * Consumer adapter feasibility (contract test, not product code).
 *
 * The consumer app's OutfitSuggestion needs four non-empty garment strings
 * (baseLayer, lowerBody, outerwear, footwear), each with a color word and a
 * short name before any "." (docs/CONSUMER_INTEGRATION_CONTRACT.md §A8.1).
 * The adapter itself is the consumer's to build (§A8.5). This check maps each
 * outfit the way §A8.5 describes and counts the looks that would hit the open
 * questions in §A9, so they are measured rather than guessed.
 */

import type { OutfitSpec } from "../engine/outfit-types";

export interface AdapterFeasibility {
  role: string;
  /** All four required slots fill directly from the outfit. */
  mapsDirectly: boolean;
  dressOnly: boolean;
  noOuterLayer: boolean;
  /** Accessories with no consumer slot (only hat, sunglasses and bracelet have one). */
  unslottedAccessories: string[];
  /** Garment names a consumer card could not show (no color word, or a period). */
  badNames: string[];
}

const SLOTTED = /\b(hat|cap|sunglasses|bracelet)\b/;

export function adapterFeasibility(outfit: OutfitSpec): AdapterFeasibility {
  const g = outfit.garments;
  const top = g.find((x) => x.category === "dress") ?? g.find((x) => x.category === "top" && x.layer !== "mid");
  const bottom = g.find((x) => x.category === "bottom");
  const outer = g.find((x) => x.category === "outerwear" && x.layer === "outer") ?? g.find((x) => x.layer === "mid");
  const foot = g.find((x) => x.category === "footwear");
  const dressOnly = g.some((x) => x.category === "dress") && !bottom;
  return {
    role: outfit.role,
    mapsDirectly: Boolean(top && bottom && outer && foot),
    dressOnly,
    noOuterLayer: !outer,
    unslottedAccessories: g.filter((x) => x.category === "accessory" && !SLOTTED.test(x.type)).map((x) => x.type),
    badNames: g.filter((x) => !x.name.toLowerCase().includes(x.color.toLowerCase()) || x.name.includes(".")).map((x) => x.name),
  };
}
