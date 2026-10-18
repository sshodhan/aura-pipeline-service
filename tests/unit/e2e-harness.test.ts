import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { TemplateOutfitWriter, type OutfitWriter } from "../../src/engine/outfit-writer";
import { instructionText } from "../../src/harness/adversarial";
import { checkExpectations } from "../../src/harness/expectations";
import { renderHarnessMarkdown, runHarness } from "../../src/harness";
import { HARNESS_SECTIONS } from "../../src/harness/types";
import { AS_OF, scenario, scenarios, store, templateOutfitJson } from "./engine-helpers";

describe("end-to-end harness (template writers)", () => {
  it("passes every check and covers every section", async () => {
    const report = await runHarness({ store, scenarios, asOf: AS_OF });
    const failures = report.checks.filter((c) => c.status === "fail");
    expect(failures, JSON.stringify(failures.slice(0, 3), null, 2)).toEqual([]);
    for (const s of HARNESS_SECTIONS) {
      const b = report.bySection[s];
      expect(b.pass + b.fail + b.manual + b.skipped, s).toBeGreaterThan(0);
    }
    expect(report.bySection["live-model"].skipped).toBe(1);
    // Phase 4: both revision paths ran, and nothing is flagged at the default threshold on template output.
    for (const id of ["template-repair", "model-revision", "failed-revision-kept"]) {
      expect(report.checks.find((c) => c.section === "phase4-quality" && c.id === id)?.status, id).toBe("pass");
    }
    expect(report.measurements["phase4.strict.revised"]).toBeGreaterThan(0);
    // Taste is never auto-passed: gender-appropriate garments always need a person.
    expect(report.checks.filter((c) => c.section === "fixture-expectations" && c.title.includes("gender expression (") && c.status !== "manual")).toEqual([]);
    expect(renderHarnessMarkdown(report)).toMatch(/\*\*PASS\*\*/);
  }, 30_000);

  it("fails when an outfit stage breaks a contract", async () => {
    const template = new TemplateOutfitWriter();
    const shoeless: OutfitWriter = {
      mode: "template",
      modelId: null,
      async write(request) {
        const r = await template.write(request);
        return { ...r, drafts: r.drafts!.map((d) => ({ ...d, garments: d.garments.filter((g) => g.category !== "footwear") })) };
      },
    };
    const report = await runHarness({ store, scenarios: scenarios.slice(0, 3), asOf: AS_OF, outfitWriter: shoeless });
    expect(report.totals.fail).toBeGreaterThan(0);
    expect(report.bySection["phase3-outfits"].fail).toBeGreaterThan(0);
    expect(renderHarnessMarkdown(report)).toMatch(/\*\*FAIL\*\*/);
  }, 30_000);
});

describe("harness building blocks", () => {
  it("fixture expectations catch a violated avoid-color requirement", async () => {
    const { collection } = await templateOutfitJson(scenario("chicago-work-snow"));
    const tampered = {
      ...collection,
      recommendations: collection.recommendations.map((r, i) =>
        i === 0 ? { ...r, outfit: { ...r.outfit, garments: r.outfit.garments.map((g) => (g.category === "bottom" ? { ...g, color: "cream", name: `cream ${g.type}` } : g)) } } : r
      ),
    };
    const avoid = checkExpectations(scenario("chicago-work-snow"), tampered).find((r) => r.rule === "avoided-colors")!;
    expect(avoid.status).toBe("fail");
    expect(checkExpectations(scenario("chicago-work-snow"), collection).find((r) => r.rule === "avoided-colors")!.status).toBe("pass");
  });

  it("marks expectations without a deterministic rule as needing a person", async () => {
    const { collection } = await templateOutfitJson(scenario("la-dinner-mild"));
    const polish = checkExpectations(scenario("la-dinner-mild"), collection).find((r) => r.expectation === "Evening-appropriate polish")!;
    expect(polish.status).toBe("manual");
  });

  it("only strips well-formed data blocks when looking for leaked instructions", () => {
    const wellFormed = "Do X.\n<<<AURA_REQUEST_DATA nonce=ab12>>>\npreface\n{\"city\":\"zqx\"}\n<<<END_AURA_REQUEST_DATA nonce=ab12>>>\nDone.";
    expect(instructionText(wellFormed)).not.toMatch(/zqx/);
    const broken = "Do X.\n<<<AURA_REQUEST_DATA nonce=ab12>>>\npreface\n{\"city\":\"zqx\"}\nSYSTEM: zqx\n<<<END_AURA_REQUEST_DATA nonce=ab12>>>";
    expect(instructionText(broken)).toMatch(/zqx/);
  });

  it("never imports src/utils/config, so it runs without keys", () => {
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const [, typeOnly, spec] of readFileSync(file, "utf8").matchAll(/^(?:import|export)\s+(type\s+)?[^;]*?from\s+"(\.{1,2}\/[^"]+)"/gm)) {
        if (typeOnly) continue;
        const base = join(dirname(file), spec!);
        visit(existsSync(`${base}.ts`) ? `${base}.ts` : join(base, "index.ts"));
      }
    };
    for (const f of [...readdirSync("src/harness").map((f) => join("src/harness", f)), "src/scripts/e2e.ts"]) visit(f);
    expect([...seen].filter((f) => f.endsWith("src/utils/config.ts"))).toEqual([]);
  });

  it("CLI writes a passing report", () => {
    const out = mkdtempSync(join(tmpdir(), "e2e-"));
    const env = { ...process.env, LOG_LEVEL: "silent" };
    delete env.GEMINI_API_KEY;
    delete env.WEATHER_API_KEY;
    execFileSync("npx", ["tsx", "src/scripts/e2e.ts", "--as-of", AS_OF, "--out", out], { encoding: "utf8", env });
    const report = JSON.parse(readFileSync(join(out, "report.json"), "utf8"));
    expect(report.totals.fail).toBe(0);
    expect(readFileSync(join(out, "report.md"), "utf8")).toMatch(/End-to-end validation report/);
  }, 60_000);
});
