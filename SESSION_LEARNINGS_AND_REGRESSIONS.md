# Session Learnings and Regressions

This file records the general lessons behind this repository's bugs, so the
same class of mistake doesn't recur in a sibling module. `BUG_REPORTS.md`
records each incident. This file records **the pattern**: what to check next
time, and which files share the risk.

- **IDs.** Lesson IDs are `LESSON-YYYYMMDD-xxxx`: the date the lesson was
  learned (UTC) and four random hex digits. Mint one with
  `npm run lesson:id`. Parallel PRs never collide. Cite a lesson by its ID from
  PRs, bug entries and reviews. Never reuse one.
- **Reinforce, don't duplicate.** If a lesson already covers a new incident,
  add the incident to that lesson.
- **What isn't a lesson.** A pure one-off (a typo, a copy tweak, a version
  bump) doesn't get one.
- **Format.** `tests/unit/memory-docs.test.ts` checks it: every lesson has
  the required parts and a line in Key Takeaways, and every cited ID exists.

---

## Key Takeaways

- **One rule, one definition.** Generator, coverage check and validator must
  share one predicate (LESSON-20261128-135d, BUG-20261128-386c).
- **Check combinations, not dimensions.** A rule checked one dimension at a
  time misses the combination the engine actually meets (LESSON-20261128-2ed4,
  BUG-20261128-a9a4).
- **An override keeps the person's choice and still reports the gap.** Offer
  the better option after it, like a good store attendant
  (LESSON-20261128-3828, BUG-20261128-d915).
- **Status comes from the final validation**, never from "the code path
  finished" (LESSON-20261128-384d).
- **Text built from upstream text is held to the downstream schema at the
  boundary.** "Validated" must imply "conforms" (LESSON-20261128-4cad).
- **Test the contract's literal vocabulary**, not only realistic phrasings of
  it (LESSON-20261128-61fe).
- **Validate meaning, not shape.** A well-formed string can still be an
  impossible value (LESSON-20261128-6e2d).
- **Never treat "unreadable" as "absent" before a write**
  (LESSON-20261128-757c).
- **When a rule cites a principle, implement what the principle says**
  (LESSON-20261128-7a38).
- **Free text never flows into structured output.** Recognize it against a
  vocabulary, or leave it in the data block (LESSON-20261128-83fd).
- **Measure per unit, then aggregate.** A sum per scenario is not a per-call
  latency (LESSON-20261128-b3b0).
- **Save what you ask a person to judge, from the run that was checked**
  (LESSON-20261128-b4ac).
- **Stacked PRs merge bottom-up with merge commits**, each retargeted to the
  base before it merges (LESSON-20261128-c5bd).
- **Strip nondeterministic fields before diffing output**, then say exactly
  what was compared (LESSON-20261128-c5be).
- **Import-graph checks skip type-only imports and carry a positive control**
  (LESSON-20261128-e0cd).

---

## LESSON-20261128-135d: One rule, one definition

**Context.** In windy Chicago, three styles failed "outer layer is not
wind-resistant" with coats the garment vocabulary tags as wind-protective.
The template trusts the `protects` tags. The validator reads garment wording
against `GARMENT_PATTERNS.wind`. The two definitions had drifted, and no test
tied them together (BUG-20261128-386c).

**The pattern.** When the code that produces something and the code that
checks it each carry their own copy of a rule, they drift. Every check
passes on its own side until a real case lands between them. The knowledge
coverage rule was a third copy, reading tags.

**What to do.** Put the rule in one predicate and call it from every side:
generation, coverage and validation. Where two sources must legitimately
differ (tagged vocabulary garments versus untagged, model-written
ones), choose between them in that one predicate. Add a test that every
example one side accepts, the other accepts too.

**Applies to.** `src/engine/garments.ts` (`GARMENT_PATTERNS`,
`garmentCoverageGaps`), `src/engine/outfit-writer.ts` (template `protects`
filter), `src/engine/outfit-validate.ts`, `src/engine/quality.ts` (rubric
families), `src/harness/expectations.ts`.

**Guard.** To add with the BUG-20261128-386c fix: a tag-versus-check
consistency test.

## LESSON-20261128-2ed4: A rule checked one dimension at a time misses combinations

**Context.** `garmentCoverageGaps` requires rain footwear once for each
climate, and separately checks formality. Warm rain at a strict business
occasion needs both at once. Classic-prep has no such shoe, so the template
chose loafers in a storm (BUG-20261128-a9a4). The 20 fixtures never stated
classic-prep in a warm storm. The miss surfaced only when every scenario was
run against every preferred aesthetic: 220 combinations.

**The pattern.** Coverage written as nested "for each X: is there something?"
loops proves each axis separately. The engine meets their product: climate ×
formality × weather need × stated preference.

**What to do.** Write coverage over the combinations the selector can
actually produce. Keep a sweep test over scenario × option, not only the
fixture list.

**Applies to.** `src/engine/garments.ts` (`garmentCoverageGaps`),
`src/harness/index.ts` (`phase1-knowledge` coverage checks), any new
vocabulary or rule table.

**Guard.** To add with BUG-20261128-a9a4 and BUG-20261128-d915: the
scenario × preferred-aesthetic sweep in the harness.

## LESSON-20261128-3828: An override keeps the person's choice and still reports the gap

**Context.** A stated aesthetic always becomes the best bet, but direction
selection decides that before outfit composition knows whether the
aesthetic's garments can handle the weather (BUG-20261128-d915). The owner's
rule: "just like in a store, the attendee will always first show you what you
asked and then follow up with something that is more appropriate but they
never not listen to the customer."

**The pattern.** There are two wrong answers when a preference meets an
infeasible case:
- silently overriding the person;
- silently serving something that breaks a promise.

The right answer keeps the request, says plainly what doesn't fit, and
offers a better option next to it.

**What to do.** When an explicit preference wins over a constraint, return:
- the preferred result, first and unchanged;
- the gap, as plain advice;
- at least one alternative that meets every constraint.

Never demote the preferred result, and never drop the gap from the response.

**Applies to.** `src/engine/directions.ts` (stated preference → best bet),
`src/engine/recommend.ts`, `src/engine/compose.ts`, and any future
preference or override path (stated fit, colors, budget).

**Guard.** To add with the BUG-20261128-d915 fix: the sweep check that the
stated style stays first and at least one alternative passes every check.

## LESSON-20261128-384d: Status comes from the final validation

**Context.** When the template could not meet a hard constraint, its
outfits were accepted unconditionally. `recommend()` returned status `ok`
with no errors. Codex found this on PR #8; it was fixed in `ff48bcc` (status
`constraints_unmet`). On Phase 4, the status now reads the post-curation
validation, not the pre-curation one.

**The pattern.** Status was derived from which code path ran ("the fallback
produced something") rather than from whether the final result passed.

**What to do.** Compute `status` and `errors` from the validation of the
exact outputs being returned, after every transformation. A fallback is a
way to produce a candidate, not a guarantee that the candidate is valid.

**Applies to.** `src/engine/recommend.ts`, `src/engine/compose.ts`,
`src/engine/plan.ts` (concept status), `src/engine/curate.ts` (outcomes),
`src/baseline/runner.ts` (publishable).

**Guard.** `tests/unit/outfit-model.test.ts`, "are reported as
constraints_unmet with their issues, never as ok".

## LESSON-20261128-4cad: Text built from upstream text is held to the downstream schema

**Context.** The template appended text to concept fields: `${concept.title} for
…`. A model may write a concept title up to that schema's 80-character limit,
so the outfit title overflowed its own 80-character limit. Template output
was never parsed against the outfit schema, so validation passed anyway.
Codex found this on PR #8; it was fixed in `ff48bcc`.

**The pattern.** When stage B's schema has the same limits as stage A's, any
concatenation in B can break B's contract. That holds wherever A's text came
from, a model included. A validator that doesn't check the published schema
lets "validated" and "conforming" mean different things.

**What to do.**
- Build composed fields within the downstream limit: drop the suffix, then cut
  at a word boundary, reading the limit from the schema itself.
- Make the validator check the published schema, so a pass means the output
  conforms.

**Applies to.** `src/engine/outfit-writer.ts` (`fitToSchema`, `within`),
`src/engine/writer.ts` (concept template), `src/engine/curate.ts`
(revisions), and any future stage that composes text.

**Guard.** `tests/unit/outfit-model.test.ts`, "stay within the outfit schema
when concept text is as long as its own schema allows".
`tests/unit/outfit-validate.test.ts`, the `outfit_schema` case.

## LESSON-20261128-61fe: Test the contract's literal vocabulary

**Context.** The consumer app sends occasion values such as `active` and
`home`. The occasion rules matched only phrases ("trail run", "working from
home"), so these became `unrecognized`, and `active` lost its performance
constraint. The fixtures used realistic phrases, so no test saw the literal
values. Codex found this on PR #7; it was fixed in `d204efe`.

**The pattern.** Fixtures written as natural sentences prove the phrasing
works. They don't prove the documented enum values work, and those are what
an integration actually sends.

**What to do.** For every field the consumer contract lists as an enum or a
small set of values, add a test that maps every listed value. Match literal
values as the whole value, so they don't capture longer phrases ("dinner at
a friend's home").

**Applies to.** `src/engine/context.ts` (`OCCASION_RULES`,
`LIFESTYLE_FORMALITY`, fit and color recognition), and any future request
field listed in `docs/CONSUMER_INTEGRATION_CONTRACT.md`.

**Guard.** `tests/unit/engine-context.test.ts`, "recognizes every consumer
occasion value…".

## LESSON-20261128-6e2d: Validate meaning, not shape

**Context.** `isoDate` checked only `YYYY-MM-DD`. A value like `2026-13-01`
passed, parsed to `NaN`, and slipped past the validity-window and expiry
checks. V8 also rolls `2026-02-30` over to March 2. Codex found this on PR #6;
it was fixed in `9fa9557`.

**The pattern.** A regex proves form. Arithmetic on the value fails silently:
`NaN` makes every comparison false, so a typo can disable a whole safety
rule.

**What to do.** Validate the value the code will actually use:
- parse dates and round-trip them;
- bound numbers;
- check slugs against the registry they refer to.

Treat a comparison involving `NaN` as a bug.

**Applies to.** `src/knowledge/schema.ts` (`isoDate`, windows),
`src/knowledge/freshness.ts`, the `--as-of` parsing in `src/scripts/*`, and
any new date or number field.

**Guard.** `tests/unit/knowledge-schema.test.ts`, "rejects dates that are not
on the calendar…".

## LESSON-20261128-757c: Never treat "unreadable" as "absent" before a write

**Context.** If `snapshot.json` existed but failed to parse or validate,
`readKnowledge` returned `snapshot: null`. `prepareRelease` then treated it
as a first release and would write a new ledger over the old one. Codex found
this on PR #6; it was fixed in `9fa9557` (`snapshotStatus`).

**The pattern.** A read-modify-write that collapses "missing" and "corrupt"
into one `null` destroys history exactly when something has already gone
wrong.

**What to do.** Return distinct states (missing, invalid, valid) from any
loader whose result feeds a write. Refuse to write over an invalid file, and
say how to recover it, for example from git.

**Applies to.** `src/knowledge/store.ts` (`readKnowledge`,
`prepareRelease`), `src/scripts/knowledge.ts`, and any future cache, ledger
or stored-collection writer (Phase 5).

**Guard.** `tests/unit/knowledge-store.test.ts`, "refuses to release over an
existing snapshot it cannot read…".

## LESSON-20261128-7a38: When a rule cites a principle, implement what the principle says

**Context.** The rubric's `too_many_accents` rule cites
`tp-neutral-base-one-accent`, which allows "a single accent color … in one
or two places". The rule counted accent-colored garments, so one rust accent
on two garments counted as two. Codex found this on PR #10; it was fixed in
`c9836bb`.

**The pattern.** A rule that cites knowledge borrows its authority. If the
code measures something different from what the cited text says, the
citation is false.

**What to do.** When writing a rule that cites a knowledge record, re-read
the record and test the boundary case it describes: here, one accent in two
places.

**Applies to.** `src/engine/quality.ts` (every rule tagged with a `tp-`
record), `src/engine/outfit-validate.ts`, and template hints in
`src/engine/outfit-writer.ts`.

**Guard.** `tests/unit/quality-rubric.test.ts`, "counts distinct accent
colors…".

## LESSON-20261128-83fd: Free text never flows into structured output

**Context.** The harness's injection checks found that free text in
`preferences.fit` and `preferences.preferredColors` flowed verbatim into
garment `fit`, `color` and `name`, breaking the response schema. It was fixed
in Phase 2 (`af631bb`): fit must name a known fit term, and colors must be
plain color phrases.

**The pattern.** Anything a person or model typed is data. Copying it into a
structured field turns data into output, and possibly into instructions for a
downstream model, such as an image prompt.

**What to do.** Recognize free text against a vocabulary (fit terms, color
phrases, aesthetic slugs). Keep what doesn't match only inside the data
block (`renderRequestAsData`), and record it as an unused preference.

**Applies to.** `src/engine/context.ts`, `src/engine/palette.ts`,
`src/engine/outfit-writer.ts`, `src/engine/prompt.ts`,
`src/engine/outfit-prompt.ts`.

**Guard.** The `adversarial` section of the harness (`src/harness/adversarial.ts`):
injection into 10 fields, at both model stages.

## LESSON-20261128-b3b0: Measure per unit, then aggregate

**Context.** The Phase 0 baseline reported latency percentiles over each
scenario's summed model time. A retried scenario looked like one slow call,
and fully failed scenarios were left out. Codex found this on PR #5; it was
fixed in `4186dde`, which reports per-call latency and end-to-end latency
separately.

**The pattern.** A percentile over sums answers no question anyone asked.
The unit of a metric must match the claim made with it, such as "first
candidate latency" or "per call".

**What to do.** Flatten to the unit first (attempts, calls), then aggregate.
Report end-to-end time as its own metric, and count failures in it.

**Applies to.** `src/baseline/runner.ts`, `src/engine/recommend-runner.ts`,
`src/engine/runner.ts`, and future Phase 5 or 6 latency and cost gates.

**Guard.** `tests/unit/baseline-runner.test.ts`, which pins the per-call
semantics with known attempt latencies.

## LESSON-20261128-b4ac: Save what you ask a person to judge, from the run that was checked

**Context.** With a live model, the e2e report marked outfits "needs a
person" but threw them away. A second run gives different outfits, so the
manual checks couldn't be done against what was checked. Codex found this on
PR #9; it was fixed in `9558442`.

**The pattern.** A manual check that points at something unsaved can't be
done. Rerunning a nondeterministic system is not reproducing it.

**What to do.** Any command that defers judgment to a person writes the
exact artifacts beside its report: collections, prompts if needed, and the
calibration sheet.

**Applies to.** `src/scripts/e2e.ts`, `src/scripts/run-recommend.ts`,
`src/scripts/run-concepts.ts`, and future Phase 6 evaluation runs.

**Guard.** `tests/unit/e2e-harness.test.ts`, "CLI writes a passing report",
which checks the 20 saved collections.

## LESSON-20261128-c5bd: Stacked PRs merge bottom-up with merge commits

**Context.** Merging the stack of six PRs (#5–#10) on 2026-11-27 was first
simulated on a scratch branch.
- **Merge commits:** every step was clean, and `main` equaled each PR head.
- **Squash merging:** it conflicted in 4–6 files from the second PR on, and
  each later PR would have listed 16–32 commits from below it.
- **Retargeting:** after a base PR merges, the next PR still targets the old
  branch. Merging it without retargeting would land it there, not in `main`.

**The pattern.** Each branch in a stack contains its base's commits.
Rewriting them (squash or rebase) makes the stack disagree with itself.

**What to do.**
- Merge with "Create a merge commit", bottom-up.
- Retarget each PR to `main` right after its base merges.
- Don't delete a merged base branch until the PR above it is retargeted.
- Carry fixes up the stack with merge commits, never force-pushes.
- Before the first merge, simulate the whole sequence on a scratch branch and
  check tree equality at each step.

**Applies to.** Every multi-phase change in this repository.

**Guard.** Process; the pre-PR review (`.github/claude-review.md` §1) asks
for it.

## LESSON-20261128-c5be: Strip nondeterministic fields before diffing output

**Context.** When checking that the occasion fix left the fixtures unchanged
(2026-11-27), a raw `diff` reported 7 of 20 concept files changed. Every
difference was in `latencyMs` and `diagnostics`. Stripped of those, all 20
were identical.

**The pattern.** Raw diffs of outputs that carry timings both raise false
alarms and train people to ignore diffs. A claim like "output unchanged"
needs a stated comparison.

**What to do.** Compare outputs with timing and diagnostics removed. Say in
the PR what was compared and the result, for example "20 of 20 identical
apart from diagnostics".

**Applies to.** Any parity claim: refactors, merges, knowledge releases that
shouldn't change output.

**Guard.** Process. `tests/unit/outfit-compose.test.ts` ("is deterministic
apart from latency") applies the same rule in code.

## LESSON-20261128-e0cd: Import-graph checks skip type-only imports and carry a positive control

**Context.** The keyless-engine check walks imports to prove `src/engine`
never reaches `src/utils/config` (which exits without API keys). It
flagged a type-only import through `trend-defaults` that reached
`services/weather`, but type-only imports are erased at runtime. The walker
now skips `import type`, and a control assertion proves it still finds the
real stage 4 path to `config`.

**The pattern.** A static guard without a positive control can rot into
passing always. A guard that counts erased imports cries wolf.

**What to do.** Model what actually runs (skip `import type`), and pair every
"never reaches X" check with a "does reach X" control.

**Applies to.** `tests/unit/engine-plan.test.ts`,
`tests/unit/e2e-harness.test.ts` (the harness walker), and future
isolation checks.

**Guard.** The control assertion in `tests/unit/engine-plan.test.ts`.
