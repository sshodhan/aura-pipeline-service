/**
 * Style Direction Selection (Phase 2)
 *
 * Chooses the three aesthetics before any model runs, so the collection's
 * range is decided by inspectable rules rather than by a model's mood:
 *
 * - best_bet: the stated aesthetic preference that fits the context best, or
 *   else the strongest context fit (ties go to the more versatile aesthetic);
 * - adjacent: a strong fit that is measurably different from the best bet
 *   (stated preferences and the lifestyle's aesthetic are favored);
 * - exploration: the best-fitting aesthetic that is clearly different from both
 *   (falling back to the most different acceptable fit).
 *
 * "Fit" is formality and climate suitability from the aesthetic's editorial
 * profile (knowledge store); it is not a quality or popularity score. Gender
 * expression, age and city never enter the score.
 */

import { CLIMATE_BANDS, type AestheticProfile } from "../knowledge/schema";
import type { KnowledgeStore } from "../knowledge/store";
import type { AestheticCandidate, ConceptRole, DirectionAssignment, DirectionSelection, InterpretedContext } from "./types";

/** Adjacent must be at least this far (0–1) from the best bet. */
export const ADJACENT_MIN_DISTANCE = 0.45;
/** Past this distance from the best bet a direction is no longer "approachable". */
export const ADJACENT_MAX_DISTANCE = 0.6;
/** Exploration aims to be at least this far from both other directions. */
export const EXPLORATION_MIN_DISTANCE = 0.55;
/** Minimum fit for adjacent ("strong") and exploration ("acceptable"). */
export const STRONG_FIT = 0.6;
export const ACCEPTABLE_FIT = 0.4;

interface Profiled {
  aesthetic: string;
  evidenceId: string;
  title: string;
  profile: AestheticProfile;
  silhouettes: string[];
  materials: string[];
}

const tokens = (terms: string[]) => new Set(terms.flatMap((t) => t.split(/[\s-]+/)).filter(Boolean));

function jaccardDistance(a: Set<string>, b: Set<string>): number {
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return 1 - shared / union.size;
}

const center = (p: AestheticProfile) => (p.formality[0] + p.formality[1]) / 2;

/**
 * Attribute distance between two aesthetics, 0 (same) to 1 (unrelated):
 * silhouette and material vocabulary (texture) 25% each, formality center 20%,
 * expressiveness 30% (the clearest signal of a different aesthetic identity).
 */
export function aestheticDistance(a: Profiled, b: Profiled): number {
  const d =
    0.25 * jaccardDistance(tokens(a.silhouettes), tokens(b.silhouettes)) +
    0.25 * jaccardDistance(tokens(a.materials), tokens(b.materials)) +
    0.2 * (Math.abs(center(a.profile) - center(b.profile)) / 4) +
    0.3 * (Math.abs(a.profile.expressiveness - b.profile.expressiveness) / 4);
  return Math.round(d * 1000) / 1000;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function scoreCandidate(p: Profiled, interpreted: InterpretedContext): AestheticCandidate {
  const s = interpreted.signals;
  const [lo, hi] = s.formalityBand;
  const [amin, amax] = p.profile.formality;
  const reasons: string[] = [];
  let eligible = true;

  // Formality: the aesthetic's range must meet the occasion's band.
  let formality: number;
  const gap = amax < lo ? lo - amax : amin > hi ? amin - hi : 0;
  if (gap === 0) {
    const fromTarget = s.targetFormality < amin ? amin - s.targetFormality : s.targetFormality > amax ? s.targetFormality - amax : 0;
    formality = 1 - 0.2 * fromTarget;
    reasons.push(fromTarget === 0 ? `formality ${amin}–${amax} covers the target ${s.targetFormality}` : `formality ${amin}–${amax} meets the occasion band, ${fromTarget} from the target`);
  } else if (gap === 1 && !s.strictFormality) {
    formality = 0.35;
    reasons.push(`formality ${amin}–${amax} is one step outside the occasion band (stretch)`);
  } else {
    formality = 0;
    eligible = false;
    reasons.push(`formality ${amin}–${amax} does not suit the occasion band ${lo}–${hi}`);
  }

  // Climate: suited, one band away (needs adaptation), or unsuitable.
  let climate: number;
  const band = CLIMATE_BANDS.indexOf(s.climate);
  const nearest = Math.min(...p.profile.climates.map((c) => Math.abs(CLIMATE_BANDS.indexOf(c) - band)));
  if (nearest === 0) {
    climate = 1;
    reasons.push(`suits ${s.climate} weather`);
  } else if (nearest === 1) {
    climate = 0.45;
    reasons.push(`needs adapting for ${s.climate} weather (stretch)`);
  } else {
    climate = 0;
    eligible = false;
    reasons.push(`unsuited to ${s.climate} weather`);
  }

  const centerCloseness = 1 - Math.abs(center(p.profile) - s.targetFormality) / 4;
  const lifestyleMatch = s.lifestyleAesthetics.includes(p.aesthetic);
  const preferred = s.preferredAesthetics.includes(p.aesthetic);
  if (lifestyleMatch) reasons.push("matches the stated lifestyle");
  if (preferred) reasons.push("matches a stated aesthetic preference");

  const fit = eligible ? round(0.45 * formality + 0.35 * climate + 0.1 * centerCloseness + 0.1 * (lifestyleMatch ? 1 : 0)) : 0;
  return { aesthetic: p.aesthetic, evidenceId: p.evidenceId, title: p.title, eligible, fit, preferred, lifestyleMatch, reasons };
}

export function selectDirections(interpreted: InterpretedContext, store: KnowledgeStore, asOf: string): DirectionSelection {
  const notes: string[] = [];
  const profiled: Profiled[] = [];
  for (const { evidence: e } of store.query({ types: ["aesthetic_reference"], asOf })) {
    if (!e.profile) {
      notes.push(`${e.id} has no planning profile and cannot be selected`);
      continue;
    }
    profiled.push({ aesthetic: e.aesthetics[0]!, evidenceId: e.id, title: e.title, profile: e.profile, silhouettes: e.silhouettes, materials: e.materials });
  }
  const bySlug = new Map(profiled.map((p) => [p.aesthetic, p]));
  const candidates = profiled.map((p) => scoreCandidate(p, interpreted)).sort((a, b) => b.fit - a.fit || (a.aesthetic < b.aesthetic ? -1 : 1));
  const eligible = candidates.filter((c) => c.eligible);
  const dist = (a: AestheticCandidate, b: AestheticCandidate) => aestheticDistance(bySlug.get(a.aesthetic)!, bySlug.get(b.aesthetic)!);
  const versatility = (c: AestheticCandidate) => (5 - bySlug.get(c.aesthetic)!.profile.expressiveness) / 4;

  for (const phrase of interpreted.signals.unmatchedPreferences) notes.push(`stated preference "${phrase}" matches no defined aesthetic`);
  for (const slug of interpreted.signals.preferredAesthetics) {
    const c = candidates.find((x) => x.aesthetic === slug);
    if (c && !c.eligible) notes.push(`stated preference ${slug} does not suit this context: ${c.reasons.filter((r) => /does not|unsuited/.test(r)).join("; ")}`);
  }

  if (eligible.length < 3) {
    notes.push(`only ${eligible.length} aesthetic(s) suit this context; three distinct directions need at least three`);
    return { status: "insufficient_candidates", assignments: [], distances: [], candidates, notes };
  }

  // Best bet: a stated preference wins when it fits; otherwise the strongest fit, then the most versatile.
  const preferredEligible = eligible.filter((c) => c.preferred);
  const rankBest = (c: AestheticCandidate) => c.fit + 0.05 * versatility(c);
  const best = [...(preferredEligible.length > 0 ? preferredEligible : eligible)].sort((a, b) => rankBest(b) - rankBest(a))[0]!;

  // Adjacent: strong fit, measurably different, approachable (preferences and lifestyle favored).
  const rest = eligible.filter((c) => c !== best);
  // Beyond ADJACENT_MAX_DISTANCE a direction stops being approachable, so it is penalized (it suits exploration).
  const adjacentScore = (c: AestheticCandidate) =>
    c.fit + (c.preferred ? 0.25 : 0) + (c.lifestyleMatch ? 0.1 : 0) - Math.max(0, dist(c, best) - ADJACENT_MAX_DISTANCE);
  let adjacentPool = rest.filter((c) => c.fit >= STRONG_FIT && dist(c, best) >= ADJACENT_MIN_DISTANCE);
  const adjacentRelaxed = adjacentPool.length === 0;
  if (adjacentRelaxed) {
    adjacentPool = rest;
    notes.push("no strong, measurably different fit for adjacent; using the best remaining fit");
  }
  const adjacent = [...adjacentPool].sort((a, b) => adjacentScore(b) - adjacentScore(a))[0]!;

  // Exploration: clearly different from both (EXPLORATION_MIN_DISTANCE), then the best fit;
  // otherwise the most different acceptable fit.
  const remaining = rest.filter((c) => c !== adjacent);
  const minDist = (c: AestheticCandidate) => Math.min(dist(c, best), dist(c, adjacent));
  let explorationPool = remaining.filter((c) => c.fit >= ACCEPTABLE_FIT && minDist(c) >= EXPLORATION_MIN_DISTANCE);
  let explorationScore = (c: AestheticCandidate) => c.fit + 0.3 * minDist(c);
  if (explorationPool.length === 0) {
    explorationPool = remaining.filter((c) => c.fit >= ACCEPTABLE_FIT);
    explorationScore = (c) => minDist(c) + 0.5 * c.fit;
  }
  if (explorationPool.length === 0) {
    explorationPool = remaining;
    notes.push("no acceptable fit left for exploration; using the most different remaining aesthetic");
  }
  const exploration = [...explorationPool].sort((a, b) => explorationScore(b) - explorationScore(a))[0]!;
  if (minDist(exploration) < EXPLORATION_MIN_DISTANCE) {
    notes.push(`exploration is only ${minDist(exploration)} from the nearest direction (target ${EXPLORATION_MIN_DISTANCE})`);
  }

  const assign = (role: ConceptRole, c: AestheticCandidate, why: string): DirectionAssignment => ({
    role,
    aesthetic: c.aesthetic,
    evidenceId: c.evidenceId,
    title: c.title,
    fit: c.fit,
    reasons: [why, ...c.reasons],
  });
  const assignments = [
    assign("best_bet", best, best.preferred ? "the stated aesthetic preference that best fits the context" : "the strongest fit for the context"),
    assign(
      "adjacent",
      adjacent,
      adjacentRelaxed
        ? `the best remaining fit (distance ${dist(adjacent, best)} from the best bet)`
        : `a strong fit that differs measurably from the best bet (distance ${dist(adjacent, best)})`
    ),
    assign(
      "exploration",
      exploration,
      minDist(exploration) >= EXPLORATION_MIN_DISTANCE
        ? `the best fit that differs clearly from both other directions (distance ${minDist(exploration)} to the nearest)`
        : `the most different remaining fit (distance ${minDist(exploration)} to the nearest)`
    ),
  ];
  return {
    status: "ok",
    assignments,
    distances: [
      { a: "best_bet", b: "adjacent", distance: dist(best, adjacent) },
      { a: "best_bet", b: "exploration", distance: dist(best, exploration) },
      { a: "adjacent", b: "exploration", distance: dist(adjacent, exploration) },
    ],
    candidates,
    notes,
  };
}
