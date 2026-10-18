import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { classifyColor } from "../../src/engine/colors";
import { toOutfitDrafts } from "../../src/engine/compose";
import { ModelOutfitWriter, TemplateOutfitWriter } from "../../src/engine/outfit-writer";
import type { OutfitDraft, RecommendationCollection } from "../../src/engine/outfit-types";
import { totalScore } from "../../src/engine/quality";
import { recommend } from "../../src/engine/recommend";
import { calibrationSheets, CALIBRATION_KEY_COLUMNS, CALIBRATION_SHEET_COLUMNS, runRecommendScenarios } from "../../src/engine/recommend-runner";
import { TemplateConceptWriter } from "../../src/engine/writer";
import { regionForScenario } from "../../src/knowledge/coverage";
import { AS_OF, ScriptedModel, scenario, scenarios, store } from "./engine-helpers";

const template = () => ({ conceptWriter: new TemplateConceptWriter(), outfitWriter: new TemplateOutfitWriter(), asOf: AS_OF });
const run = (id: string, options: Partial<Parameters<typeof recommend>[2]> = {}) =>
  recommend(scenario(id).context, store, { ...template(), region: regionForScenario(scenario(id)), ...options });
const drafts = (c: RecommendationCollection) => toOutfitDrafts(c.recommendations.map((r) => r.outfit));

/** Final totals never below the first version's; a kept revision strictly above. */
function expectNeverWorse(c: RecommendationCollection) {
  for (const a of c.quality!.assessments) {
    const before = totalScore(c.quality!.initialScores[a.role]!);
    const after = totalScore(a.editorialAssessment);
    expect(after, `${a.role}`).toBeGreaterThanOrEqual(before);
    if (a.outcome === "revised") expect(after, `${a.role}`).toBeGreaterThan(before);
  }
}

describe("curation with the default threshold", () => {
  it("accepts every template fixture as is, with no revisions and no calls", async () => {
    for (const s of scenarios) {
      const c = await run(s.id);
      expect(c.engineVersion).toBe("recommend-0.2");
      expect(c.quality?.revisedRoles).toEqual([]);
      expect(c.quality?.lowConfidence).toEqual([]);
      expect(c.diagnostics.curation).toMatchObject({ mode: "none", modelCalls: 0 });
      expect(c.recommendations.every((r) => r.quality?.decision === "accept" && r.quality.outcome === "accepted" && r.quality.hardChecks.passed)).toBe(true);
    }
  });

  it("leaves Phase 3 output unchanged; curate: false only drops the quality data", async () => {
    for (const id of ["nyc-casual-hangout-cool", "chicago-work-snow", "la-errands-warm"]) {
      const on = await run(id);
      const off = await run(id, { curate: false });
      expect(off.quality).toBeNull();
      expect(off.diagnostics.curation).toBeNull();
      expect(off.recommendations.every((r) => r.quality === undefined)).toBe(true);
      expect(drafts(on)).toEqual(drafts(off));
      expect(on.validation.outfits).toEqual(off.validation.outfits);
    }
  });
});

describe("template repair", () => {
  it("revises weak outfits at a stricter threshold without model calls, keeping collections valid and never scoring worse", async () => {
    let revised = 0;
    for (const s of scenarios) {
      const c = await run(s.id, { reviseBelow: 4 });
      expect(c.validation.outfits?.passed, s.id).toBe(true);
      expect(c.diagnostics.totalModelCalls).toBe(0);
      expectNeverWorse(c);
      if (c.quality!.revisedRoles.length > 0) expect(c.diagnostics.curation?.mode).toBe("template_repair");
      for (const a of c.quality!.assessments) {
        if (a.decision === "revise") {
          expect(a.revisionInstructions?.length).toBeGreaterThan(0);
          expect(["revised", "low_confidence"]).toContain(a.outcome);
        }
      }
      revised += c.quality!.revisedRoles.length;
    }
    expect(revised).toBeGreaterThan(0);
  });

  it("keeps and flags an outfit it cannot lift above the threshold", async () => {
    const c = await run("nyc-casual-hangout-cool", { reviseBelow: 6 });
    expect(c.quality!.lowConfidence.length).toBe(3);
    expect(c.recommendations).toHaveLength(3);
    expect(c.validation.outfits?.passed).toBe(true);
  });
});

describe("template hints", () => {
  it("steer away from garment types, cap accents and hold one neutral temperature", async () => {
    const c = await run("nyc-casual-hangout-cool", { curate: false });
    const request = { context: scenario("nyc-casual-hangout-cool").context, interpreted: c.interpreted!, concepts: c.recommendations.map((r) => r.concept), evidence: [], store };
    const plain = (await new TemplateOutfitWriter().write(request)).drafts!;
    const explore = plain.find((d) => d.role === "exploration")!;
    const avoid = explore.garments.find((g) => g.category === "top")!.type;
    const hinted = (await new TemplateOutfitWriter().write({ ...request, templateHints: { exploration: { avoidTypes: [avoid], maxAccents: 1 } } })).drafts!;
    const after = hinted.find((d) => d.role === "exploration")!;
    expect(after.garments.some((g) => g.type === avoid)).toBe(false);
    expect(after.garments.filter((g) => classifyColor(g.color).role === "accent").length).toBeLessThanOrEqual(1);
    // Other roles are untouched.
    expect(hinted.find((d) => d.role === "best_bet")).toEqual(plain.find((d) => d.role === "best_bet"));

    const warm = (await new TemplateOutfitWriter().write({ ...request, templateHints: { best_bet: { neutralTemperature: "warm" } } })).drafts!;
    const temps = warm.find((d) => d.role === "best_bet")!.garments.map((g) => classifyColor(g.color)).filter((x) => x.role === "neutral").map((x) => x.temperature);
    expect(temps.filter((t) => t === "cool").length).toBeLessThanOrEqual(temps.filter((t) => t === "warm").length);
  });
});

describe("model revision", () => {
  /** A scenario whose template output template repair improves at threshold 4, with both versions as drafts. */
  async function weakAndBetter(): Promise<{ id: string; first: OutfitDraft[]; better: OutfitDraft[] }> {
    for (const s of scenarios) {
      const strict = await run(s.id, { reviseBelow: 4 });
      if (strict.quality!.revisedRoles.length > 0) return { id: s.id, first: drafts(await run(s.id, { curate: false })), better: drafts(strict) };
    }
    throw new Error("no scenario improves under template repair");
  }

  it("revises weak outfits in one call from issue codes only and keeps the better version", async () => {
    const { id, first, better } = await weakAndBetter();
    const marked = first.map((d) => ({ ...d, proTip: `${d.proTip} zqx-marker` }));
    const model = new ScriptedModel([JSON.stringify({ outfits: marked }), JSON.stringify({ outfits: better })]);
    const c = await run(id, { outfitWriter: new ModelOutfitWriter(model, "m"), reviseBelow: 4 });
    expect(model.prompts).toHaveLength(2);
    expect(c.diagnostics.curation).toMatchObject({ mode: "model_revision", modelCalls: 1, maxModelCalls: 1 });
    expect(c.diagnostics.totalModelCalls).toBe(2);
    expect(c.quality!.revisedRoles.length).toBeGreaterThan(0);
    const revision = model.prompts[1]!;
    for (const code of c.quality!.assessments.flatMap((a) => a.revisionInstructions ?? [])) expect(revision).toContain(code);
    expect(revision).not.toContain("zqx-marker");
    expect(c.validation.outfits?.passed).toBe(true);
    expectNeverWorse(c);
  });

  it("keeps the original when the revision fails, is worse, or breaks a hard check", async () => {
    const { id, first } = await weakAndBetter();
    const shoeless = first.map((d) => ({ ...d, garments: d.garments.filter((g) => g.category !== "footwear") }));
    const vaguer = first.map((d) => ({ ...d, garments: d.garments.map((g) => ({ ...g, material: "fabric" })) }));
    for (const reply of ["not json", JSON.stringify({ outfits: shoeless }), JSON.stringify({ outfits: vaguer })]) {
      const model = new ScriptedModel([JSON.stringify({ outfits: first }), reply]);
      const c = await run(id, { outfitWriter: new ModelOutfitWriter(model, "m"), reviseBelow: 4 });
      expect(c.quality!.revisedRoles).toEqual([]);
      expect(drafts(c)).toEqual(first);
      expect(c.validation.outfits?.passed).toBe(true);
      const flagged = c.quality!.assessments.filter((a) => a.decision === "revise").map((a) => a.role);
      expect(flagged.length).toBeGreaterThan(0);
      expect(c.quality!.lowConfidence).toEqual(flagged);
    }
  });

  it("with no curation budget, flags model outfits instead of mixing in template garments", async () => {
    const { id, first } = await weakAndBetter();
    const model = new ScriptedModel([JSON.stringify({ outfits: first })]);
    const c = await run(id, { outfitWriter: new ModelOutfitWriter(model, "m"), reviseBelow: 4, maxCurationCalls: 0 });
    expect(model.prompts).toHaveLength(1);
    expect(c.diagnostics.curation).toMatchObject({ mode: "none", modelCalls: 0 });
    expect(drafts(c)).toEqual(first);
    expect(c.quality!.lowConfidence.length).toBeGreaterThan(0);
  });

  it("never makes more than five model calls in all", async () => {
    const down = () => new ScriptedModel([new Error("provider down")]);
    const { ModelConceptWriter } = await import("../../src/engine/writer");
    const c = await run("boston-dinner-cold", {
      conceptWriter: new ModelConceptWriter(down(), "m"),
      outfitWriter: new ModelOutfitWriter(down(), "m"),
      reviseBelow: 6,
      sleep: async () => {},
    });
    // Both stages fell back to the template, so curation repairs with the template at no model cost.
    expect(c.diagnostics.totalModelCalls).toBe(4);
    expect(c.diagnostics.curation?.modelCalls).toBe(0);

    const { first } = await weakAndBetter();
    const flaky = new ScriptedModel([JSON.stringify({ outfits: first }), new Error("provider down")]);
    const m = await run("boston-dinner-cold", { outfitWriter: new ModelOutfitWriter(flaky, "m"), reviseBelow: 6, sleep: async () => {} });
    expect(m.diagnostics.totalModelCalls).toBeLessThanOrEqual(5);
    expect(m.diagnostics.curation?.modelCalls).toBeLessThanOrEqual(1);
  });
});

describe("calibration sheets", () => {
  it("keep the rater sheet blind and the key joinable", async () => {
    const subset = scenarios.slice(0, 4);
    const results = await runRecommendScenarios(subset, { store, ...template() });
    const { sheet, key } = calibrationSheets(subset, results);
    const sheetLines = sheet.trim().split("\n");
    const keyLines = key.trim().split("\n");
    expect(sheetLines[0]).toBe(CALIBRATION_SHEET_COLUMNS.join(","));
    expect(keyLines[0]).toBe(CALIBRATION_KEY_COLUMNS.join(","));
    expect(sheetLines).toHaveLength(13);
    expect(keyLines).toHaveLength(13);
    // Same item ids in the same order.
    expect(sheetLines.slice(1).map((l) => l.split(",")[0])).toEqual(keyLines.slice(1).map((l) => l.split(",")[0]));
    // No roles, aesthetics, scores or prose on the rater sheet.
    for (const word of ["best_bet", "adjacent", "exploration", "rubric", ...results[0]!.collection.recommendations.map((r) => r.outfit.aesthetic)]) expect(sheet).not.toContain(word);
    expect(sheet).not.toContain(results[0]!.collection.recommendations[0]!.outfit.stylingRationale);
    // Stable ids across runs.
    expect(calibrationSheets(subset, await runRecommendScenarios(subset, { store, ...template() })).key).toBe(key);
  });

  it("are written by the CLI", () => {
    const out = mkdtempSync(join(tmpdir(), "calibration-"));
    execFileSync("npx", ["tsx", "src/scripts/run-recommend.ts", "--as-of", AS_OF, "--out", out, "--revise-below", "4", "fixtures/scenarios/06-chicago-work-snow.json"], {
      encoding: "utf8",
      env: { ...process.env, LOG_LEVEL: "silent" },
    });
    expect(readFileSync(join(out, "calibration-sheet.csv"), "utf8").trim().split("\n")).toHaveLength(4);
    expect(readFileSync(join(out, "calibration-key.csv"), "utf8")).toMatch(/rubric-0\.1,recommend-0\.2/);
    expect(JSON.parse(readFileSync(join(out, "summary.json"), "utf8")).quality).toMatchObject({ outfits: 3 });
  }, 30_000);
});
