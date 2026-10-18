import { describe, expect, it } from "vitest";

import { evidenceForWriter } from "../../src/engine/plan";
import { genericWhyReason, validateOutfits } from "../../src/engine/outfit-validate";
import type { GarmentDraft, OutfitDraft, OutfitIssueCode } from "../../src/engine/outfit-types";
import { regionForScenario } from "../../src/knowledge/coverage";
import { interpretContext } from "../../src/engine/context";
import { AS_OF, scenario, store, templateOutfitJson } from "./engine-helpers";

async function setup(id: string) {
  const s = scenario(id);
  const { outfits, collection } = await templateOutfitJson(s);
  const interpreted = interpretContext(s.context, store, { asOf: AS_OF, region: regionForScenario(s) });
  const concepts = collection.recommendations.map((r) => r.concept);
  const evidence = evidenceForWriter(store, interpreted, collection.selection!.assignments.map((a) => a.evidenceId), AS_OF);
  const check = (drafts: OutfitDraft[]) =>
    validateOutfits(drafts, {
      interpreted,
      concepts,
      providedEvidenceIds: evidence.map((h) => h.evidence.id),
      hasRegionalEvidence: false,
      hasContemporaryEvidence: false,
    });
  return { outfits: outfits as OutfitDraft[], check };
}

const codes = (v: ReturnType<typeof validateOutfits>) => v.issues.map((i) => i.code);
const editOutfit = (outfits: OutfitDraft[], role: OutfitDraft["role"], patch: Partial<OutfitDraft>) => outfits.map((o) => (o.role === role ? { ...o, ...patch } : o));
const editGarment = (outfits: OutfitDraft[], role: OutfitDraft["role"], category: GarmentDraft["category"], patch: Partial<GarmentDraft>) =>
  outfits.map((o) => (o.role === role ? { ...o, garments: o.garments.map((g) => (g.category === category ? { ...g, ...patch } : g)) } : o));
const without = (outfits: OutfitDraft[], role: OutfitDraft["role"], pred: (g: GarmentDraft) => boolean) =>
  outfits.map((o) => (o.role === role ? { ...o, garments: o.garments.filter((g) => !pred(g)) } : o));

describe("outfit validator: negative cases", () => {
  it("catches structural, weather, color and claim problems (Chicago snow, avoided white and cream)", async () => {
    const { outfits, check } = await setup("chicago-work-snow");
    expect(check(outfits).passed).toBe(true);
    const cases: [OutfitDraft[], OutfitIssueCode][] = [
      [outfits.slice(0, 2), "outfit_coverage"],
      [editOutfit(outfits, "adjacent", { aesthetic: "streetwear" }), "aesthetic_mismatch"],
      [without(outfits, "best_bet", (g) => g.category === "footwear"), "incomplete_outfit"],
      [without(outfits, "best_bet", (g) => g.category === "bottom"), "incomplete_outfit"],
      [without(outfits, "best_bet", (g) => g.layer === "outer"), "missing_outer_layer"],
      [editGarment(outfits, "best_bet", "footwear", { type: "suede loafers", name: "grey suede loafers", material: "suede" }), "missing_constraint"],
      [editGarment(outfits, "adjacent", "outerwear", { type: "cotton chore jacket", name: "chocolate cotton chore jacket", material: "cotton" }), "missing_constraint"],
      [editGarment(outfits, "best_bet", "bottom", { color: "cream", name: "cream wool wide-leg trousers" }), "avoided_color"],
      [editOutfit(outfits, "best_bet", { colorStrategy: "Charcoal trousers with a crisp white shirt as the accent." }), "avoided_color"],
      [editGarment(outfits, "best_bet", "bottom", { name: "wide-leg trousers. In wool" }), "name_format"],
      [editGarment(outfits, "best_bet", "bottom", { why: "Looks great." }), "generic_why"],
      [editOutfit(outfits, "adjacent", { evidenceIds: ["tp-made-up"] }), "evidence_not_provided"],
      [editOutfit(outfits, "exploration", { stylingRationale: "Velvet is trending this season, so this is the look of the moment for the office." }), "unsupported_claim"],
      [editOutfit(outfits, "exploration", { proTip: "Dress like Chicago style insiders: a bold coat over everything." }), "unsupported_claim"],
      [[outfits[0]!, outfits[1]!, { ...outfits[0]!, role: "exploration", aesthetic: outfits[2]!.aesthetic }], "not_distinct_garments"],
    ];
    for (const [drafts, code] of cases) expect(codes(check(drafts)), code).toContain(code);
  });

  it("keeps heavy fabrics out of the heat and asks for shade in the sun", async () => {
    const { outfits, check } = await setup("austin-teen-hangout-hot");
    expect(check(outfits).passed).toBe(true);
    const heavy = editGarment(outfits, "best_bet", "top", { type: "chunky wool sweater", name: "white chunky wool sweater", material: "wool" });
    expect(check(heavy).issues.some((i) => i.code === "missing_constraint" && i.constraint === "breathable")).toBe(true);
    const noShade = without(outfits, "adjacent", (g) => g.category === "accessory");
    expect(check(noShade).issues.some((i) => i.code === "missing_constraint" && i.constraint === "sun_protection")).toBe(true);
    const risky = editGarment(outfits, "exploration", "top", { details: "sheer panel at the back" });
    expect(codes(check(risky))).toContain("minor_safety");
  });

  it("rejects casual pieces at a formal event and non-running shoes on a run", async () => {
    const gala = await setup("portland-gala-casual-lifestyle");
    const sneakers = editGarment(gala.outfits, "best_bet", "footwear", { type: "chunky leather sneakers", name: "black chunky leather sneakers" });
    expect(codes(gala.check(sneakers))).toContain("occasion_mismatch");

    const run = await setup("seattle-active-cool");
    const loafers = editGarment(run.outfits, "best_bet", "footwear", { type: "suede loafers", name: "black suede loafers", material: "suede" });
    expect(run.check(loafers).issues.some((i) => i.code === "missing_constraint" && i.constraint === "performance")).toBe(true);
  });

  it("checks a requested fit", async () => {
    const { outfits, check } = await setup("sf-work-fog");
    const unfitted = outfits.map((o) => (o.role === "best_bet" ? { ...o, garments: o.garments.map((g) => ({ ...g, fit: "slim" })) } : o));
    expect(codes(check(unfitted))).toContain("fit_not_honored");
  });

  it("flags generic per-garment reasons", () => {
    expect(genericWhyReason("Nice and stylish.")).toBe("fewer than 5 words");
    expect(genericWhyReason("The waxed field jacket handles the rain on the commute.")).toBeNull();
  });
});
