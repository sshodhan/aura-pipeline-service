import { describe, expect, it } from "vitest";

import { garmentCoverageGaps, templateUsable } from "../../src/engine/garments";
import { garmentOptionSchema } from "../../src/knowledge/schema";
import { store } from "./engine-helpers";

const errors = (v: unknown) => {
  const r = garmentOptionSchema.safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};
const valid = { category: "outerwear", type: "waxed cotton field jacket", material: "waxed cotton", fit: "boxy", layer: "outer", climates: ["cool"], formality: [2, 3], protects: ["rain"] };

describe("garment vocabularies (knowledge release fashion-2026-10.3)", () => {
  it("validates garment options", () => {
    expect(errors(valid)).toEqual([]);
    expect(errors({ ...valid, formality: [4, 2] })).toContain("formality must be [min, max]");
    expect(errors({ ...valid, climates: [] }).length).toBeGreaterThan(0);
    expect(errors({ ...valid, protects: ["snow"] }).length).toBeGreaterThan(0);
    expect(errors({ ...valid, type: "Field Jacket, Waxed" })).toContain("lowercase term");
  });

  it("every aesthetic can dress every climate and formality level it claims", () => {
    for (const { evidence } of store.query({ types: ["aesthetic_reference"] })) {
      expect(evidence.profile?.garments?.length, evidence.id).toBeGreaterThanOrEqual(8);
      expect(garmentCoverageGaps(evidence.profile!), evidence.id).toEqual([]);
    }
  });

  it("reports gaps instead of hiding them", () => {
    const tailoring = store.query({ types: ["aesthetic_reference"], aesthetics: ["relaxed-metropolitan-tailoring"] })[0]!.evidence.profile!;
    const withoutBoots = { ...tailoring, garments: tailoring.garments!.filter((g) => g.category !== "footwear" || !(g.protects ?? []).includes("rain")) };
    expect(garmentCoverageGaps(withoutBoots)).toEqual(expect.arrayContaining(["cold: rain-capable footwear", "cold: boots for snow"]));
  });

  it("the template never picks dresses, skirts or other gendered defaults", () => {
    const all = store.query({ types: ["aesthetic_reference"] }).flatMap((h) => h.evidence.profile?.garments ?? []);
    const excluded = all.filter((g) => !templateUsable(g)).map((g) => g.type);
    expect(excluded).toEqual(expect.arrayContaining(["floral tea dress", "pleated midi skirt", "puff-sleeve poplin blouse", "linen slip dress"]));
    expect(all.filter(templateUsable).some((g) => /skirt|dress|gown|blouse/.test(g.type))).toBe(false);
  });
});
