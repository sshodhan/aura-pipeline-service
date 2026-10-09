import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadScenarios, loadScenarioFile, buildWeatherContext } from "../../src/baseline/fixtures";
import { OCCASIONS } from "../../src/models/signals";

describe("baseline scenario fixtures", () => {
  const scenarios = loadScenarios();

  it("loads at least 20 valid scenarios with unique ids", () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(20);
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(scenarios.length);
  });

  it("covers every occasion, a cold-to-hot range and several weather conditions", () => {
    const occasions = new Set(scenarios.map((s) => s.baselineMapping.occasion));
    expect([...occasions].sort()).toEqual([...OCCASIONS].sort());

    const temps = scenarios.map((s) => s.context.weather.temperatureC);
    expect(Math.min(...temps)).toBeLessThanOrEqual(0);
    expect(Math.max(...temps)).toBeGreaterThanOrEqual(32);

    const conditions = new Set(scenarios.map((s) => s.baselineMapping.weatherCondition));
    expect(conditions.size).toBeGreaterThanOrEqual(6);
  });

  it("includes unsupported cities and unspecified demographics", () => {
    expect(scenarios.some((s) => s.baselineMapping.cityId === null)).toBe(true);
    expect(scenarios.some((s) => !s.context.demographics)).toBe(true);
  });

  it("rejects fixtures with unknown fields or invalid signals", () => {
    const dir = mkdtempSync(join(tmpdir(), "aura-fixture-"));
    const bad = { ...scenarios[0]!, baselineMapping: { ...scenarios[0]!.baselineMapping, persona: "minimalist" } };
    const path = join(dir, "bad.json");
    writeFileSync(path, JSON.stringify(bad));
    expect(() => loadScenarioFile(path)).toThrow(/Invalid scenario/);

    const extra = { ...scenarios[0]!, surprise: true };
    writeFileSync(path, JSON.stringify(extra));
    expect(() => loadScenarioFile(path)).toThrow(/Invalid scenario/);
  });

  it("converts fixture weather to the pipeline's °F WeatherContext", () => {
    const nyc = scenarios.find((s) => s.id === "nyc-casual-hangout-cool")!;
    const weather = buildWeatherContext(nyc, "2026-10-09");
    expect(weather.current.temperature).toBe(57); // 14 °C
    expect(weather.current.condition).toBe("cloudy");
    expect(weather.stylingImplications.temperatureRange).toBe("mild");
    expect(weather.stylingImplications.rainProtection).toBe(false);
  });
});
