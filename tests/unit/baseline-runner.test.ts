import { describe, expect, it } from "vitest";

import { loadScenarios } from "../../src/baseline/fixtures";
import { MockTextModel } from "../../src/baseline/mock-model";
import { runBaseline, runScenario, summarize, renderSummaryMarkdown, type RunOptions } from "../../src/baseline/runner";
import { PIPELINE_TEXT_MODEL } from "../../src/utils/models";

const scenarios = loadScenarios();
const byId = (id: string) => scenarios.find((s) => s.id === id)!;

function options(overrides: Partial<RunOptions> = {}): RunOptions {
  return {
    provider: "mock",
    model: new MockTextModel(),
    modelId: PIPELINE_TEXT_MODEL,
    modelOverride: false,
    date: "2026-10-09",
    sleep: async () => {},
    ...overrides,
  };
}

describe("baseline runner (mock provider)", () => {
  it("runs every scenario and summarizes coverage, generation and calls", async () => {
    const opts = options();
    const results = await runBaseline(scenarios, opts);
    const summary = summarize(results, opts);

    expect(results).toHaveLength(scenarios.length);
    const unsupported = scenarios.filter((s) => s.baselineMapping.cityId === null).length;
    expect(summary.generation.skipped).toBe(unsupported);
    expect(summary.generation.ok).toBe(scenarios.length - unsupported);
    expect(summary.modelCalls).toBe(scenarios.length - unsupported);
    expect(summary.tokens).toBeNull(); // the mock reports no usage unless asked
    expect(summary.estimatedCostUsd).toBeNull();

    const md = renderSummaryMarkdown(summary, results);
    expect(md).toContain("NOT a quality baseline");
    expect(md.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Scenario") ).length).toBe(scenarios.length);
  });

  it("reports that the design brief's NYC casual hangout is never cached", async () => {
    const r = await runScenario(byId("nyc-casual-hangout-cool"), options());
    expect(r.coverage.inMatrix).toBe(false);
    expect(r.coverage.apiRetrieval).toBe("miss");
    expect(r.coverage.reasons).toEqual(
      expect.arrayContaining(["persona_not_prioritized_for_city", "occasion_not_prioritized_for_city"])
    );
    expect(r.inputLoss.dropped).toEqual(
      expect.arrayContaining(["demographics.genderExpression", "demographics.ageRange", "preferences.comfortPriority"])
    );
    expect(r.inputLoss.invented).toEqual(["vibe=laid_back", "colorEnergy=cool_calm"]);
  });

  it("flags excluded persona/occasion pairs and unsupported cities", async () => {
    const gala = await runScenario(byId("portland-gala-casual-lifestyle"), options());
    expect(gala.coverage.reasons).toContain("persona_occasion_incompatible");

    const london = await runScenario(byId("london-work-drizzle"), options());
    expect(london.coverage.reasons).toEqual(["city_not_supported"]);
    expect(london.generation).toEqual({ status: "skipped", reason: expect.stringContaining("London") });
    expect(london.diagnostics.modelCalls).toBe(0);
  });

  it("reports exact vs fuzzy retrieval and the colorEnergy cache-key collision", async () => {
    const date = await runScenario(byId("nyc-date-mild-clear"), options());
    expect(date.coverage.apiRetrieval).toBe("exact"); // mild + clear matches the route's hard-coded defaults

    const rain = await runScenario(byId("nyc-work-cold-rain"), options());
    expect(rain.coverage.inMatrix).toBe(true);
    expect(rain.coverage.apiRetrieval).toBe("fuzzy");
    expect(rain.coverage.entriesSharingCacheKey).toBe(6); // one per color energy
  });

  it("shows the rule-based scorer passes placeholder outfits", async () => {
    const r = await runScenario(byId("seattle-errands-rain"), options());
    expect(r.generation.status).toBe("ok");
    expect(r.quality?.mlScoring).toBe("skipped");
    // "[mock] placeholder" garments clear the orchestrator's publish threshold.
    expect(r.quality?.passesPublishThreshold).toBe(true);
  });

  it("records failures, retries, tokens and cost only when pricing is supplied", async () => {
    const failing = await runScenario(
      byId("seattle-errands-rain"),
      options({ model: new MockTextModel({ script: ["throw"] }) })
    );
    expect(failing.generation).toEqual({ status: "failed", error: "[mock] provider unavailable" });
    expect(failing.diagnostics.modelCalls).toBe(3);
    expect(failing.diagnostics.retries).toBe(2);
    expect(failing.quality).toBeNull();

    const priced = await runScenario(
      byId("seattle-errands-rain"),
      options({
        model: new MockTextModel({ reportUsage: true }),
        pricing: { inputPerMillionTokensUsd: 1, outputPerMillionTokensUsd: 2 },
      })
    );
    const t = priced.diagnostics.tokens!;
    expect(t.prompt).toBeGreaterThan(0);
    expect(priced.diagnostics.estimatedCostUsd).toBeCloseTo((t.prompt * 1 + t.output * 2) / 1e6, 10);
    expect(priced.diagnostics.promptSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("summarizes latency per model call and end to end, counting retries and failures", async () => {
    const opts = options();
    const retried = await runScenario(byId("seattle-errands-rain"), options({ model: new MockTextModel({ script: ["throw", "ok"] }) }));
    const failed = await runScenario(byId("nyc-work-cold-rain"), options({ model: new MockTextModel({ script: ["throw"] }) }));
    const skipped = await runScenario(byId("london-work-drizzle"), opts);
    expect(retried.diagnostics.modelCalls).toBe(2);
    expect(failed.generation.status).toBe("failed");

    // Give the attempts known latencies: the summary must not merge a scenario's attempts into one "call".
    const withLatency = (r: typeof retried, perAttempt: number[], wallClockMs: number) => ({
      ...r,
      diagnostics: {
        ...r.diagnostics,
        attempts: r.diagnostics.attempts.map((a, i) => ({ ...a, latencyMs: perAttempt[i]! })),
        modelLatencyMs: perAttempt.reduce((x, y) => x + y, 0),
        wallClockMs,
      },
    });
    const summary = summarize(
      [withLatency(retried, [100, 300], 1_400), withLatency(failed, [50, 60, 70], 3_200), skipped],
      opts
    );

    expect(summary.latencyMs).toEqual({ p50: 70, p95: 300, max: 300, calls: 5 }); // max is one call, not the 400 ms sum
    expect(summary.endToEndMs).toEqual({ p50: 1_400, p95: 3_200, max: 3_200, scenarios: 2 }); // skipped scenario excluded
    const md = renderSummaryMarkdown(summary, []);
    expect(md).toContain("Per-call model latency (all attempts, n=5): p50 70 ms, p95 300 ms, max 300 ms");
    expect(md).toContain("End-to-end per scenario (incl. retries and backoff, n=2)");
  });
});
