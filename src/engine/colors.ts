/**
 * Color families (Phase 4 rubric)
 *
 * A small editorial table that sorts color names into neutral or accent and
 * warm or cool, so the rubric can apply the corpus's color principles
 * (tp-neutral-base-one-accent, tp-color-temperature) to garment colors.
 * Assumption: the table is Aura editorial judgment, uncalibrated, and
 * versioned with the rubric (EVALUATOR_VERSION in quality.ts). Names it does
 * not know are "unclassified" and never penalized.
 */

export type ColorRole = "neutral" | "accent" | "unclassified";
export type ColorTemperature = "warm" | "cool" | "unknown";

export interface ColorClass {
  role: ColorRole;
  temperature: ColorTemperature;
}

const TABLE: [string, ColorRole, ColorTemperature][] = [
  // Cool neutrals
  ["black", "neutral", "cool"], ["white", "neutral", "cool"], ["optic white", "neutral", "cool"], ["grey", "neutral", "cool"], ["gray", "neutral", "cool"],
  ["charcoal", "neutral", "cool"], ["navy", "neutral", "cool"], ["stone", "neutral", "cool"], ["ink blue", "neutral", "cool"], ["indigo", "neutral", "cool"],
  ["silver", "neutral", "cool"], ["slate", "neutral", "cool"], ["denim", "neutral", "cool"],
  // Warm neutrals
  ["cream", "neutral", "warm"], ["ecru", "neutral", "warm"], ["ivory", "neutral", "warm"], ["camel", "neutral", "warm"], ["khaki", "neutral", "warm"],
  ["brown", "neutral", "warm"], ["chocolate", "neutral", "warm"], ["tan", "neutral", "warm"], ["sand", "neutral", "warm"], ["taupe", "neutral", "warm"],
  ["beige", "neutral", "warm"], ["natural linen", "neutral", "warm"], ["oatmeal", "neutral", "warm"], ["olive", "neutral", "warm"], ["cognac", "neutral", "warm"],
  // Warm accents
  ["rust", "accent", "warm"], ["burgundy", "accent", "warm"], ["terracotta", "accent", "warm"], ["ochre", "accent", "warm"], ["mustard", "accent", "warm"],
  ["coral", "accent", "warm"], ["red", "accent", "warm"], ["orange", "accent", "warm"], ["blush", "accent", "warm"], ["pink", "accent", "warm"],
  ["gold", "accent", "warm"], ["yellow", "accent", "warm"],
  // Cool accents
  ["green", "accent", "cool"], ["sage", "accent", "cool"], ["emerald", "accent", "cool"], ["cobalt", "accent", "cool"], ["blue", "accent", "cool"],
  ["lavender", "accent", "cool"], ["fuchsia", "accent", "cool"], ["teal", "accent", "cool"], ["purple", "accent", "cool"], ["lilac", "accent", "cool"],
];

// Longest names first, so "ink blue" wins over "blue" and "natural linen" over nothing.
const ORDERED = [...TABLE].sort((a, b) => b[0].length - a[0].length);

/** Classifies a color name by the longest table entry it contains as whole words. */
export function classifyColor(color: string): ColorClass {
  const c = color.toLowerCase();
  for (const [name, role, temperature] of ORDERED) {
    if (new RegExp(`\\b${name}\\b`).test(c)) return { role, temperature };
  }
  return { role: "unclassified", temperature: "unknown" };
}
