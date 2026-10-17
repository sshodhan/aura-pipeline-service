import { describe, expect, it } from "vitest";

import { buildOutfitPrompt, parseOutfitResponse } from "../../src/pipeline/core/outfit-prompt";
import { getCityById } from "../../src/models/city";
import { loadScenarios, buildWeatherContext } from "../../src/baseline/fixtures";

describe("buildOutfitPrompt (moved verbatim from services/gemini.ts)", () => {
  it("produces the same prompt as before the move", () => {
    const scenario = loadScenarios().find((s) => s.id === "nyc-work-cold-rain")!;
    const weather = buildWeatherContext(scenario, "2026-10-09");
    const prompt = buildOutfitPrompt({
      city: getCityById("new-york-ny")!,
      weather,
      signals: {
        persona: "professional",
        occasion: "work",
        vibe: "minimal",
        colorEnergy: "cool_calm",
        weatherCondition: weather.current.condition,
        temperatureRange: weather.stylingImplications.temperatureRange,
      },
    });
    // Snapshot guards the stage-4 prompt: any wording change shows up in review.
    expect(prompt).toMatchSnapshot();
  });
});

describe("parseOutfitResponse", () => {
  const outfit = {
    items: [
      { category: "top", name: "Knit", description: "d", color: "cream" },
      { category: "outerwear", name: "Coat", description: "d", color: "camel" },
    ],
    styling: { overallVibe: "v", colorStory: "c", silhouetteProfile: "s", occasionFit: "o" },
    rationale: "r",
  };

  it("parses fenced JSON and ranks outfits", () => {
    const parsed = parseOutfitResponse("Sure!\n```json\n" + JSON.stringify([outfit, outfit]) + "\n```");
    expect(parsed).toHaveLength(2);
    expect(parsed.map((o) => o.rank)).toEqual([1, 2]);
    expect(parsed[0]!.items[0]!.id).toMatch(/^item-/);
    expect(parsed[0]!.personalizationSlots).toEqual({
      colorSwappable: true,
      accessoryOptional: false,
      layeringAdjustable: true,
    });
  });

  it("parses bare JSON", () => {
    expect(parseOutfitResponse(JSON.stringify([outfit]))).toHaveLength(1);
  });

  it("throws on prose or a non-array payload", () => {
    expect(() => parseOutfitResponse("Here are some outfits")).toThrow("Failed to parse AI response as JSON");
    expect(() => parseOutfitResponse(JSON.stringify({ outfits: [] }))).toThrow("Failed to parse AI response as JSON");
  });
});
