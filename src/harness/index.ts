/**
 * End-to-end validation harness.
 *
 * runHarness() exercises every phase against the 20 benchmark scenarios and
 * returns a report of checks (pass / fail / manual / skipped):
 *
 *   phase0-baseline      the current pipeline still behaves as PHASE_0_BASELINE.md says
 *   phase1-knowledge     the knowledge corpus and release ledger are valid and honest
 *   phase2-concepts      three valid, distinct style directions per scenario
 *   phase3-outfits       three valid, schema-conformant, distinct outfits per scenario
 *   phase4-quality       rubric scores with reasons, hollow-word invariance, curation never worse, budget
 *   input-parity         every input the current pipeline drops reaches the new engine
 *   fixture-expectations each scenario's own expectedConstraints, checked where a rule exists
 *   adversarial          prompt injection, invalid input, broken models, the call budget
 *   consumer-adapter     how each outfit maps onto the consumer's four garment slots
 *   live-model           a real-model run, when writers for one are supplied
 *
 * Key-free by default (template writers, mock and scripted models). Pass model
 * writers to run phases 2–4 against a real model; the adversarial section
 * and the curation probes always use scripted models so they stay
 * deterministic.
 */

import type { Scenario } from "../baseline/fixtures";
import { computeInputLoss, analyzeCallVolume } from "../baseline/analysis";
import { MockTextModel } from "../baseline/mock-model";
import { runBaseline, summarize } from "../baseline/runner";
import { ADJACENT_MIN_DISTANCE } from "../engine/directions";
import { garmentCoverageGaps } from "../engine/garments";
import { RECOMMEND_ENGINE_VERSION, type RecommendationCollection } from "../engine/outfit-types";
import { TemplateOutfitWriter, type OutfitWriter } from "../engine/outfit-writer";
import { recommend } from "../engine/recommend";
import { ENGINE_VERSION } from "../engine/types";
import { TemplateConceptWriter, type ConceptWriter } from "../engine/writer";
import { regionForScenario, scenarioCoverage } from "../knowledge/coverage";
import { assessFreshness } from "../knowledge/freshness";
import { readKnowledge, type KnowledgeStore } from "../knowledge/store";
import { PIPELINE_TEXT_MODEL } from "../utils/models";
import { adapterFeasibility } from "./adapter";
import { runAdversarialChecks } from "./adversarial";
import { contractProblems } from "./contract";
import { checkExpectations } from "./expectations";
import { runQualityChecks } from "./quality";
import { HARNESS_SECTIONS, type CheckStatus, type HarnessCheck, type HarnessReport, type HarnessSection } from "./types";

export const HARNESS_VERSION = "e2e-0.2";
/** The date PHASE_0_BASELINE.md was measured on; Phase 0 claims are checked at that date. */
export const PHASE0_DOC_DATE = "2026-10-09";

export interface HarnessOptions {
  store: KnowledgeStore;
  scenarios: Scenario[];
  /** YYYY-MM-DD for phases 1–4. */
  asOf: string;
  /** Default: template writers (key-free). */
  conceptWriter?: ConceptWriter;
  outfitWriter?: OutfitWriter;
  sleep?: (ms: number) => Promise<void>;
  gitCommit?: string | null;
}

const noSleep = async () => {};

export async function runHarness(options: HarnessOptions): Promise<HarnessReport> {
  const startedAt = Date.now();
  const { store, scenarios, asOf } = options;
  const conceptWriter = options.conceptWriter ?? new TemplateConceptWriter();
  const outfitWriter = options.outfitWriter ?? new TemplateOutfitWriter();
  const live = conceptWriter.mode === "model" || outfitWriter.mode === "model";
  const checks: HarnessCheck[] = [];
  const measurements: HarnessReport["measurements"] = {};
  const check = (section: HarnessSection, id: string, ok: boolean, title: string, detail?: string, scenarioId?: string) =>
    checks.push({ section, id, scenarioId, status: ok ? "pass" : "fail", title, detail: ok ? undefined : detail });

  // ---------------------------------------------------------------------------
  // Phase 0: the current pipeline, as PHASE_0_BASELINE.md describes it.
  // ---------------------------------------------------------------------------
  {
    const opts = { provider: "mock" as const, model: new MockTextModel(), modelId: PIPELINE_TEXT_MODEL, modelOverride: false, date: PHASE0_DOC_DATE, sleep: noSleep };
    const results = await runBaseline(scenarios, opts);
    const s = summarize(results, opts);
    const claim = (id: string, actual: number, expected: number, title: string) =>
      check("phase0-baseline", id, actual === expected, title, `documented ${expected}, measured ${actual}`);
    claim("cities-supported", s.coverage.citySupported, 18, "18 of 20 scenarios are in a supported city");
    claim("in-matrix", s.coverage.inMatrix, 10, "10 of 20 scenarios can be served from the nightly matrix");
    claim("exact-retrieval", s.coverage.servedExact, 1, "1 scenario is retrievable through the exact cache key");
    claim("fuzzy-retrieval", s.coverage.servedFuzzy, 9, "9 scenarios are retrievable only through the fuzzy scan");
    claim("mock-generation-ok", s.generation.ok, 18, "The mock run generates for every supported scenario");
    claim("placeholder-publishable", s.publishable, 18, "Placeholder outfits all pass the publish threshold (the scorer ignores content)");
    const nyc = results.find((r) => r.scenario.id === "nyc-casual-hangout-cool");
    check("phase0-baseline", "design-brief-miss", nyc?.coverage.apiRetrieval === "miss", "The design brief's own NYC example is never served", `retrieval ${nyc?.coverage.apiRetrieval}`);
    const volume = analyzeCallVolume(PHASE0_DOC_DATE, new Date(`${PHASE0_DOC_DATE}T12:00:00Z`).getUTCMonth());
    claim("nightly-calls", volume.totals.geminiCallsPerRun, 894, "The nightly run makes 894 Gemini calls");
    claim("distinct-bundles", volume.totals.distinctBundleKeys, 149, "Only 149 distinct bundle keys survive");
    claim("overwritten-bundles", volume.totals.overwrittenBundles, 745, "745 bundles are overwritten (the cache key omits colorEnergy)");
    measurements["phase0.droppedInputs"] = results.reduce((n, r) => n + r.inputLoss.dropped.length, 0);
  }

  // ---------------------------------------------------------------------------
  // Phase 1: knowledge corpus and release ledger.
  // ---------------------------------------------------------------------------
  {
    const read = readKnowledge();
    check("phase1-knowledge", "content-valid", read.issues.length === 0, "The corpus passes schema and integrity checks", read.issues.join("; "));
    check("phase1-knowledge", "release-discipline", read.releaseIssues.length === 0, "Content matches the latest release in the append-only ledger", read.releaseIssues.join("; "));
    const versions = read.snapshot?.releases.map((r) => r.version) ?? [];
    check("phase1-knowledge", "ledger-current", read.snapshot?.knowledgeVersion === store.knowledgeVersion && versions.at(-1) === store.knowledgeVersion, "The loaded store is the latest release", `store ${store.knowledgeVersion}, ledger ${versions.at(-1)}`);
    const unchecked = read.evidence.filter((e) => e.basis !== "editorial_judgment" && e.sourceCheck?.status !== "checked_against_source");
    check("phase1-knowledge", "no-unchecked-external-claims", unchecked.length === 0, "No external claim is used without a source check", unchecked.map((e) => e.id).join(", "));
    const expired = read.evidence.filter((e) => assessFreshness(e, asOf).validity !== "current");
    measurements["phase1.records"] = read.evidence.length;
    measurements["phase1.expiredOrNotYetValid"] = expired.length;
    measurements["phase1.approvedRecords"] = read.evidence.filter((e) => e.editorialStatus === "approved").length;
    const rows = scenarioCoverage(store, scenarios, asOf);
    const dishonest = rows.filter((r) => (r.counts.regional_influence === 0 && !r.notes.some((n) => n.startsWith("no regional"))) || (r.counts.contemporary_observation === 0 && !r.notes.some((n) => n.startsWith("no current contemporary"))));
    check("phase1-knowledge", "coverage-honest", dishonest.length === 0, "Missing regional and contemporary knowledge is stated for every scenario, not filled in", dishonest.map((r) => r.scenarioId).join(", "));
    check("phase1-knowledge", "coverage-durable", rows.every((r) => r.counts.timeless_principle > 0 && r.counts.aesthetic_reference >= 3), "Every scenario can draw on principles and at least three aesthetics");
    for (const { evidence } of store.query({ types: ["aesthetic_reference"], asOf })) {
      const gaps = evidence.profile ? garmentCoverageGaps(evidence.profile) : ["no profile"];
      check("phase1-knowledge", `garment-coverage-${evidence.id}`, gaps.length === 0, `${evidence.title} can dress every climate and formality it claims`, gaps.join("; "));
    }
  }

  // ---------------------------------------------------------------------------
  // Phases 2–4 and everything that reads their output: one recommend() per scenario.
  // ---------------------------------------------------------------------------
  const collections = new Map<string, RecommendationCollection>();
  let adapterDirect = 0;
  let adapterDressOnly = 0;
  let adapterNoOuter = 0;
  let adapterUnslotted = 0;
  let modelCalls = 0;
  let conceptFallbacks = 0;
  let outfitFallbacks = 0;
  for (const scenario of scenarios) {
    const id = scenario.id;
    const c = await recommend(scenario.context, store, { conceptWriter, outfitWriter, asOf, region: regionForScenario(scenario), sleep: options.sleep });
    collections.set(id, c);
    modelCalls += c.diagnostics.totalModelCalls;
    if (c.diagnostics.concepts.generationMode === "template_fallback") conceptFallbacks++;
    if (c.diagnostics.outfits?.generationMode === "template_fallback") outfitFallbacks++;

    // Phase 2
    const sel = c.selection;
    check("phase2-concepts", "valid", Boolean(c.validation.concepts?.passed), "Concepts pass every structural check", c.validation.concepts?.issues.map((i) => `${i.role}: ${i.message}`).join("; ") ?? c.errors.join("; "), id);
    check("phase2-concepts", "distinct", new Set(c.recommendations.map((r) => r.concept.aesthetic)).size === 3, "Three distinct aesthetics", c.recommendations.map((r) => r.concept.aesthetic).join(", "), id);
    const adj = sel?.distances.find((d) => d.b === "adjacent")?.distance ?? 0;
    check("phase2-concepts", "adjacent-distance", adj >= ADJACENT_MIN_DISTANCE, `Adjacent differs from the best bet by at least ${ADJACENT_MIN_DISTANCE}`, `distance ${adj}`, id);
    const prefs = c.interpreted?.signals.preferredAesthetics ?? [];
    if (prefs.length > 0) {
      const best = c.recommendations[0]?.concept.aesthetic;
      check("phase2-concepts", "preference-honored", Boolean(best && prefs.includes(best)), "A stated aesthetic preference becomes the best bet", `best bet ${best}; preferences ${prefs.join(", ")}`, id);
    }

    // Phase 3
    const problems = contractProblems(c);
    check("phase3-outfits", "contract", c.recommendations.length === 3 && problems.length === 0, "Three outfits that pass every check and conform to the schema", problems.join("; ") || c.status, id);
    const slots = c.validation.outfits?.differingCoreSlots.map((x) => x.slots) ?? [];
    check("phase3-outfits", "distinct-garments", slots.length === 3 && slots.every((n) => n >= 2), "Every pair of outfits differs in at least two core garments", `differing ${slots.join("/")}`, id);
    check("phase3-outfits", "linked", c.recommendations.every((r) => r.outfit.conceptId === r.concept.id && r.outfit.aesthetic === r.concept.aesthetic), "Each outfit belongs to its concept", undefined, id);
    const stageCalls = c.diagnostics.concepts.modelCalls + (c.diagnostics.outfits?.modelCalls ?? 0);
    check("phase3-outfits", "budget", stageCalls <= 4, "At most 4 model calls for concepts and outfits", `${stageCalls} calls`, id);
    if (!live) {
      const again = await recommend(scenario.context, store, { conceptWriter, outfitWriter, asOf, region: regionForScenario(scenario) });
      const strip = (x: RecommendationCollection) => JSON.stringify({ ...x, diagnostics: null });
      check("phase3-outfits", "deterministic", strip(again) === strip(c), "Template output is identical on a second run", undefined, id);
    }

    // Input parity: what the current pipeline drops, the engine carries.
    const s = c.interpreted?.signals;
    for (const field of computeInputLoss(scenario).dropped) {
      const ctx = scenario.context;
      const carried =
        field === "demographics.genderExpression" ? s?.genderExpression === ctx.demographics?.genderExpression
        : field === "demographics.ageRange" ? s?.ageRange === ctx.demographics?.ageRange
        : field === "preferences.preferredColors" ? (ctx.preferences?.preferredColors ?? []).every((x) => s?.preferredColors.includes(x.toLowerCase()))
        : field === "preferences.avoidedColors" ? (ctx.preferences?.avoidedColors ?? []).every((x) => s?.avoidedColors.includes(x.toLowerCase()))
        : field === "preferences.fit" ? s?.fit === ctx.preferences?.fit?.toLowerCase()
        : field === "preferences.comfortPriority" ? Boolean(c.interpreted?.explicitPreferences.some((p) => p.startsWith("Comfort:")))
        : field.startsWith("preferences.preferredAesthetics") ? (ctx.preferences?.preferredAesthetics ?? []).every((a) => c.interpreted?.explicitPreferences.some((p) => p.includes(`"${a.toLowerCase()}"`)))
        : false;
      check("input-parity", field.split(" ")[0]!, carried, `Dropped by the current pipeline, used by the engine: ${field}`, "not found in the interpreted context", id);
    }

    // Fixture expectations.
    for (const r of checkExpectations(scenario, c)) {
      checks.push({ section: "fixture-expectations", id: r.rule, scenarioId: id, status: r.status, title: r.expectation, detail: r.status === "pass" ? undefined : r.detail });
    }

    // Consumer adapter feasibility.
    for (const { outfit } of c.recommendations) {
      const f = adapterFeasibility(outfit);
      if (f.mapsDirectly) adapterDirect++;
      if (f.dressOnly) adapterDressOnly++;
      if (f.noOuterLayer) adapterNoOuter++;
      if (f.unslottedAccessories.length > 0) adapterUnslotted++;
      const open = [f.dressOnly && "dress-only look", f.noOuterLayer && "no outer layer", f.unslottedAccessories.length > 0 && `no slot for ${f.unslottedAccessories.join(", ")}`].filter(Boolean);
      checks.push({
        section: "consumer-adapter",
        id: `slots-${f.role}`,
        scenarioId: id,
        status: f.badNames.length > 0 ? "fail" : open.length > 0 ? "manual" : "pass",
        title: `${f.role} outfit maps onto the consumer's four garment slots`,
        detail: f.badNames.length > 0 ? `undisplayable names: ${f.badNames.join(", ")}` : open.length > 0 ? `open contract question (§A9): ${open.join("; ")}` : undefined,
      });
    }
  }
  measurements["phase3.modelCalls"] = modelCalls;
  measurements["phase3.conceptFallbacks"] = conceptFallbacks;
  measurements["phase3.outfitFallbacks"] = outfitFallbacks;
  measurements["adapter.outfits"] = scenarios.length * 3;
  measurements["adapter.mapsDirectly"] = adapterDirect;
  measurements["adapter.noOuterLayer"] = adapterNoOuter;
  measurements["adapter.dressOnly"] = adapterDressOnly;
  measurements["adapter.unslottedAccessories"] = adapterUnslotted;

  // ---------------------------------------------------------------------------
  // Phase 4: rubric and curation, on the collections above plus scripted probes.
  // ---------------------------------------------------------------------------
  {
    const quality = await runQualityChecks(scenarios, collections, store, asOf);
    checks.push(...quality.checks);
    Object.assign(measurements, quality.measurements);
  }

  // ---------------------------------------------------------------------------
  // Adversarial (always scripted models).
  // ---------------------------------------------------------------------------
  const probe = scenarios.find((s) => s.id === "chicago-work-snow") ?? scenarios[0]!;
  checks.push(...(await runAdversarialChecks(probe, store, asOf)));

  // ---------------------------------------------------------------------------
  // Live model.
  // ---------------------------------------------------------------------------
  if (!live) {
    checks.push({ section: "live-model", id: "not-run", status: "skipped", title: "Real-model run", detail: "template writers; run with --writer gemini and GEMINI_API_KEY" });
  } else {
    checks.push({
      section: "live-model",
      id: "fallback-rate",
      status: "manual",
      title: "Real-model run: read the outfits; fallbacks show where the model could not meet the checks",
      detail: `${modelCalls} calls; concept fallbacks ${conceptFallbacks}/${scenarios.length}; outfit fallbacks ${outfitFallbacks}/${scenarios.length}`,
    });
  }

  const totals = { pass: 0, fail: 0, manual: 0, skipped: 0 } as Record<CheckStatus, number>;
  const bySection = Object.fromEntries(HARNESS_SECTIONS.map((s) => [s, { pass: 0, fail: 0, manual: 0, skipped: 0 }])) as HarnessReport["bySection"];
  for (const c of checks) {
    totals[c.status]++;
    bySection[c.section][c.status]++;
  }
  return {
    harnessVersion: HARNESS_VERSION,
    asOf,
    writer: live ? "gemini" : "template",
    modelId: conceptWriter.modelId,
    knowledgeVersion: store.knowledgeVersion,
    engineVersions: { concepts: ENGINE_VERSION, recommend: RECOMMEND_ENGINE_VERSION },
    gitCommit: options.gitCommit ?? null,
    durationMs: Date.now() - startedAt,
    totals,
    bySection,
    checks,
    measurements,
  };
}

export function renderHarnessMarkdown(report: HarnessReport): string {
  const lines = [
    "# End-to-end validation report",
    "",
    `- Harness ${report.harnessVersion}; writer ${report.writer}${report.modelId ? ` (${report.modelId})` : ""}; engines ${report.engineVersions.concepts} / ${report.engineVersions.recommend}; knowledge ${report.knowledgeVersion}; as of ${report.asOf}; commit ${report.gitCommit ?? "unknown"}; ${report.durationMs} ms`,
    `- **${report.totals.fail === 0 ? "PASS" : "FAIL"}**: ${report.totals.pass} pass, ${report.totals.fail} fail, ${report.totals.manual} need a person, ${report.totals.skipped} skipped`,
    report.writer === "template"
      ? "- Template writers: this run proves the plumbing, the checks and the contracts. It says nothing about editorial quality."
      : "- Real-model run: structure is checked automatically; quality still needs a person to read the outfits.",
    "",
    "| Section | Pass | Fail | Manual | Skipped |",
    "|---|---|---|---|---|",
    ...HARNESS_SECTIONS.map((s) => {
      const b = report.bySection[s];
      return `| ${s} | ${b.pass} | ${b.fail} | ${b.manual} | ${b.skipped} |`;
    }),
    "",
    "## Measurements",
    "",
    ...Object.entries(report.measurements).map(([k, v]) => `- ${k}: ${v}`),
    "",
  ];
  const fails = report.checks.filter((c) => c.status === "fail");
  if (fails.length > 0) {
    lines.push("## Failures", "");
    for (const c of fails) lines.push(`- **${c.section}** ${c.scenarioId ? `\`${c.scenarioId}\` ` : ""}${c.title}${c.detail ? `: ${c.detail}` : ""}`);
    lines.push("");
  }
  const manual = report.checks.filter((c) => c.status === "manual");
  if (manual.length > 0) {
    lines.push("## Needs a person", "");
    const byScenario = new Map<string, HarnessCheck[]>();
    for (const c of manual) byScenario.set(c.scenarioId ?? "(run)", [...(byScenario.get(c.scenarioId ?? "(run)") ?? []), c]);
    for (const [sid, list] of byScenario) lines.push(`- \`${sid}\`: ${list.map((c) => `${c.title}${c.detail ? ` (${c.detail})` : ""}`).join("; ")}`);
    lines.push("");
  }
  return lines.join("\n");
}
