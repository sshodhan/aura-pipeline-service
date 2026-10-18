/**
 * Garment helpers (Phase 3)
 *
 * Shared by the template outfit writer and the outfit validator, so the
 * template is built to pass exactly the checks the validator applies:
 * weather patterns, the occasion blocklist, and the vocabulary coverage rule.
 */

import { CLIMATE_BANDS, type AestheticProfile, type ClimateBand, type GarmentOption } from "../knowledge/schema";

/** Remedy vocabulary per weather need. Patterns name the remedy, never the weather itself. */
export const GARMENT_PATTERNS = {
  water: /\b(water[- ]?(resistant|repellent|proof)|waterproof|raincoat|rain (jacket|shell|coat)|trench|mac|waxed|oiled|shell|anorak|treated|rubber\w*|gore-tex|bonded)\b/,
  insulating: /\b(insulat\w*|down|padded|quilted|wool|cashmere|shearling|fleece\w*|thermal|puffer|duffle|overcoat|blanket coat|wrap coat)\b/,
  wind: /\b(wind[- ]?(resistant|proof)|windbreaker|shell|nylon|waxed|oiled|anorak|trench|mac|gabardine|leather|suede|bomber|overcoat|duffle|zip\w*)\b/,
  sunShade: /\b(sun ?hats?|sunglasses|hats?|caps?|brim\w*|visor)\b/,
  rainFootwear: /\b(water[- ]?(resistant|proof|repellent)|waterproof|rubber\w*|treated|patent|boots?|lug\w*|gore-tex|duck)\b/,
  snowFootwear: /\bboots?\b/,
  athleticFootwear: /\b(running|trail|trainers?|runners?)\b/,
  technical: /\b(technical|performance|wicking|moisture|stretch|merino|ripstop|running|mesh)\b/,
  /** Too heavy for warm or hot weather (light wool and suede shoes are fine). */
  heavy: /\b(tweed|corduroy|fleece\w*|shearling|down|puffer|quilted|mohair|velvet|cashmere|heavyweight|cable[- ]knit|flannel|boucle|overcoat|duffle|blanket|chunky)\b/,
  breathable: /\b(linen|cotton|breathab\w*|lightweight|airy|open[- ]weave|seersucker|poplin|voile|silk|mesh|gauze|chambray|jersey|crepe|tropical wool|technical)\b/,
} as const;

/** Too casual for formal events and business occasions. */
export const TOO_CASUAL = /\b(hoodie|sweatshirt|joggers?|track pants|sweatpants|leggings|cargo|flip[- ]flops?|slides|graphic tee|shorts|running (shoes|tights|shorts)|trainers?|beanie|baseball cap)\b/;
/** Also too casual for formal events. */
export const NOT_FORMAL = /\b(sneakers?|high-tops|tee|t-shirt|denim|jeans|canvas|anorak|puffer)\b/;

/**
 * The keyless template never picks these, so it makes no gendered default.
 * They stay in the vocabulary as data for the model writer, which uses them
 * only when consistent with a stated gender expression.
 */
export const TEMPLATE_EXCLUDED = /\b(skirt|dress|gown|blouse|slip|heels?|pumps?|ballet flats?|mary janes?|bralette)\b/;

export const garmentText = (g: { type: string; material: string; name?: string; details?: string }) =>
  [g.name ?? "", g.type, g.material, g.details ?? ""].join(" ").toLowerCase();

export const templateUsable = (g: GarmentOption) => g.category !== "dress" && !TEMPLATE_EXCLUDED.test(g.type);

const covers = (g: GarmentOption, climate: ClimateBand, formality: number) =>
  g.climates.includes(climate) && g.formality[0] <= formality && formality <= g.formality[1];

/**
 * What the template needs from an aesthetic's vocabulary so it can dress every
 * climate and formality level the profile claims:
 * - a base top, a bottom and footwear for each claimed climate × formality;
 * - an insulating outer layer for cold and cool at each formality;
 * - for cold, an outer layer that is both insulating and rain-capable (snow, cold rain);
 * - a rain-capable outer layer somewhere, and rain-capable footwear in every claimed climate;
 * - for cold, boots that handle rain (snow);
 * - for warm and hot, a shade accessory.
 * Returns the gaps (empty when covered).
 */
export function garmentCoverageGaps(profile: AestheticProfile): string[] {
  const garments = (profile.garments ?? []).filter(templateUsable);
  if (garments.length === 0) return ["no garments"];
  const gaps: string[] = [];
  const [lo, hi] = profile.formality;
  for (const climate of profile.climates) {
    for (let f = lo; f <= hi; f++) {
      const has = (pred: (g: GarmentOption) => boolean) => garments.some((g) => covers(g, climate, f) && pred(g));
      if (!has((g) => g.category === "top" && g.layer !== "mid" && g.layer !== "outer")) gaps.push(`${climate} f${f}: base top`);
      if (!has((g) => g.category === "bottom")) gaps.push(`${climate} f${f}: bottom`);
      if (!has((g) => g.category === "footwear")) gaps.push(`${climate} f${f}: footwear`);
      if ((climate === "cold" || climate === "cool") && !has((g) => g.category === "outerwear" && g.layer === "outer" && (g.protects ?? []).includes("cold"))) {
        gaps.push(`${climate} f${f}: insulating outer layer`);
      }
    }
    if (climate === "cold" && !garments.some((g) => g.category === "outerwear" && (g.protects ?? []).includes("rain") && (g.protects ?? []).includes("cold"))) {
      gaps.push("cold: insulating, rain-capable outer layer");
    }
    if (!garments.some((g) => g.category === "footwear" && g.climates.includes(climate) && (g.protects ?? []).includes("rain"))) {
      gaps.push(`${climate}: rain-capable footwear`);
    }
    if (climate === "cold" && !garments.some((g) => g.category === "footwear" && GARMENT_PATTERNS.snowFootwear.test(g.type) && (g.protects ?? []).includes("rain"))) {
      gaps.push("cold: boots for snow");
    }
    if ((climate === "warm" || climate === "hot") && !garments.some((g) => g.category === "accessory" && g.climates.includes(climate) && (g.protects ?? []).includes("sun"))) {
      gaps.push(`${climate}: shade accessory`);
    }
  }
  if (!garments.some((g) => g.category === "outerwear" && (g.protects ?? []).includes("rain"))) gaps.push("rain-capable outer layer");
  return gaps;
}

/** Distance in bands between a garment's climates and the current one (0 = suited). */
export function climateDistance(g: GarmentOption, climate: ClimateBand): number {
  const band = CLIMATE_BANDS.indexOf(climate);
  return Math.min(...g.climates.map((c) => Math.abs(CLIMATE_BANDS.indexOf(c) - band)));
}
