/**
 * Fixture expectations → checks.
 *
 * Every benchmark scenario lists, in plain English, what any good answer must
 * satisfy (fixtures/scenarios/*.json, expectedConstraints). This module maps
 * each line to a deterministic check on the final recommendation collection
 * where one exists, and marks the rest "manual": polish, comfort, expression
 * and gender-appropriate garments need a person.
 *
 * Rules are tried in order; the first whose pattern matches the line decides.
 */

import type { Scenario } from "../baseline/fixtures";
import { GARMENT_PATTERNS as P, NOT_FORMAL, TOO_CASUAL, garmentText } from "../engine/garments";
import type { OutfitSpec, RecommendationCollection } from "../engine/outfit-types";
import { MINOR_UNSAFE } from "../engine/validate";
import type { CheckStatus } from "./types";

export interface ExpectationResult {
  expectation: string;
  status: Exclude<CheckStatus, "skipped">;
  rule: string;
  detail?: string;
}

type Verdict = { ok: boolean; detail?: string };
interface Rule {
  name: string;
  pattern: RegExp;
  check?: (c: RecommendationCollection, line: string) => Verdict;
}

const outfits = (c: RecommendationCollection) => c.recommendations.map((r) => r.outfit);
const outers = (o: OutfitSpec) => o.garments.filter((g) => g.category === "outerwear" && g.layer === "outer");
const footwear = (o: OutfitSpec) => o.garments.filter((g) => g.category === "footwear");
const allText = (o: OutfitSpec) => o.garments.map(garmentText).join(" ");

/** Passes when every outfit passes; the detail names the roles that fail. */
const every = (c: RecommendationCollection, pred: (o: OutfitSpec) => boolean, what: string): Verdict => {
  const failing = outfits(c).filter((o) => !pred(o)).map((o) => o.role);
  return failing.length === 0 ? { ok: true } : { ok: false, detail: `${what}: fails for ${failing.join(", ")}` };
};

const RULES: Rule[] = [
  {
    name: "no-gender-assumptions",
    pattern: /no gendered assumptions/i,
    check: (c) => {
      const stated = c.interpreted?.signals.genderExpression;
      const skirts = outfits(c).some((o) => o.garments.some((g) => g.category === "dress" || /\b(skirt|gown|blouse)\b/.test(g.type)));
      return { ok: !stated && !skirts, detail: stated ? "a gender expression was inferred" : skirts ? "uses gendered garments with no stated expression" : undefined };
    },
  },
  { name: "gender-expression", pattern: /gender expression/i },
  {
    name: "avoided-colors",
    pattern: /^no\s+(.+?)(\s+garments)?$/i,
    check: (c, line) => {
      const colors = line.replace(/^no\s+/i, "").replace(/\s+garments$/i, "").split(/\s*(?:,|\bor\b|\band\b)\s*/i).map((x) => x.trim().toLowerCase()).filter(Boolean);
      return every(c, (o) => !colors.some((col) => o.garments.some((g) => new RegExp(`\\b${col}\\b`, "i").test(`${g.color} ${g.name}`))), `avoided ${colors.join("/")}`);
    },
  },
  {
    name: "uses-colors",
    pattern: /^uses\s+(.+)$/i,
    check: (c, line) => {
      const colors = line.replace(/^uses\s+/i, "").split(/\s*(?:,|\bor\b|\band\b)\s*/i).map((x) => x.trim().toLowerCase()).filter(Boolean);
      return every(c, (o) => o.garments.some((g) => colors.includes(g.color.toLowerCase())), `uses ${colors.join("/")}`);
    },
  },
  {
    name: "distinct-directions",
    pattern: /meaningfully different|three .*different/i,
    check: (c) => {
      const aesthetics = new Set(c.recommendations.map((r) => r.concept.aesthetic));
      const slots = c.validation.outfits?.differingCoreSlots ?? [];
      return { ok: aesthetics.size === 3 && slots.every((s) => s.slots >= 2), detail: `${aesthetics.size} aesthetics; differing core garments ${slots.map((s) => s.slots).join("/")}` };
    },
  },
  {
    name: "technical-or-performance",
    pattern: /technical|performance/i,
    check: (c) => every(c, (o) => P.athleticFootwear.test(footwear(o).map(garmentText).join(" ")) && P.technical.test(allText(o)), "running footwear and technical fabric"),
  },
  {
    name: "rain",
    pattern: /water|rain/i,
    check: (c) =>
      every(c, (o) => P.water.test(outers(o).map(garmentText).join(" ")) && P.rainFootwear.test(footwear(o).map(garmentText).join(" ")), "water-resistant outer layer and rain-capable footwear"),
  },
  { name: "snow-footwear", pattern: /snow/i, check: (c) => every(c, (o) => P.snowFootwear.test(footwear(o).map(garmentText).join(" ")), "boots") },
  {
    name: "warmth",
    pattern: /insulated|warm (enough|outerwear)/i,
    check: (c) => {
      const t = c.interpreted?.signals.temperatureC ?? 99;
      return t < 5
        ? every(c, (o) => P.insulating.test(outers(o).map(garmentText).join(" ")), `insulating outer layer at ${t}°C`)
        : every(c, (o) => o.garments.some((g) => g.layer === "mid" || g.layer === "outer"), `a warm layer at ${t}°C`);
    },
  },
  { name: "wind", pattern: /wind/i, check: (c) => every(c, (o) => P.wind.test(outers(o).map(garmentText).join(" ")), "wind-resistant outer layer") },
  {
    name: "heat",
    pattern: /breathable|heat-appropriate|lightweight construction/i,
    check: (c) =>
      every(
        c,
        (o) =>
          !o.garments.some((g) => g.category !== "footwear" && g.category !== "accessory" && P.heavy.test(garmentText(g))) &&
          o.garments.some((g) => (g.category === "top" || g.category === "bottom" || g.category === "dress") && P.breathable.test(garmentText(g))),
        "breathable and nothing heavy"
      ),
  },
  { name: "sun", pattern: /\bsun\b|sun-/i, check: (c) => every(c, (o) => o.garments.some((g) => g.category === "accessory" && P.sunShade.test(garmentText(g))), "hat or sunglasses") },
  { name: "layers", pattern: /layer/i, check: (c) => every(c, (o) => o.garments.some((g) => g.layer === "mid" || g.layer === "outer"), "a mid or outer layer") },
  {
    name: "formal",
    pattern: /formal attire|wedding|gala/i,
    check: (c) => {
      const band = c.interpreted?.signals.formalityBand ?? [0, 0];
      const v = every(c, (o) => !TOO_CASUAL.test(allText(o)) && !NOT_FORMAL.test(allText(o)), "nothing casual");
      return band[0] >= 4 ? v : { ok: false, detail: `formality band ${band.join("–")} is not formal` };
    },
  },
  {
    name: "office-or-business",
    pattern: /office|business/i,
    check: (c) => {
      const band = c.interpreted?.signals.formalityBand ?? [0, 0];
      const v = every(c, (o) => !TOO_CASUAL.test(allText(o)), "nothing too casual");
      return band[1] >= 3 ? v : { ok: false, detail: `formality band ${band.join("–")} is below office formality` };
    },
  },
  {
    name: "casual-formality",
    pattern: /casual formality/i,
    check: (c) => {
      const band = c.interpreted?.signals.formalityBand ?? [9, 9];
      return { ok: band[1] <= 3, detail: `formality band ${band.join("–")}` };
    },
  },
  {
    name: "fit-honored",
    pattern: /fit honored/i,
    check: (c, line) => {
      const fit = line.toLowerCase().replace(/\s*fit honored.*$/, "").trim();
      return every(c, (o) => o.garments.some((g) => g.fit.toLowerCase().includes(fit)), `${fit} fit`);
    },
  },
  {
    name: "age-appropriate",
    pattern: /age-appropriate|teen/i,
    check: (c) => ({
      ok: Boolean(c.interpreted?.signals.minor) && outfits(c).every((o) => !MINOR_UNSAFE.test(`${allText(o)} ${o.stylingRationale}`)),
      detail: c.interpreted?.signals.minor ? undefined : "minor constraint not detected",
    }),
  },
  { name: "walkable-footwear", pattern: /practical footwear/i, check: (c) => every(c, (o) => !/\b(heels?|pumps?|stilettos?)\b/.test(footwear(o).map(garmentText).join(" ")), "no heels") },
  {
    name: "stated-aesthetic",
    pattern: /\b(romantic|minimal|creative)\b/i,
    check: (c) => {
      const preferred = c.interpreted?.signals.preferredAesthetics ?? [];
      const best = c.recommendations[0]?.concept.aesthetic;
      return { ok: Boolean(best && preferred.includes(best)), detail: `best bet ${best}; stated preferences map to ${preferred.join(", ") || "nothing"}` };
    },
  },
];

export function checkExpectations(scenario: Scenario, collection: RecommendationCollection): ExpectationResult[] {
  return scenario.expectedConstraints.map((expectation) => {
    const rule = RULES.find((r) => r.pattern.test(expectation));
    if (!rule) return { expectation, status: "manual", rule: "none", detail: "no deterministic check: needs a person" };
    if (!rule.check) return { expectation, status: "manual", rule: rule.name, detail: "needs a person" };
    if (collection.recommendations.length === 0) return { expectation, status: "fail", rule: rule.name, detail: `no recommendations (${collection.status})` };
    const v = rule.check(collection, expectation);
    return { expectation, status: v.ok ? "pass" : "fail", rule: rule.name, detail: v.detail };
  });
}
