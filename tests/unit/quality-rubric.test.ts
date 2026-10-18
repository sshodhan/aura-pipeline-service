import { describe, expect, it } from "vitest";

import { classifyColor } from "../../src/engine/colors";
import type { OutfitDraft } from "../../src/engine/outfit-types";
import { QUALITY_DIMENSIONS, scoreCollection, type QualityIssueCode, type RubricResult } from "../../src/engine/quality";
import type { InterpretedContext } from "../../src/engine/types";
import { scenario, scenarios, store, templateOutfitJson } from "./engine-helpers";

async function fixture(id = "nyc-casual-hangout-cool") {
  const { outfits, collection } = await templateOutfitJson(scenario(id));
  return { drafts: outfits as OutfitDraft[], interpreted: collection.interpreted! };
}

const score = (drafts: OutfitDraft[], interpreted: InterpretedContext) => scoreCollection({ outfits: drafts, interpreted, store });
const codes = (r: RubricResult) => r.issues.map((i) => i.code);
const replace = (drafts: OutfitDraft[], i: number, change: (d: OutfitDraft) => OutfitDraft) => drafts.map((d, j) => (j === i ? change(d) : d));
const recolor = (d: OutfitDraft, colors: string[]) => ({ ...d, garments: d.garments.map((g, i) => ({ ...g, color: colors[i] ?? "pewter" })) });

describe("color families", () => {
  it("classifies by the longest whole-word match and leaves unknown names unclassified", () => {
    expect(classifyColor("ink blue")).toEqual({ role: "neutral", temperature: "cool" });
    expect(classifyColor("dusty blue")).toEqual({ role: "accent", temperature: "cool" });
    expect(classifyColor("Camel")).toEqual({ role: "neutral", temperature: "warm" });
    expect(classifyColor("pewter")).toEqual({ role: "unclassified", temperature: "unknown" });
    expect(classifyColor("redwood")).toEqual({ role: "unclassified", temperature: "unknown" });
  });
});

describe("rubric over the template fixtures", () => {
  it("gives every outfit four integer scores from 1 to 5, each with reasons", async () => {
    for (const s of scenarios) {
      const { drafts, interpreted } = await fixture(s.id);
      for (const r of score(drafts, interpreted)) {
        for (const d of QUALITY_DIMENSIONS) {
          expect(Number.isInteger(r.scores[d]) && r.scores[d] >= 1 && r.scores[d] <= 5, `${s.id} ${r.role} ${d}`).toBe(true);
          expect(r.reasons[d].length, `${s.id} ${r.role} ${d}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("is deterministic", async () => {
    const { drafts, interpreted } = await fixture("boston-dinner-cold");
    expect(score(drafts, interpreted)).toEqual(score(drafts, interpreted));
  });
});

describe("composition", () => {
  it("penalizes more accents than a restrained aesthetic carries", async () => {
    const { drafts, interpreted } = await fixture();
    const loud = replace(drafts, 0, (d) => recolor({ ...d, aesthetic: "quiet-luxury" }, ["rust", "cobalt", "emerald", "black"]));
    const calm = replace(drafts, 0, (d) => recolor({ ...d, aesthetic: "quiet-luxury" }, ["rust", "navy", "grey", "black"]));
    const [l] = score(loud, interpreted);
    const [c] = score(calm, interpreted);
    expect(codes(l!)).toContain("too_many_accents");
    expect(codes(c!)).not.toContain("too_many_accents");
    expect(l!.scores.composition).toBeLessThan(c!.scores.composition);
    // An expressive aesthetic carries the same three accents without penalty.
    const [x] = score(replace(drafts, 0, (d) => recolor({ ...d, aesthetic: "eclectic-maximalist" }, ["rust", "cobalt", "emerald", "black"])), interpreted);
    expect(codes(x!)).not.toContain("too_many_accents");
  });

  it("flags warm and cool neutrals competing with neither leading", async () => {
    const { drafts, interpreted } = await fixture();
    const [clash] = score(replace(drafts, 0, (d) => recolor(d, ["cream", "grey", "camel", "navy"])), interpreted);
    const [led] = score(replace(drafts, 0, (d) => recolor(d, ["cream", "camel", "tan", "navy"])), interpreted);
    expect(codes(clash!)).toContain("neutral_temperature_clash");
    expect(codes(led!)).not.toContain("neutral_temperature_clash");
  });

  it("flags two full halves unless the aesthetic is built on volume", async () => {
    const { drafts, interpreted } = await fixture();
    const full = (d: OutfitDraft, aesthetic: string): OutfitDraft => ({
      ...d,
      aesthetic,
      garments: d.garments.map((g) => (g.category === "top" && g.layer !== "mid") || g.category === "bottom" ? { ...g, fit: "oversized" } : g),
    });
    const [tailored] = score(replace(drafts, 0, (d) => full(d, "quiet-luxury")), interpreted);
    const [street] = score(replace(drafts, 0, (d) => full(d, "streetwear")), interpreted);
    expect(codes(tailored!)).toContain("proportion_unbalanced");
    expect(codes(street!)).not.toContain("proportion_unbalanced");
  });

  it("flags a single material family", async () => {
    const { drafts, interpreted } = await fixture();
    const wool = replace(drafts, 0, (d) => ({ ...d, garments: d.garments.map((g) => (g.category === "footwear" || g.category === "accessory" ? g : { ...g, material: "merino wool" })) }));
    const [r] = score(wool, interpreted);
    expect(codes(r!)).toContain("single_texture");
  });
});

describe("contextual relevance", () => {
  it("flags garments outside the target formality", async () => {
    const { drafts, interpreted } = await fixture();
    const formal = { ...interpreted, signals: { ...interpreted.signals, targetFormality: 5 } };
    const r = score(drafts, formal);
    expect(r.some((x) => codes(x).includes("formality_drift"))).toBe(true);
    expect(Math.min(...r.map((x) => x.scores.contextualRelevance))).toBeLessThan(Math.min(...score(drafts, interpreted).map((x) => x.scores.contextualRelevance)));
  });

  it("flags garments meant for other weather", async () => {
    const { drafts, interpreted } = await fixture("nyc-work-cold-rain");
    const hot = { ...interpreted, signals: { ...interpreted.signals, climate: "hot" as const } };
    expect(score(drafts, hot).every((x) => codes(x).includes("climate_drift"))).toBe(true);
  });

  it("flags a preferred color that is never used", async () => {
    const { drafts, interpreted } = await fixture();
    const prefers = { ...interpreted, signals: { ...interpreted.signals, preferredColors: ["chartreuse"] } };
    expect(score(drafts, prefers).every((x) => codes(x).includes("preferred_colors_unused"))).toBe(true);
    const [used] = score(replace(drafts, 0, (d) => recolor(d, ["chartreuse", "black", "grey", "black"])), prefers);
    expect(codes(used!)).not.toContain("preferred_colors_unused");
  });
});

describe("distinctiveness", () => {
  it("scores near-duplicates low and flags shared colors", async () => {
    const { drafts, interpreted } = await fixture();
    const copy = replace(drafts, 1, (d) => ({ ...drafts[0]!, role: d.role, aesthetic: d.aesthetic }));
    const [a, b] = score(copy, interpreted);
    for (const r of [a!, b!]) {
      expect(r.scores.distinctiveness).toBe(1);
      expect(codes(r)).toEqual(expect.arrayContaining<QualityIssueCode>(["low_distinctiveness", "color_repetition"]));
    }
  });
});

describe("visual potential (specificity proxy)", () => {
  it("penalizes garments too vague to depict", async () => {
    const { drafts, interpreted } = await fixture();
    const vague = replace(drafts, 0, (d) => ({
      ...d,
      garments: d.garments.map((g, i) => (i === 0 ? { ...g, color: "neutral" } : i === 1 ? { ...g, material: "fabric" } : i === 2 ? { ...g, type: "trousers" } : g)),
    }));
    const [r] = score(vague, interpreted);
    expect(codes(r!)).toContain("low_specificity");
    expect(r!.scores.visualPotential).toBe(2);
  });
});

describe("hollow words", () => {
  it("never change a score: the rubric reads garment attributes, not prose", async () => {
    for (const id of ["nyc-casual-hangout-cool", "boston-dinner-cold", "chicago-work-snow"]) {
      const { drafts, interpreted } = await fixture(id);
      const praise = (s: string) => `${s} Perfect, elegant, flawless.`;
      const praised = drafts.map((d) => ({
        ...d,
        title: "The perfect elegant look",
        stylingRationale: praise(d.stylingRationale),
        colorStrategy: praise(d.colorStrategy),
        textureStrategy: praise(d.textureStrategy),
        proportionStrategy: praise(d.proportionStrategy),
        proTip: praise(d.proTip),
        garments: d.garments.map((g) => ({ ...g, why: praise(g.why) })),
      }));
      const plain = drafts.map((d) => ({ ...d, title: "Look", stylingRationale: "-", colorStrategy: "-", textureStrategy: "-", proportionStrategy: "-", proTip: "-" }));
      const scores = (x: OutfitDraft[]) => score(x, interpreted).map((r) => r.scores);
      expect(scores(praised)).toEqual(scores(drafts));
      expect(scores(plain)).toEqual(scores(drafts));
    }
  });

  it("cannot rescue a vague outfit", async () => {
    const { drafts, interpreted } = await fixture();
    const vague = replace(drafts, 0, (d) => ({ ...d, stylingRationale: "A perfect, elegant, flawless outfit.", garments: d.garments.map((g) => ({ ...g, color: "neutral" })) }));
    const [r] = score(vague, interpreted);
    expect(r!.scores.visualPotential).toBeLessThanOrEqual(2);
  });
});
