import { describe, expect, it } from "vitest";

import { climateBand, contextFingerprint, includesMinor, interpretContext, parseContext } from "../../src/engine/context";
import { selectDirections } from "../../src/engine/directions";
import { AS_OF, interpret, scenario, store } from "./engine-helpers";

const codes = (id: string) => interpret(scenario(id)).constraints.map((c) => c.code);

describe("context interpreter: hard constraints", () => {
  it("cold rain at the office needs rain protection, insulation and office formality", () => {
    const i = interpret(scenario("nyc-work-cold-rain"));
    expect(codes("nyc-work-cold-rain")).toEqual(expect.arrayContaining(["formality", "rain_protection", "insulation"]));
    expect(i.signals.occasionKind).toBe("office");
    expect(i.signals.formalityBand).toEqual([3, 4]);
    expect(i.signals.targetFormality).toBe(4); // professional lifestyle, inside the office band
  });

  it("snow and avoided colors become constraints", () => {
    const i = interpret(scenario("chicago-work-snow"));
    expect(codes("chicago-work-snow")).toEqual(expect.arrayContaining(["snow_protection", "insulation", "avoid_colors"]));
    expect(i.signals.avoidedColors).toEqual(["white", "cream"]);
    expect(i.signals.precipitation).toBe("snow");
  });

  it("a teenager gets the minor-safety constraint; heat and clear sky add breathability and sun", () => {
    const i = interpret(scenario("austin-teen-hangout-hot"));
    expect(i.signals.minor).toBe(true);
    expect(codes("austin-teen-hangout-hot")).toEqual(expect.arrayContaining(["minor_safe", "breathable", "sun_protection"]));
    expect(includesMinor("25-35")).toBe(false);
    expect(includesMinor("56+")).toBe(false);
  });

  it("an athletic occasion is strict and needs performance garments", () => {
    const i = interpret(scenario("seattle-active-cool"));
    expect(i.signals.occasionKind).toBe("athletic");
    expect(i.signals.strictFormality).toBe(true);
    expect(codes("seattle-active-cool")).toContain("performance");
  });

  it("'running errands' is errands, not a run", () => {
    expect(interpret(scenario("la-errands-warm")).signals.occasionKind).toBe("errands");
  });

  it("wind becomes a constraint", () => {
    expect(codes("chicago-hangout-windy")).toContain("wind_protection");
  });

  it("the occasion outranks the everyday lifestyle", () => {
    const i = interpret(scenario("portland-gala-casual-lifestyle"));
    expect(i.signals.formalityBand).toEqual([4, 5]);
    expect(i.signals.targetFormality).toBe(4);
    expect(i.explicitPreferences.join("\n")).toMatch(/outside the occasion's range; the occasion wins/);
  });

  it("maps temperatures to climate bands", () => {
    expect([-6, 4.9, 5, 12.9, 13, 20.9, 21, 27.9, 28].map(climateBand)).toEqual([
      "cold", "cold", "cool", "cool", "mild", "mild", "warm", "warm", "hot",
    ]);
  });
});

describe("context interpreter: preferences, unknowns and knowledge gaps", () => {
  it("matches stated aesthetics to the vocabulary and keeps unmatched ones", () => {
    expect(interpret(scenario("paris-dinner-mild")).signals.preferredAesthetics).toEqual(
      expect.arrayContaining(["artistic-minimal", "quiet-luxury", "relaxed-metropolitan-tailoring"])
    );
    expect(interpret(scenario("nyc-date-mild-clear")).signals.preferredAesthetics).toEqual(["eclectic-maximalist", "streetwear"]); // "bold"

    const s = scenario("nyc-casual-hangout-cool");
    const i = interpretContext({ ...s.context, preferences: { preferredAesthetics: ["Cottagecore"] } }, store, { asOf: AS_OF });
    expect(i.signals.preferredAesthetics).toEqual([]);
    expect(i.signals.unmatchedPreferences).toEqual(["cottagecore"]);
  });

  it("keeps unstated fields unknown instead of inventing defaults", () => {
    const i = interpret(scenario("seattle-active-cool"));
    expect(i.signals.genderExpression).toBeNull();
    expect(i.signals.ageRange).toBeNull();
    expect(i.unknowns.join("\n")).toMatch(/Gender expression not stated/);
    expect(i.unknowns.join("\n")).toMatch(/Age range not stated/);
  });

  it("states missing regional and contemporary knowledge for London rather than borrowing", () => {
    const i = interpret(scenario("london-work-drizzle"));
    expect(i.signals.region).toBe("london");
    expect(i.knowledgeGaps).toEqual(
      expect.arrayContaining(["No regional evidence for london: no city-specific style claims", "No current contemporary evidence for fall: no trend claims"])
    );
    expect(i.relevantEvidenceIds.length).toBeGreaterThan(0);
  });

  it("gender expression, age and city never change which directions are chosen", () => {
    const base = scenario("la-dinner-mild").context;
    const pick = (ctx: typeof base) =>
      selectDirections(interpretContext(ctx, store, { asOf: AS_OF }), store, AS_OF).assignments.map((a) => a.aesthetic);
    const expected = pick(base);
    expect(pick({ ...base, demographics: { genderExpression: "female", ageRange: "18-25" } })).toEqual(expected);
    expect(pick({ ...base, demographics: undefined })).toEqual(expected);
    expect(pick({ ...base, city: "Tokyo" })).toEqual(expected);
  });
});

describe("request validation", () => {
  const ok = scenario("nyc-casual-hangout-cool").context;

  it("accepts a fixture and rejects schema violations", () => {
    expect(parseContext(ok).ok).toBe(true);
    const bad = parseContext({ ...ok, weather: { temperatureC: 99, condition: "Clear" } });
    expect(bad.ok).toBe(false);
  });

  it("caps text length and list size", () => {
    const long = parseContext({ ...ok, occasion: "x".repeat(121) });
    expect(long.ok ? [] : long.errors).toEqual(["occasion: longer than 120 characters"]);
    const many = parseContext({ ...ok, preferences: { preferredColors: Array.from({ length: 9 }, (_, i) => `c${i}`) } });
    expect(many.ok ? [] : many.errors).toEqual(["preferences.preferredColors: more than 8 items"]);
  });

  it("fingerprints content, not the request id", () => {
    expect(contextFingerprint(ok)).toBe(contextFingerprint({ ...ok, requestId: "other" }));
    expect(contextFingerprint(ok)).not.toBe(contextFingerprint({ ...ok, occasion: "dinner out" }));
  });
});
