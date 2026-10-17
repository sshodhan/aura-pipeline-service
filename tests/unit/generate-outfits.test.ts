import { describe, expect, it } from "vitest";

import { generateOutfitsWithModel, type GenerationAttempt } from "../../src/pipeline/core/generate-outfits";
import { MockTextModel } from "../../src/baseline/mock-model";
import { getCityById } from "../../src/models/city";
import { loadScenarios, buildWeatherContext } from "../../src/baseline/fixtures";

function promptContext() {
  const scenario = loadScenarios().find((s) => s.id === "seattle-errands-rain")!;
  const weather = buildWeatherContext(scenario, "2026-10-09");
  return {
    city: getCityById("seattle-wa")!,
    weather,
    signals: {
      persona: "casual" as const,
      occasion: "errands" as const,
      vibe: "laid_back" as const,
      colorEnergy: "cool_calm" as const,
      weatherCondition: weather.current.condition,
      temperatureRange: weather.stylingImplications.temperatureRange,
    },
  };
}

describe("generateOutfitsWithModel", () => {
  it("retries provider and parse failures with 1s then 2s backoff, recording each attempt", async () => {
    const model = new MockTextModel({ script: ["throw", "malformed", "ok"], reportUsage: true });
    const sleeps: number[] = [];
    const attempts: GenerationAttempt[] = [];

    const outfits = await generateOutfitsWithModel(model, promptContext(), {
      sleep: async (ms) => void sleeps.push(ms),
      onAttempt: (a) => attempts.push(a),
    });

    expect(outfits).toHaveLength(3);
    expect(model.calls).toBe(3);
    expect(sleeps).toEqual([1000, 2000]);
    expect(attempts.map((a) => a.outcome)).toEqual(["provider_error", "parse_error", "ok"]);
    expect(attempts[0]!.usage).toBeUndefined(); // the provider threw before responding
    expect(attempts[1]!.usage?.promptTokens).toBeGreaterThan(0);
    expect(attempts[2]!.outfitCount).toBe(3);
  });

  it("gives up after 3 attempts and rethrows the last error", async () => {
    const model = new MockTextModel({ script: ["throw"] });
    const attempts: GenerationAttempt[] = [];
    await expect(
      generateOutfitsWithModel(model, promptContext(), { sleep: async () => {}, onAttempt: (a) => attempts.push(a) })
    ).rejects.toThrow("[mock] provider unavailable");
    expect(model.calls).toBe(3);
    expect(attempts).toHaveLength(3);
  });

  it("accepts fewer outfits than requested without retrying", async () => {
    const model = new MockTextModel({ script: ["fewer"] });
    const outfits = await generateOutfitsWithModel(model, promptContext(), { sleep: async () => {} });
    expect(outfits).toHaveLength(2);
    expect(model.calls).toBe(1);
  });

  it("sends the stage-4 prompt to the model", async () => {
    const model = new MockTextModel();
    await generateOutfitsWithModel(model, promptContext(), { sleep: async () => {} });
    expect(model.prompts[0]).toContain("**Location:** Seattle");
    expect(model.prompts[0]).toContain("⚠️ Rain protection needed");
  });
});
