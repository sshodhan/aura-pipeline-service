/**
 * Phase 4 checks: the rubric and curation.
 *
 * - every outfit carries an assessment with four 1–5 scores, each with reasons;
 * - hard checks (Phase 3 validation) are reported apart from the editorial scores;
 * - the reported scores are reproducible from the returned outfits;
 * - praise words in the outfit's prose never change a score;
 * - curation never lowers any outfit's score, and stays within its budget;
 * - outfits left below the threshold are listed for a person;
 * - template repair (a stricter threshold) and model revision (a scripted
 *   model, codes only) both keep the collection valid.
 *
 * Deterministic: template writers and scripted models only, apart from the
 * collections the harness passes in.
 */

import type { Scenario } from "../baseline/fixtures";
import { toOutfitDrafts } from "../engine/compose";
import { DEFAULT_MAX_CURATION_CALLS } from "../engine/curate";
import { ModelOutfitWriter, TemplateOutfitWriter } from "../engine/outfit-writer";
import type { OutfitDraft, RecommendationCollection } from "../engine/outfit-types";
import { EVALUATOR_VERSION, QUALITY_DIMENSIONS, scoreCollection, totalScore } from "../engine/quality";
import { recommend } from "../engine/recommend";
import { TemplateConceptWriter } from "../engine/writer";
import { regionForScenario } from "../knowledge/coverage";
import type { KnowledgeStore } from "../knowledge/store";
import { contractProblems } from "./contract";
import { ScriptedModel, type HarnessCheck, type HarnessReport } from "./types";

/** The most model calls a request may make: concepts 2, outfits 2, curation 1. */
export const MAX_REQUEST_CALLS = 5;
/** A stricter threshold than the default, so the harness exercises revision on template output. */
export const STRICT_REVISE_BELOW = 4;

const HOLLOW = "perfect, elegant, flawless, effortlessly chic";
const MARKER = "zqx-inject";

/** Adds praise words to every prose field, leaving garment attributes alone. */
function withHollowWords(drafts: OutfitDraft[]): OutfitDraft[] {
  const praise = (s: string) => `${s} ${HOLLOW}.`;
  return drafts.map((d) => ({
    ...d,
    title: `${d.title} (${HOLLOW})`.slice(0, 80),
    layering: praise(d.layering),
    proportionStrategy: praise(d.proportionStrategy),
    colorStrategy: praise(d.colorStrategy),
    textureStrategy: praise(d.textureStrategy),
    stylingRationale: praise(d.stylingRationale),
    weatherNotes: praise(d.weatherNotes),
    proTip: praise(d.proTip),
    garments: d.garments.map((g) => ({ ...g, why: praise(g.why), details: praise(g.details ?? "") })),
  }));
}

const noSleep = async () => {};

export async function runQualityChecks(
  scenarios: Scenario[],
  collections: Map<string, RecommendationCollection>,
  store: KnowledgeStore,
  asOf: string
): Promise<{ checks: HarnessCheck[]; measurements: HarnessReport["measurements"] }> {
  const checks: HarnessCheck[] = [];
  const measurements: HarnessReport["measurements"] = {};
  const add = (id: string, ok: boolean, title: string, detail?: string, scenarioId?: string) =>
    checks.push({ section: "phase4-quality", id, scenarioId, status: ok ? "pass" : "fail", title, detail: ok ? undefined : detail });

  /** Final totals never below the first version's; revised outfits strictly above. */
  const neverWorse = (c: RecommendationCollection) =>
    (c.quality?.assessments ?? []).filter((a) => {
      const before = totalScore(c.quality!.initialScores[a.role]!);
      const after = totalScore(a.editorialAssessment);
      return after < before || (a.outcome === "revised" && after <= before);
    });

  let outfits = 0;
  let revised = 0;
  let lowConfidence = 0;
  const sums = Object.fromEntries(QUALITY_DIMENSIONS.map((d) => [d, 0])) as Record<(typeof QUALITY_DIMENSIONS)[number], number>;

  for (const scenario of scenarios) {
    const id = scenario.id;
    const c = collections.get(id);
    if (!c || c.recommendations.length === 0) {
      add("assessed", false, "Every outfit carries a rubric assessment", `no outfits (${c?.status ?? "missing"})`, id);
      continue;
    }
    const q = c.quality;
    const assessments = c.recommendations.map((r) => r.quality);
    const malformed = assessments.flatMap((a, i) => {
      const role = c.recommendations[i]!.role;
      if (!a) return [`${role}: no assessment`];
      return QUALITY_DIMENSIONS.flatMap((d) => {
        const v = a.editorialAssessment[d];
        if (!Number.isInteger(v) || v < 1 || v > 5) return [`${role}.${d} = ${v}`];
        if (a.reasons[d].length === 0) return [`${role}.${d} has no reasons`];
        return [];
      }).concat(a.evaluatorVersion === EVALUATOR_VERSION ? [] : [`${role}: evaluator ${a.evaluatorVersion}`]);
    });
    add("assessed", Boolean(q) && malformed.length === 0, "Every outfit carries four 1–5 rubric scores, each with its reasons", malformed.join("; ") || "no quality", id);
    if (!q) continue;

    const mixed = q.assessments.filter((a) => {
      const codes = (c.validation.outfits?.issues ?? []).filter((i) => i.role === a.role).map((i) => i.code);
      return a.hardChecks.passed !== (codes.length === 0) || a.hardChecks.violations.join() !== codes.join() || (a.outcome === "rejected") !== !a.hardChecks.passed;
    });
    add("hard-soft-separate", mixed.length === 0, "Hard checks are reported apart from the editorial scores and match validation", mixed.map((a) => a.role).join(", "), id);

    const drafts = toOutfitDrafts(c.recommendations.map((r) => r.outfit));
    const rescored = scoreCollection({ outfits: drafts, interpreted: c.interpreted!, store });
    const drift = rescored.filter((r) => QUALITY_DIMENSIONS.some((d) => r.scores[d] !== q.assessments.find((a) => a.role === r.role)?.editorialAssessment[d]));
    add("reproducible", drift.length === 0, "Rescoring the returned outfits reproduces the reported scores", drift.map((r) => r.role).join(", "), id);

    const praised = scoreCollection({ outfits: withHollowWords(drafts), interpreted: c.interpreted!, store });
    const moved = praised.filter((r) => JSON.stringify(r.scores) !== JSON.stringify(rescored.find((x) => x.role === r.role)?.scores));
    add("hollow-words", moved.length === 0, `Praise words in the prose ("${HOLLOW}") never change a score`, moved.map((r) => r.role).join(", "), id);

    const worse = neverWorse(c);
    add("never-worse", worse.length === 0, "Curation never lowers an outfit's score; a kept revision raises it", worse.map((a) => a.role).join(", "), id);

    const curation = c.diagnostics.curation;
    add(
      "budget",
      Boolean(curation) && curation!.modelCalls <= DEFAULT_MAX_CURATION_CALLS && c.diagnostics.totalModelCalls <= MAX_REQUEST_CALLS,
      `At most ${DEFAULT_MAX_CURATION_CALLS} curation call and ${MAX_REQUEST_CALLS} model calls per request`,
      `curation ${curation?.modelCalls ?? "–"}, total ${c.diagnostics.totalModelCalls}`,
      id
    );

    if (q.lowConfidence.length > 0) {
      checks.push({
        section: "phase4-quality",
        id: "low-confidence",
        scenarioId: id,
        status: "manual",
        title: "Outfits still below the rubric threshold after one revision: a person should read them",
        detail: q.lowConfidence.map((role) => `${role}: ${q.assessments.find((a) => a.role === role)?.issueCodes.join(", ")}`).join("; "),
      });
    } else add("low-confidence", true, "No outfit is left below the rubric threshold", undefined, id);

    outfits += q.assessments.length;
    revised += q.revisedRoles.length;
    lowConfidence += q.lowConfidence.length;
    for (const a of q.assessments) for (const d of QUALITY_DIMENSIONS) sums[d] += a.editorialAssessment[d];
  }
  for (const d of QUALITY_DIMENSIONS) measurements[`phase4.mean.${d}`] = outfits > 0 ? Math.round((sums[d] / outfits) * 100) / 100 : 0;
  measurements["phase4.revised"] = revised;
  measurements["phase4.lowConfidence"] = lowConfidence;

  // Template repair, exercised with a stricter threshold.
  const template = { conceptWriter: new TemplateConceptWriter(), outfitWriter: new TemplateOutfitWriter(), asOf };
  let strictRevised = 0;
  let strictLow = 0;
  const strictProblems: string[] = [];
  let repaired: { scenario: Scenario; first: OutfitDraft[]; better: OutfitDraft[] } | null = null;
  for (const scenario of scenarios) {
    const region = regionForScenario(scenario);
    const c = await recommend(scenario.context, store, { ...template, region, reviseBelow: STRICT_REVISE_BELOW });
    const problems = [...contractProblems(c), ...neverWorse(c).map((a) => `${a.role} scored worse`)];
    if (c.diagnostics.totalModelCalls !== 0 || (c.quality && c.quality.revisedRoles.length + c.quality.lowConfidence.length > 0 && c.diagnostics.curation?.mode !== "template_repair")) {
      problems.push(`mode ${c.diagnostics.curation?.mode}, ${c.diagnostics.totalModelCalls} calls`);
    }
    if (problems.length > 0) strictProblems.push(`${scenario.id}: ${problems.join("; ")}`);
    strictRevised += c.quality?.revisedRoles.length ?? 0;
    strictLow += c.quality?.lowConfidence.length ?? 0;
    if (!repaired && (c.quality?.revisedRoles.length ?? 0) > 0) {
      const first = await recommend(scenario.context, store, { ...template, region, curate: false });
      repaired = { scenario, first: toOutfitDrafts(first.recommendations.map((r) => r.outfit)), better: toOutfitDrafts(c.recommendations.map((r) => r.outfit)) };
    }
  }
  add(
    "template-repair",
    strictProblems.length === 0 && strictRevised > 0,
    `Template repair at threshold ${STRICT_REVISE_BELOW} revises outfits without model calls, keeps every collection valid and never lowers a score`,
    strictProblems.join(" | ") || `${strictRevised} revisions`
  );
  measurements["phase4.strict.revised"] = strictRevised;
  measurements["phase4.strict.lowConfidence"] = strictLow;

  // Model revision: one call, issue codes only; the better version is kept, a failed revision is not.
  if (repaired) {
    const { scenario, first, better } = repaired;
    const region = regionForScenario(scenario);
    const firstWithMarker = first.map((d) => ({ ...d, proTip: `${d.proTip} ${MARKER}`.slice(0, 300) }));
    const good = new ScriptedModel([JSON.stringify({ outfits: firstWithMarker }), JSON.stringify({ outfits: better })]);
    const c = await recommend(scenario.context, store, {
      conceptWriter: new TemplateConceptWriter(),
      outfitWriter: new ModelOutfitWriter(good, "scripted"),
      asOf,
      region,
      reviseBelow: STRICT_REVISE_BELOW,
      sleep: noSleep,
    });
    const revision = good.prompts[1] ?? "";
    const codes = c.quality?.assessments.flatMap((a) => a.revisionInstructions ?? []) ?? [];
    add(
      "model-revision",
      c.diagnostics.curation?.mode === "model_revision" &&
        c.diagnostics.curation.modelCalls === 1 &&
        (c.quality?.revisedRoles.length ?? 0) > 0 &&
        contractProblems(c).length === 0 &&
        codes.length > 0 &&
        codes.every((code) => revision.includes(code)) &&
        !revision.includes(MARKER),
      "A model revises weak outfits in one call from issue codes only, and the better version is kept",
      `mode ${c.diagnostics.curation?.mode}, calls ${c.diagnostics.curation?.modelCalls}, revised ${c.quality?.revisedRoles.join(", ") || "none"}, marker echoed ${revision.includes(MARKER)}`
    );

    const broken = new ScriptedModel([JSON.stringify({ outfits: first }), "not json"]);
    const kept = await recommend(scenario.context, store, {
      conceptWriter: new TemplateConceptWriter(),
      outfitWriter: new ModelOutfitWriter(broken, "scripted"),
      asOf,
      region,
      reviseBelow: STRICT_REVISE_BELOW,
      sleep: noSleep,
    });
    const flagged = kept.quality?.assessments.filter((a) => a.decision === "revise").map((a) => a.role) ?? [];
    add(
      "failed-revision-kept",
      kept.diagnostics.curation?.modelCalls === 1 &&
        kept.diagnostics.totalModelCalls === 2 &&
        (kept.quality?.revisedRoles.length ?? -1) === 0 &&
        flagged.length > 0 &&
        flagged.every((role) => kept.quality!.lowConfidence.includes(role)) &&
        contractProblems(kept).length === 0,
      "A failed model revision keeps the original outfits and flags the weak ones low_confidence",
      `calls ${kept.diagnostics.totalModelCalls}, revised ${kept.quality?.revisedRoles.join(", ")}, low ${kept.quality?.lowConfidence.join(", ")}`
    );
  } else {
    add("model-revision", false, "A model revises weak outfits in one call from issue codes only", "no scenario needed revision at the strict threshold");
  }

  return { checks, measurements };
}
