# Pre-PR Secondary Review

> **When to run.** Before opening, or marking ready, any PR that changes code,
> knowledge or a contract. Run it as a skeptical senior reviewer, against the
> whole system rather than the diff alone. The review summary in §7 is the
> required output.

## 1. Bring in the base, and merge stacks safely

- Merge the latest `main` into the branch before review, and resolve conflicts
  with full context. Don't resolve them mechanically.
- **Never rewrite pushed history:** no rebase, amend or force-push on a
  branch others may have checked out.
- **Stacked PRs** (LESSON-20261128-c5bd):
  - merge bottom-up with merge commits, never squash;
  - retarget each PR to `main` right after its base merges;
  - carry fixes up the stack with merge commits;
  - before the first merge, simulate the whole sequence on a scratch branch.

## 2. Review against the project's documents

| Document | Check |
|---|---|
| `AGENTS.md` | Architectural rules and local checks |
| `ENGINEERING_GUIDELINES.md` | §1 canonical patterns followed; no §2 known debt copied |
| `BUG_REPORTS.md` | Known bugs this change could reintroduce, worsen or fix |
| `SESSION_LEARNINGS_AND_REGRESSIONS.md` | Lessons that apply to the files touched |
| `REGRESSION_TESTING_CHECKLIST.md` | Manual-only checks this change triggers |
| `changelogs/unreleased.md` | An entry for every behavior or contract change |
| The phase doc that owns the code | `docs/STYLE_DIRECTIONS.md`, `docs/OUTFIT_COMPOSITION.md`, `docs/QUALITY_CURATION.md`, `docs/FASHION_KNOWLEDGE.md`, `docs/E2E_HARNESS.md` |
| `docs/CONSUMER_INTEGRATION_CONTRACT.md` | Any request or response shape, status or issue-code change |

### 2b. Changelog entry

Add an entry to `changelogs/unreleased.md` for every change to recommendation
behavior, a response or request shape, a status, an issue code, knowledge, or
a command. Name the regression guard.

### 2c. Model boundary (applies when prompts, writers or model calls change)

- [ ] Request fields, evidence and model-written concepts reach a model only
  through `renderRequestAsData`, `renderEvidenceAsData` and
  `renderConceptsAsData`.
- [ ] Revision feedback is issue codes, roles and field names only.
- [ ] Free text from a request or a model never lands in a structured field
  (LESSON-20261128-83fd).
- [ ] The call budget still holds (at most 5 per request), and fallbacks never
  loop.
- [ ] The harness `adversarial` section passes.

### 2d. Knowledge (applies when `knowledge/` or its schema changes)

- [ ] Released with `npm run knowledge:release`, and the ledger only appends.
- [ ] External claims carry a source check against a page that was actually
  read. Numbers carry a dataset.
- [ ] New records are `provisional` until a person approves them.
- [ ] `npm run knowledge:status` passes. Fixture output is unchanged, or the
  change is stated.

### 2e. Response contract (applies when types, statuses, issue codes or schemas change)

- [ ] `outfitDraftSchema` and the validator agree, so "validated" means
  "conforms" (LESSON-20261128-4cad).
- [ ] Status comes from the final validation (LESSON-20261128-384d).
- [ ] `docs/CONSUMER_INTEGRATION_CONTRACT.md` and the owning phase doc are
  updated in the same PR.
- [ ] Every consumer enum value is tested (LESSON-20261128-61fe).

### 2f. Recommendation behavior (applies when selection, composition, validation, curation or vocabularies change)

- [ ] Fixture parity: `npm run concepts` and `npm run recommend` compared
  before and after, with timing and diagnostics stripped. The result is stated
  (LESSON-20261128-c5be).
- [ ] The scenario × preferred-aesthetic sweep was run, and the failures it
  found are fixed or filed (LESSON-20261128-2ed4). For now it's a script; it
  becomes a harness check with BUG-20261128-d915.
- [ ] A generator and a checker of the same rule share one predicate
  (LESSON-20261128-135d).
- [ ] A rule that cites a knowledge record measures what the record says
  (LESSON-20261128-7a38).

### 2g. Capture the lesson (write side)

**This is the write side of §5.** The failure this prevents: a bug gets a
fix and a test, but the general lesson is never written down, so the same
class of bug recurs in a sibling module.

Required when the PR fixes a bug or hits a non-obvious gotcha:

- [ ] **`BUG_REPORTS.md` entry.** Mint an ID with `npm run bug:id`, give it a
  tier with the top-down test, and add an index row. Delete the row for each
  bug this PR fixes and set the entry's status to `Fixed (date)`.
  `tests/unit/memory-docs.test.ts` enforces the format.
- [ ] **Regression guard.** Add a test that fails before the fix, or a
  numbered Part in `REGRESSION_TESTING_CHECKLIST.md` for manual-only paths.
- [ ] **Is this a class of mistake?** If the same root cause could recur in
  another module, add a lesson to `SESSION_LEARNINGS_AND_REGRESSIONS.md` and a
  line in its Key Takeaways. Mint the ID with `npm run lesson:id`. State the
  pattern and the sibling files, and cite the bug and the test. For a pure
  one-off, say so instead.
- [ ] **Reinforce instead of duplicating.** If a lesson already covers the
  class, add the new incident to it.
- [ ] **Sibling sweep, acted on.** Grep for the same pattern in its siblings:
  - the other writer (template and model);
  - the other stage (concepts and outfits);
  - every caller of a changed helper;
  - every rule table (`OCCASION_RULES`, `GARMENT_PATTERNS`,
    `LIFESTYLE_FORMALITY`, the rubric).

  Record the pattern searched, the files checked, and for each file either
  "fixed in this PR" or "filed BUG-…".

## 3. Architecture and altitude

- Describe the data flow the change touches: request → interpretation →
  selection → concepts → outfits → curation → response.
- For each fix, say which document you read **before** implementing and how
  the existing code already solves this.
- Give a verdict for each fix:
  - "root mechanism";
  - "shared helper";
  - "local patch, because…";
  - "needs a product or editorial decision, filed BUG-…".

  A change you'd copy into a second place belongs in a shared helper.
- Don't rubber-stamp. Challenge the design.

## 4. Correctness and trust gate

Flag anything that could break a hard promise without saying so:
- weather safety;
- avoided colors;
- minor safety;
- an invented trend, local or numeric claim;
- request or model text acting as instructions;
- a response that breaks the published schema;
- a status that says `ok` when a check failed.

These are P0 in `BUG_REPORTS.md`.

## 5. Don't repeat the same mistakes (read side)

- Before approving, read `BUG_REPORTS.md` and
  `SESSION_LEARNINGS_AND_REGRESSIONS.md`.
- Check that the PR doesn't reintroduce a fixed bug or a recorded pattern. If
  a similar class occurred before, confirm the fix addresses its root cause.
- **Close the loop (§2g).** A fix that leaves no bug entry, guard or lesson is
  incomplete.

## 6. Don't review in isolation

Trace each change through a real request: the fixtures, the harness, and at
least one stated-preference case. Test assumptions against how the consumer
app actually sends data (`docs/CONSUMER_INTEGRATION_CONTRACT.md`), not only
the fixture phrasing.

## 7. Review summary (required output)

```
### Pre-PR Review Summary

**Local checks:** typecheck · tests (N) · knowledge:status · e2e (pass/fail/manual) · fixture parity (what was compared, result) · sweep (if §2f applied)

**Documents cross-referenced:**
- [ ] ENGINEERING_GUIDELINES.md: [which §1 patterns the change follows; confirm no §2 debt copied]
- [ ] BUG_REPORTS.md: [bugs checked against; bugs ADDED (ID, tier, one-line reason) and FIXED (rows removed)]
- [ ] SESSION_LEARNINGS_AND_REGRESSIONS.md: [lessons applied; lessons ADDED or reinforced, or "N/A, one-off" with reason]
- [ ] Phase doc(s) and CONSUMER_INTEGRATION_CONTRACT.md: [updated, or N/A with reason]
- [ ] changelogs/unreleased.md: [entries added]
- [ ] REGRESSION_TESTING_CHECKLIST.md: [Parts added or triggered, or N/A]
- [ ] §2c model boundary / §2d knowledge / §2e contract / §2f behavior: [which applied and their results; N/A otherwise]

**Architecture & altitude (per fix):** [doc read first; existing mechanism; verdict]

**Sibling sweep (per fix):** [pattern grepped; files checked; per-file verdict, "fixed" or "filed BUG-…"; or "no siblings" with the grep]

**Lessons captured:** BUG_REPORTS.md [ID or none] · guard [test or Part] · SESSION_LEARNINGS [ID added or reinforced, or N/A with reason]

**Risks considered:** [edge cases and failure modes, and why each is safe]

**Not confident about:** [anything uncertain; better flagged than missed]
```

This summary is the most important output of the review. Write "None found"
rather than skip a section.
