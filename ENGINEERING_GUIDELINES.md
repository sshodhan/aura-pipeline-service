# Engineering Guidelines

> **Purpose.** This file lists the canonical patterns new code must follow, and the
> known debt it must **not** copy. Most code here is written by agents that learn by
> imitating the code around them, and some of that code teaches the wrong lesson.
> When an existing file and this document disagree, **this document wins**.
>
> **Scope.** These are engineering patterns. Other material lives elsewhere:
>
> | Topic | Where |
> |---|---|
> | Architecture rules and local checks | `AGENTS.md` |
> | Phase designs | `docs/` (the read-first list in `AGENTS.md` is the doc map) |
> | Incidents | `BUG_REPORTS.md` |
> | General lessons | `SESSION_LEARNINGS_AND_REGRESSIONS.md` |
> | Pre-PR review | `.github/claude-review.md` |

---

## 1. Canonical patterns: route new code through these

### 1.1 The engine runs without keys

- `src/engine`, `src/knowledge`, `src/baseline` and `src/harness` never import
  `src/utils/config.ts`, directly or indirectly. It exits the process when
  `GEMINI_API_KEY` or `WEATHER_API_KEY` is unset.
- Models are injected through writers (`TemplateConceptWriter`,
  `ModelConceptWriter`, `TemplateOutfitWriter`, `ModelOutfitWriter`).
- Every capability has a deterministic template path and mock fixtures.
- **Enforced by:** `tests/unit/engine-plan.test.ts`, and the harness import
  walker in `tests/unit/e2e-harness.test.ts` (LESSON-20261128-e0cd).

### 1.2 Untrusted text reaches a model only as data

Evidence, request fields and anything a model wrote are untrusted:

- **Evidence:** `renderEvidenceAsData` (`src/knowledge/boundary.ts`).
- **Requests:** `renderRequestAsData` (`src/engine/prompt.ts`).
- **Concepts passed to the outfit stage:** `renderConceptsAsData`
  (`src/engine/outfit-prompt.ts`).

Revision feedback carries **issue codes, roles and field names only**, never
quoted text.

Free text never flows into a structured output field. Recognize it against a
vocabulary or leave it in the data block (LESSON-20261128-83fd).

**Enforced by:** the harness `adversarial` section.

### 1.3 Hard checks are separate from soft scores; status comes from the final validation

| Layer | Owner | Emits |
|---|---|---|
| Hard checks | `src/engine/validate.ts` (concepts), `src/engine/outfit-validate.ts` (outfits) | Typed issue codes, including `outfit_schema` for the published shape |
| Status and `errors` | `recommend()` | Derived from the validation of the exact outputs returned, after curation (LESSON-20261128-384d) |
| Editorial scores | Phase 4 rubric, `src/engine/quality.ts` | Scores that are advisory, uncalibrated, never presented as probabilities, and never derived from prose |

### 1.4 One rule, one definition

A rule that both a generator and a checker apply lives in one predicate,
called by both, plus the knowledge coverage rule where it applies
(LESSON-20261128-135d). If two sources must differ, for example tagged
vocabulary garments and untagged model garments, choose between them inside
that predicate, not in two copies.

Known exception: §2.2.

### 1.5 Budgets and fallbacks never loop

- Each model stage has a call cap: concepts 2, outfits 2, curation 1, so at
  most 5 per request.
- Each stage gets at most one revision.
- If the model can't produce a valid result within its budget, the stage falls
  back to the deterministic template. A fallback produces a candidate. It
  doesn't make the candidate valid; §1.3 still applies.

### 1.6 Knowledge changes go through the release ledger

- `npm run knowledge:release` is the only way to release a knowledge change.
  The ledger is append-only.
- External claims need `sourceCheck: checked_against_source`. Numbers need
  `basis: measured` with a dataset source.
- Records stay `provisional` until a named person approves them.
- A release must not change fixture output unless the PR says so. Show the
  comparison (§1.8).

### 1.7 The response contract is published and checked

- `outfitDraftSchema` (`src/engine/outfit-types.ts`) is the outfit contract.
  The validator checks it, so "validated" implies "conforms"
  (LESSON-20261128-4cad).
- A change to a request or response shape, a status value or an issue code
  updates `docs/CONSUMER_INTEGRATION_CONTRACT.md` and the owning phase doc in
  the same PR.
- Every consumer enum value has a test (LESSON-20261128-61fe).

### 1.8 Determinism and parity are stated, not assumed

- Template writers are deterministic.
- When a change shouldn't alter recommendations, compare the fixture outputs of
  `npm run concepts` and `npm run recommend` before and after, with timing and
  diagnostics stripped. State the result in the PR (LESSON-20261128-c5be).
- When a change touches selection, composition, validation or the garment
  vocabulary, also sweep every scenario against every preferred aesthetic: 220
  combinations today (LESSON-20261128-2ed4). The sweep becomes a harness check
  with BUG-20261128-d915.

### 1.9 Every bug fix leaves a trace

A bug fix needs:
- an entry in `BUG_REPORTS.md`;
- a regression test that fails before the fix;
- a general lesson in `SESSION_LEARNINGS_AND_REGRESSIONS.md`, if the same
  mistake could recur elsewhere.

The full loop is in `.github/claude-review.md` §2g.

---

## 2. Known debt: do NOT copy

### 2.1 The legacy nightly pipeline

`src/pipeline/stages`, `src/services`, `src/api` and `src/models` are the
original nightly pipeline:

- they import `config`;
- the scorer passes placeholder outfits;
- the cache key omits `colorEnergy`, so 83% of bundles are overwritten;
- several more defects are verified in `docs/PHASE_0_BASELINE.md` §8.

It's kept, behavior-preserved, for the Phase 0 baseline. Don't copy its
patterns into `src/engine`. Don't fix its defects in passing either: they're
documented, and changes there need their own PR.

### 2.2 Weather protection defined twice

The template and the coverage rule read garment `protects` tags. The validator
reads garment wording (`GARMENT_PATTERNS`). This is BUG-20261128-386c, open
pending a decision. Don't add a third definition. New protection logic goes
through whichever predicate that fix settles on.

### 2.3 Aspirational documents

`README.md` (the "V2 Evolution Plan"), `SIGNAL_CONTRACT.md` and
`SIGNAL_ARCHITECTURE_ROADMAP.md` have drifted from the code. Check the code
before relying on them. `docs/CONSUMER_INTEGRATION_CONTRACT.md` lists the
known drift.

### 2.4 No CI and no lint config

There's no CI workflow and no ESLint configuration, so `npm run lint` fails.
The local checks in `AGENTS.md` are the only gate. Run them before every push:
- `npm run typecheck`;
- `npm test`;
- `npm run e2e`;
- `npm run knowledge:status`.

---

## 3. Documentation rules

- **Label claims** as **Verified** (confirmed in code at a cited commit),
  **Planned** or **Assumption**.
- **Verify** claims about the code, numbers and the stack at the time of
  writing. Never copy them from an older document.
- **Detail lives in its phase document.** `AGENTS.md` stays a map and a rule
  list, not a diary.
- **Incidents** go to `BUG_REPORTS.md`. **Patterns** go to
  `SESSION_LEARNINGS_AND_REGRESSIONS.md`. **User-facing changes** go to
  `changelogs/unreleased.md`. **Manual-only checks** go to
  `REGRESSION_TESTING_CHECKLIST.md`.

## 4. In your PR

Don't just avoid the debt: say which pattern you followed. For each new model
call, request or response field, validator rule, knowledge change or writer,
state in the PR (or in the review summary of `.github/claude-review.md` §7)
which §1 pattern it goes through. If you touched a §2 area, leave it no bigger
than you found it.
