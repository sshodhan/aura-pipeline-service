import { describe, expect, it } from "vitest";

import { analyzeCallVolume } from "../../src/baseline/analysis";

// Characterization of the current nightly matrix (src/models/city.ts profiles,
// stage 2 priorities, stage 3 compatibility rules). A change here means the
// pipeline's generation volume or coverage changed.
describe("nightly call volume", () => {
  const report = analyzeCallVolume("2026-10-09", 9);

  it("makes one Gemini call per matrix entry, independent of temperature", () => {
    expect(report.entriesVaryWithTemperature).toBe(false);
    expect(report.totals.geminiCallsPerRun).toBe(894);
    expect(report.totals.worstCaseCallsWithRetries).toBe(894 * 3);
  });

  it("overwrites five of every six bundles because the cache key omits colorEnergy", () => {
    expect(report.totals.distinctBundleKeys).toBe(149);
    expect(report.totals.overwrittenBundles).toBe(745);
    for (const city of report.cities) {
      expect(city.matrixEntries).toBe(city.distinctBundleKeys * 6);
      expect(city.matrixEntries).toBeLessThan(city.tierLimit); // tier limits never bind
    }
  });

  it("never serves some occasions and personas in any city", () => {
    expect(report.occasionsNeverServed.sort()).toEqual(["formal", "home"]);
    expect(report.personasNeverServed).toEqual(["athletic"]);
  });
});
