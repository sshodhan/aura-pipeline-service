import { describe, expect, it } from "vitest";

import { selectDirections } from "../../src/engine/directions";
import { evidenceForWriter, planStyleDirections } from "../../src/engine/plan";
import { genericThesisReason, validateCollection } from "../../src/engine/validate";
import { TemplateConceptWriter } from "../../src/engine/writer";
import type { ConceptDraft, IssueCode } from "../../src/engine/types";
import { AS_OF, interpret, scenario, scenarios, store } from "./engine-helpers";

async function setup(id: string) {
  const s = scenario(id);
  const interpreted = interpret(s);
  const selection = selectDirections(interpreted, store, AS_OF);
  const evidence = evidenceForWriter(store, interpreted, selection.assignments.map((a) => a.evidenceId), AS_OF);
  const { drafts } = await new TemplateConceptWriter().write({ context: s.context, interpreted, assignments: selection.assignments, evidence, store });
  const check = (d: ConceptDraft[]) =>
    validateCollection(d, {
      interpreted,
      assignments: selection.assignments,
      providedEvidenceIds: evidence.map((h) => h.evidence.id),
      hasRegionalEvidence: false,
      hasContemporaryEvidence: false,
    });
  return { drafts: drafts!, check };
}

const issueCodes = (v: ReturnType<typeof validateCollection>) => v.issues.map((i) => i.code);
const edit = (drafts: ConceptDraft[], role: ConceptDraft["role"], patch: Partial<ConceptDraft>) =>
  drafts.map((d) => (d.role === role ? { ...d, ...patch } : d));

describe("template writer", () => {
  it("produces a valid, distinct collection for all 20 scenarios", async () => {
    for (const s of scenarios) {
      const { drafts, check } = await setup(s.id);
      const v = check(drafts);
      expect(v.issues, s.id).toEqual([]);
      expect(Math.max(...v.similarity.map((x) => x.jaccard)), s.id).toBeLessThan(0.45);
    }
  });

  it("keeps avoided colors out and cites each aesthetic's own record", async () => {
    const { drafts } = await setup("chicago-work-snow");
    for (const d of drafts) {
      expect(JSON.stringify({ ...d, contextRationale: "" })).not.toMatch(/\b(white|cream)\b/i);
      expect(d.evidenceIds[0]).toBe(`ar-${d.aesthetic}`);
    }
  });

  it("uses a stated preferred color as the accent", async () => {
    const { drafts } = await setup("miami-hangout-hot-humid");
    expect(drafts[0]!.paletteDirection).toMatch(/coral/);
  });
});

describe("validator: negative cases", () => {
  it("flags generic theses", () => {
    expect(genericThesisReason("Trendy, stylish and chic.")).toBe("fewer than 8 words");
    expect(genericThesisReason("A stylish, elegant and effortless look that feels perfect and modern for today.")).not.toBeNull();
    expect(genericThesisReason("Wide wool trousers under a cropped jacket keep the line long for a cold office day.")).toBeNull();
  });

  it("catches each structural problem", async () => {
    const { drafts, check } = await setup("chicago-work-snow");
    const cases: [ConceptDraft[], IssueCode][] = [
      [edit(drafts, "best_bet", { aestheticThesis: "A stylish, elegant and effortless look that feels perfect and modern today." }), "generic_thesis"],
      [edit(drafts, "best_bet", { paletteDirection: "Base of charcoal with a crisp white accent." }), "avoided_color"],
      [edit(drafts, "adjacent", { materialDirection: "Wool and silk in fine weights.", contextRationale: "Good for the office in winter weather today." }), "missing_constraint"],
      [edit(drafts, "adjacent", { evidenceIds: ["ar-quiet-luxury", "tp-made-up"] }), "evidence_not_provided"],
      [edit(drafts, "adjacent", { evidenceIds: ["tp-footwear-register"] }), "evidence_missing_reference"],
      [edit(drafts, "exploration", { aesthetic: "streetwear" }), "aesthetic_mismatch"],
      [edit(drafts, "exploration", { contextRationale: "Velvet blazers are trending this season, so it fits the brief." }), "unsupported_claim"],
      [edit(drafts, "exploration", { contextRationale: "This is how Chicago dressers handle a snowy office day in practice." }), "unsupported_claim"],
      [edit(drafts, "best_bet", { silhouetteDirection: "Wide." }), "vague_direction"],
      [[drafts[0]!, drafts[1]!, { ...drafts[0]!, role: "exploration" }], "not_distinct"],
      [[drafts[0]!, drafts[1]!], "role_coverage"],
    ];
    for (const [d, code] of cases) expect(issueCodes(check(d)), code).toContain(code);
    expect(check(drafts).passed).toBe(true);
  });

  it("checks minor safety only for minors", async () => {
    const teen = await setup("austin-teen-hangout-hot");
    const risky = edit(teen.drafts, "exploration", { definingDetails: ["sheer layered top", "cropped trousers"] });
    expect(issueCodes(teen.check(risky))).toContain("minor_safety");
    const adult = await setup("miami-hangout-hot-humid");
    expect(issueCodes(adult.check(edit(adult.drafts, "exploration", { definingDetails: ["sheer layered top", "wide trousers"] })))).not.toContain("minor_safety");
  });

  it("does not let the forecast's own words satisfy a weather constraint", async () => {
    const { drafts, check } = await setup("nyc-work-cold-rain");
    const restated = edit(drafts, "best_bet", {
      materialDirection: "Cashmere and wool in rich weights for a cold, rainy day.",
      definingDetails: ["cashmere knits", "well-cut trousers"],
      contextRationale: "Suits the rain and the rainy commute with a polished feel.",
    });
    expect(check(restated).issues.some((i) => i.code === "missing_constraint" && i.constraint === "rain_protection")).toBe(true);
  });
});

describe("template writer edge cases", () => {
  it("still writes a valid palette when every palette color is avoided", async () => {
    const s = scenario("chicago-work-snow");
    // Covers the whole palette of the aesthetics chosen for this context (8 is the request limit).
    const context = { ...s.context, preferences: { avoidedColors: ["grey", "charcoal", "navy", "cream", "camel", "chocolate", "black", "white"] } };
    const c = await planStyleDirections(context, store, { writer: new TemplateConceptWriter(), asOf: AS_OF });
    expect(c.validation?.issues).toEqual([]);
    for (const concept of c.concepts) expect(concept.paletteDirection).not.toMatch(/undefined/);
  });
});
