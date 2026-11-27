import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { ACCEPTABLE_FIT, ADJACENT_MIN_DISTANCE, selectDirections } from "../../src/engine/directions";
import { interpretContext } from "../../src/engine/context";
import { evidenceSchema } from "../../src/knowledge/schema";
import { loadKnowledge, prepareRelease, readKnowledge } from "../../src/knowledge/store";
import { VERSION, aestheticRecord, editorialRecord, writeCorpus } from "./knowledge-helpers";
import { AS_OF, interpret, scenario, scenarios, store } from "./engine-helpers";

const select = (id: string) => selectDirections(interpret(scenario(id)), store, AS_OF);
const profileOf = (aesthetic: string) => store.query({ types: ["aesthetic_reference"], aesthetics: [aesthetic] })[0]!.evidence.profile!;

describe("aesthetic profiles (knowledge release fashion-2026-10.2)", () => {
  it("every aesthetic reference in the corpus has a planning profile", () => {
    for (const { evidence } of store.query({ types: ["aesthetic_reference"] })) expect(evidence.profile, evidence.id).toBeDefined();
  });

  it("only aesthetic references may carry a profile, and formality is [min, max]", () => {
    const profile = { formality: [2, 3], climates: ["mild"], expressiveness: 2, palette: ["navy", "grey"], preferenceTerms: [] };
    const errors = (v: unknown) => {
      const r = evidenceSchema.safeParse(v);
      return r.success ? [] : r.error.issues.map((i) => i.message);
    };
    expect(errors(editorialRecord({ profile } as never))).toContain("only aesthetic references carry a profile");
    expect(errors(aestheticRecord("x", { profile: { ...profile, formality: [4, 2] } } as never))).toContain("formality must be [min, max]");
    expect(errors(aestheticRecord("x", { profile } as never))).toEqual([]);
  });
});

describe("direction selection over the 20 benchmark scenarios", () => {
  it("chooses three distinct aesthetics with measurable distance for every scenario", () => {
    for (const s of scenarios) {
      const sel = selectDirections(interpret(s), store, AS_OF);
      expect(sel.status, s.id).toBe("ok");
      expect(sel.assignments.map((a) => a.role)).toEqual(["best_bet", "adjacent", "exploration"]);
      expect(new Set(sel.assignments.map((a) => a.aesthetic)).size, s.id).toBe(3);
      expect(sel.distances.find((d) => d.b === "adjacent")!.distance, s.id).toBeGreaterThanOrEqual(ADJACENT_MIN_DISTANCE);
      expect(sel.assignments[2]!.fit, s.id).toBeGreaterThanOrEqual(ACCEPTABLE_FIT);
    }
  });

  it("is deterministic", () => {
    expect(select("sf-work-fog")).toEqual(select("sf-work-fog"));
  });

  it("honors a stated aesthetic preference as the best bet when it fits", () => {
    expect(select("nashville-date-romantic").assignments[0]!.aesthetic).toBe("romantic");
    expect(select("portland-gala-casual-lifestyle").assignments[0]!.aesthetic).toBe("artistic-minimal");
    const paris = select("paris-dinner-mild");
    expect(interpret(scenario("paris-dinner-mild")).signals.preferredAesthetics).toContain(paris.assignments[0]!.aesthetic);
  });

  it("formal occasions never get an aesthetic that cannot dress up", () => {
    for (const id of ["miami-formal-warm", "portland-gala-casual-lifestyle"]) {
      for (const a of select(id).assignments) expect(profileOf(a.aesthetic).formality[1], `${id} ${a.aesthetic}`).toBeGreaterThanOrEqual(4);
    }
    expect(select("miami-formal-warm").candidates.find((c) => c.aesthetic === "streetwear")!.eligible).toBe(false);
  });

  it("an athletic occasion only gets aesthetics that reach athletic formality", () => {
    for (const a of select("seattle-active-cool").assignments) expect(profileOf(a.aesthetic).formality[0]).toBe(1);
  });

  it("hot weather excludes aesthetics suited only to cold or cool weather", () => {
    for (const id of ["miami-hangout-hot-humid", "austin-teen-hangout-hot"]) {
      const sel = select(id);
      expect(sel.candidates.find((c) => c.aesthetic === "rugged-utility")!.eligible, id).toBe(false);
      for (const a of sel.assignments) expect(profileOf(a.aesthetic).climates.some((c) => c === "hot" || c === "warm"), `${id} ${a.aesthetic}`).toBe(true);
    }
  });

  it("cold weather excludes warm-weather-only aesthetics", () => {
    expect(select("chicago-work-snow").candidates.find((c) => c.aesthetic === "relaxed-coastal")!.eligible).toBe(false);
  });
});

describe("selection with too little knowledge", () => {
  const profile = (formality: [number, number]) => ({
    formality,
    climates: ["cold", "cool", "mild", "warm", "hot"],
    expressiveness: 2,
    palette: ["navy", "grey"],
    preferenceTerms: [],
  });

  it("reports insufficient candidates instead of inventing a third direction, and skips unprofiled aesthetics", () => {
    const dir = writeCorpus({
      "x.json": [
        editorialRecord(),
        aestheticRecord("one", { profile: profile([2, 4]) } as never),
        aestheticRecord("two", { profile: profile([2, 4]), silhouettes: ["boxy"] } as never),
        aestheticRecord("unprofiled"),
      ],
    });
    writeFileSync(join(dir, "snapshot.json"), JSON.stringify(prepareRelease(readKnowledge(dir), VERSION, AS_OF, "t")));
    const small = loadKnowledge(dir);
    const sel = selectDirections(interpretContext(scenario("la-dinner-mild").context, small, { asOf: AS_OF }), small, AS_OF);
    expect(sel.status).toBe("insufficient_candidates");
    expect(sel.assignments).toEqual([]);
    expect(sel.notes.join("\n")).toMatch(/ar-unprofiled has no planning profile/);
    expect(sel.notes.join("\n")).toMatch(/only 2 aesthetic\(s\) suit this context/);
  });
});
