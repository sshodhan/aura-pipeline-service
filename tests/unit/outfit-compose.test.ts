import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GARMENT_PATTERNS, NOT_FORMAL, TOO_CASUAL } from "../../src/engine/garments";
import { outfitDraftSchema, type OutfitSpec } from "../../src/engine/outfit-types";
import { TemplateOutfitWriter } from "../../src/engine/outfit-writer";
import { recommend } from "../../src/engine/recommend";
import { renderRecommendSummaryMarkdown, runRecommendScenarios, summarizeRecommendRun } from "../../src/engine/recommend-runner";
import { TemplateConceptWriter } from "../../src/engine/writer";
import { regionForScenario } from "../../src/knowledge/coverage";
import { AS_OF, scenario, scenarios, store, templateOutfitJson } from "./engine-helpers";

const run = (id: string) =>
  recommend(scenario(id).context, store, {
    conceptWriter: new TemplateConceptWriter(),
    outfitWriter: new TemplateOutfitWriter(),
    asOf: AS_OF,
    region: regionForScenario(scenario(id)),
  });
const garmentsOf = (o: OutfitSpec, category: string) => o.garments.filter((g) => g.category === category);
const text = (o: OutfitSpec) => o.garments.map((g) => `${g.name} ${g.type} ${g.material}`).join(" ").toLowerCase();

describe("template outfits over the 20 benchmark scenarios", () => {
  it("are valid, complete, schema-conformant and distinct for every scenario", async () => {
    for (const s of scenarios) {
      const { outfits, collection } = await templateOutfitJson(s);
      expect(collection.status, s.id).toBe("ok");
      expect(collection.validation.outfits?.issues, s.id).toEqual([]);
      expect(collection.recommendations.map((r) => r.role), s.id).toEqual(["best_bet", "adjacent", "exploration"]);
      for (const o of outfits) expect(outfitDraftSchema.safeParse(o).success, `${s.id} ${o.role}`).toBe(true);
      for (const pair of collection.validation.outfits!.differingCoreSlots) expect(pair.slots, s.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("ties each outfit to its concept and gives every garment a stable id", async () => {
    const c = await run("london-work-drizzle");
    for (const r of c.recommendations) {
      expect(r.outfit.conceptId).toBe(r.concept.id);
      expect(r.outfit.aesthetic).toBe(r.concept.aesthetic);
      expect(r.outfit.garments.map((g) => g.id)).toEqual(r.outfit.garments.map((_, i) => `${r.outfit.id}-g${i + 1}`));
      expect(r.outfit.knowledgeVersion).toBe(store.knowledgeVersion);
    }
  });

  it("dresses snow with insulated, water-resistant outerwear and boots, and keeps avoided colors out", async () => {
    const c = await run("chicago-work-snow");
    for (const { outfit } of c.recommendations) {
      const outer = garmentsOf(outfit, "outerwear").filter((g) => g.layer === "outer");
      expect(outer).toHaveLength(1);
      expect(GARMENT_PATTERNS.water.test(outer[0]!.type) && GARMENT_PATTERNS.insulating.test(`${outer[0]!.type} ${outer[0]!.material}`)).toBe(true);
      expect(garmentsOf(outfit, "footwear")[0]!.type).toMatch(/boots/);
      expect(outfit.garments.map((g) => g.color).join(" ")).not.toMatch(/\b(white|cream)\b/);
    }
  });

  it("keeps heavy fabrics out of the heat and adds shade in strong sun", async () => {
    for (const id of ["miami-hangout-hot-humid", "austin-teen-hangout-hot"]) {
      for (const { outfit } of (await run(id)).recommendations) {
        expect(outfit.garments.filter((g) => g.category !== "footwear" && g.category !== "accessory").some((g) => GARMENT_PATTERNS.heavy.test(`${g.type} ${g.material}`)), id).toBe(false);
        expect(garmentsOf(outfit, "accessory").some((g) => GARMENT_PATTERNS.sunShade.test(g.type)), id).toBe(true);
      }
    }
  });

  it("uses a stated preferred color", async () => {
    const c = await run("miami-hangout-hot-humid");
    expect(c.recommendations.every((r) => r.outfit.garments.some((g) => g.color === "coral"))).toBe(true);
  });

  it("puts the trail run in running footwear and technical fabrics", async () => {
    for (const { outfit } of (await run("seattle-active-cool")).recommendations) {
      expect(garmentsOf(outfit, "footwear")[0]!.type).toMatch(GARMENT_PATTERNS.athleticFootwear);
      expect(GARMENT_PATTERNS.technical.test(text(outfit))).toBe(true);
    }
  });

  it("keeps formal events formal and adds a tailored layer", async () => {
    for (const id of ["portland-gala-casual-lifestyle", "miami-formal-warm"]) {
      const c = await run(id);
      for (const { outfit } of c.recommendations) {
        expect(TOO_CASUAL.test(text(outfit)) || NOT_FORMAL.test(text(outfit)), `${id} ${outfit.role}`).toBe(false);
      }
      expect(c.recommendations[0]!.outfit.garments.some((g) => g.layer === "mid" || g.layer === "outer"), id).toBe(true);
    }
  });

  it("honors a requested fit", async () => {
    for (const { outfit } of (await run("sf-work-fog")).recommendations) {
      expect(outfit.garments.some((g) => g.fit === "relaxed")).toBe(true);
    }
  });

  it("is deterministic apart from latency", async () => {
    const strip = (c: Awaited<ReturnType<typeof run>>) => ({
      ...c,
      diagnostics: { ...c.diagnostics, latencyMs: 0, concepts: { ...c.diagnostics.concepts, latencyMs: 0 }, outfits: { ...c.diagnostics.outfits!, latencyMs: 0 }, curation: { ...c.diagnostics.curation!, latencyMs: 0 } },
    });
    expect(strip(await run("boston-dinner-cold"))).toEqual(strip(await run("boston-dinner-cold")));
  });
});

describe("consumer contract (docs/CONSUMER_INTEGRATION_CONTRACT.md §A8)", () => {
  it("gives an adapter what it needs without another garment call", async () => {
    for (const s of scenarios) {
      const { collection } = await templateOutfitJson(s);
      for (const { outfit } of collection.recommendations) {
        // Core garments, each with a displayable name carrying its color word and a per-garment reason.
        expect(garmentsOf(outfit, "top").length + garmentsOf(outfit, "dress").length, s.id).toBeGreaterThan(0);
        expect(garmentsOf(outfit, "footwear"), s.id).toHaveLength(1);
        for (const g of outfit.garments) {
          expect(g.name.toLowerCase()).toContain(g.color.toLowerCase());
          expect(g.name).not.toContain(".");
          expect(g.why.length).toBeGreaterThan(10);
        }
        // styleReasoning, proTip, weatherStory and lookTitle sources.
        for (const field of [outfit.stylingRationale, outfit.proTip, outfit.weatherNotes, outfit.title]) expect(field.length).toBeGreaterThan(3);
      }
    }
  });
});

describe("recommendation runner and CLI", () => {
  it("summarizes a template run", async () => {
    const summary = summarizeRecommendRun(
      await runRecommendScenarios(scenarios, { store, conceptWriter: new TemplateConceptWriter(), outfitWriter: new TemplateOutfitWriter(), asOf: AS_OF })
    );
    expect(summary).toMatchObject({ scenarios: 20, validCollections: 20, modelCalls: { total: 0 }, fallbacks: { concepts: 0, outfits: 0 } });
    const md = renderRecommendSummaryMarkdown(summary, { writer: "template", modelId: null, asOf: AS_OF, knowledgeVersion: store.knowledgeVersion, engineVersion: "recommend-0.2", gitCommit: null });
    expect(md).toMatch(/not editorial quality/);
    expect(md).toMatch(/\| Scenario \| Status \| Modes \|/);
  });

  it("CLI writes collections and a summary", () => {
    const out = mkdtempSync(join(tmpdir(), "recommend-"));
    execFileSync("npx", ["tsx", "src/scripts/run-recommend.ts", "--as-of", AS_OF, "--out", out, "fixtures/scenarios/06-chicago-work-snow.json"], {
      encoding: "utf8",
      env: { ...process.env, LOG_LEVEL: "silent" },
    });
    expect(JSON.parse(readFileSync(join(out, "summary.json"), "utf8"))).toMatchObject({ writer: "template", scenarios: 1, validCollections: 1 });
    const collection = JSON.parse(readFileSync(join(out, "scenarios", "chicago-work-snow.json"), "utf8"));
    expect(collection.recommendations).toHaveLength(3);
  }, 30_000);
});
