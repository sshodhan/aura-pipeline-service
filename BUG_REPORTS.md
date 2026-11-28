# Bug Reports

Filed: 2026-11-28

---

## Open-Bug Triage Index

**Updated:** 2026-11-28 · **Open:** 3 (of 3 filed)

Aura's promise is a recommendation a person can trust and wear today. AGENTS.md
puts it as **a compelling stylist before a personalized one**. Open bugs are
ranked by *impact on that promise first, technical severity second*:

- **P0 — Trust-breakers.** The service tells someone a look is fine when a hard
  promise is broken, and says nothing. Examples: weather-unsafe garments, an
  avoided color, minor safety, an invented trend or local claim, or request or
  model text acting as instructions. Fix before anything else.
- **P1 — Misled or poorly served.** The promise holds, or the failure is
  reported, but the person gets a worse answer than they should. Examples: a
  hard check reported as unmet, a stated preference ignored, the wrong formality,
  near-duplicate looks, or a response the consumer contract cannot display.
- **P2 — Knowledge, contract and data integrity.** Examples: release ledger,
  provenance, cache identity, budgets, or the consumer contract drifting from
  the docs.
- **P3 — Engineering and QA hygiene.** Tech debt, tests, observability and
  docs. Batch these opportunistically; never schedule them ahead of P0–P2.

### How to assign a tier

Walk the tiers **top-down and stop at the first match**:

1. **P0?** Could someone be told a look is fine when it breaks a hard promise,
   with no error or warning? → P0.
2. **P1?** Otherwise, does someone get a worse look than they should, even if
   the failure is reported? → P1.
3. **P2?** Otherwise, is knowledge, the contract or stored data inconsistent?
   → P2.
4. **P3?** Otherwise it's hygiene → P3.

**Severity is a tiebreaker, never a promoter.** `Severity` (Critical, High,
Medium or Low) orders rows within a tier. It never moves a bug across tiers.

**Conventions.**

- **IDs** are `BUG-YYYYMMDD-xxxx`: the filing date (UTC) and four random hex
  digits. Mint one with `npm run bug:id`. Parallel PRs filing bugs at the same
  time never collide, so nobody renumbers on merge. IDs are labels, not ranks;
  the tables carry the order. Never reuse one.
- **Filing.** Mint an ID. Assign a tier with the test above. Add a row to the
  matching table. Use these fields:
  - `Severity: Critical | High | Medium | Low`;
  - `Status: Open | Open (Deferred) | Blocked — Needs Decision | Fixed (YYYY-MM-DD) | Closed (By Design, YYYY-MM-DD)`.
- **Fixing.** Delete the row from the index. The full entry below stays as the
  permanent record, with its `Status` set to `Fixed (date)`. If the same
  mistake could recur elsewhere, add or reinforce a lesson in
  `SESSION_LEARNINGS_AND_REGRESSIONS.md` and cite it under References. The full
  loop is in `.github/claude-review.md` §2g.
- **Never guess a product or editorial decision** to unblock a
  `Blocked — Needs Decision` bug. Those wait for the owner.
- **Deferred work** carries `Deferred` in its status, so an automated pass
  leaves it alone.

`tests/unit/memory-docs.test.ts` checks the structure on every
`npm test`:
- every entry has `Severity`, `Status` and `Component` from the vocabulary;
- every open entry appears in the index, and no fixed one does;
- IDs are unique and well formed;
- the header's open count is correct.

**Filing template (copy this for a new bug):**

```
## BUG-YYYYMMDD-xxxx: <one-line title>

**Severity:** Critical | High | Medium | Low
**Status:** Open | Open (Deferred) | Blocked — Needs Decision | Fixed (YYYY-MM-DD)
**Component:** <path(s)>

### Description
### Root cause
### Fix            (or ### Fix (proposed) while open)
### Regression guard
### References
```

### P0 — Trust-breakers

| ID | Sev | Bug | Status note |
|----|-----|-----|-------------|

### P1 — Misled or poorly served

| ID | Sev | Bug | Status note |
|----|-----|-----|-------------|
| BUG-20261128-d915 | Medium | A stated style that cannot cover the day's weather gets no weather-appropriate option; the look is only reported as `constraints_unmet` | Open: owner decided 2026-11-28 to keep the stated style and add weather-appropriate alternatives |
| BUG-20261128-386c | Medium | Two definitions of "wind-resistant": the template trusts garment tags, the checker reads garment wording, so tagged wool coats fail in windy weather | Blocked — Needs Decision: recommendation in the entry, awaiting the owner |
| BUG-20261128-a9a4 | Low | Warm rain at a business occasion: classic-prep has no rain-capable shoe formal enough, so the template picks leather loafers | Open (Deferred): owner chose not to fix now, 2026-11-28 |

### P2 — Knowledge, contract and data integrity

| ID | Sev | Bug | Status note |
|----|-----|-----|-------------|

### P3 — Engineering and QA hygiene

| ID | Sev | Bug | Status note |
|----|-----|-----|-------------|

---

## BUG-20261128-a9a4: Warm rain at a business occasion leaves classic-prep without a rain-capable shoe

**Severity:** Low
**Status:** Open (Deferred)
**Component:** `knowledge/evidence/aesthetics.json` (`ar-classic-prep` garments), `src/engine/garments.ts` (`garmentCoverageGaps`), `src/engine/outfit-writer.ts` (template footwear)

### Description

Found while checking every benchmark scenario against every preferred
aesthetic: 20 × 11 = 220 combinations at `main` `05ee091`.

`atlanta-work-storm` with `preferredAesthetics: ["classic-prep"]` fails one
check: "footwear is not suited to rain". The scenario is client meetings at
24°C in thunderstorms. The template dresses the classic-prep best bet in
leather penny loafers. Since 2026-11-27, `recommend()` returns this as
`constraints_unmet` with the issue in `errors`, so it is reported, not
silent.

### Root cause

The day combines three needs that classic-prep's vocabulary never meets
together:
- warm climate;
- rain;
- business formality (client meetings, band 4–4, strict).

Its rain-capable footwear doesn't fit:

| Shoe | Formality | Climates | Problem |
|---|---|---|---|
| Boat shoes | 2–3 | mild, warm | Too casual |
| Duck boots | 2–3 | cold, cool, mild | Too casual |
| Treated brogue boots | 3–4 | cold, cool | Wrong weather |

With no garment meeting every need, the template's footwear pick falls back to
the closest option (`best(…, footNeeds)` in `outfit-writer.ts`).

The knowledge coverage rule didn't catch it. `garmentCoverageGaps` requires
rain-capable footwear once per claimed climate (`garments.ts`, around line 75),
not per formality level. It also tests garment tags, not the validator's
wording.

### Fix (proposed)

1. **Extend `garmentCoverageGaps`** to check rain footwear for each climate and
   formality level the aesthetic claims, as it already does for tops, bottoms
   and footwear in general. This will report every such gap in the corpus, not
   just this one.
2. **Add the missing garment** in a knowledge release. For example, a rubber-soled
   or treated leather derby or oxford tagged `protects: ["rain"]`, for mild and
   warm weather, formality 3–4. This is editorial, provisional until approved.
3. **Re-run the 220-combination sweep.**

### Regression guard

To add with the fix: a coverage-rule test for climate × formality × rain, and
the sweep as a harness check (planned with BUG-20261128-d915).

### References

- Analysis on 2026-11-28 (the three-gap breakdown of the 11 failing
  combinations; this is gap 3).
- The `constraints_unmet` status came from the Codex finding on PR #8.
- The owner chose to defer it.
- Lesson: LESSON-20261128-2ed4.

## BUG-20261128-386c: Two definitions of "wind-resistant" make tagged wool coats fail in windy weather

**Severity:** Medium
**Status:** Blocked — Needs Decision
**Component:** `src/engine/outfit-validate.ts` (weather checks), `src/engine/garments.ts` (`GARMENT_PATTERNS.wind`), `src/engine/outfit-writer.ts` (template `protects` filter), `knowledge/evidence/aesthetics.json` (`protects` tags)

### Description

In `chicago-hangout-windy` (8°C, windy), three preferred aesthetics fail
"outer layer is not wind-resistant": quiet-luxury, romantic and
artistic-minimal. In each case the template picked a wool coat that the
vocabulary tags `protects: ["cold", "wind"]`:
- the double-faced wool coat;
- the soft wool wrap coat;
- the longline wool coat.

These styles claim cool weather, so this isn't a missing garment.

### Root cause

Protection is defined twice:

| Who | Reads | Effect |
|---|---|---|
| Template and the knowledge coverage rule | The `protects` tags in the garment vocabulary | Treats these coats as wind-protective |
| Validator | The garment's wording, matched against `GARMENT_PATTERNS.wind` (windproof, shell, nylon, trench, leather, overcoat, zip and similar) | "Wool coat" isn't on the list, so the same coat fails |

The validator reads wording because model-written garments carry no tags.

The two drift with no test tying them together. The wording list is itself
inconsistent: it accepts "overcoat" and "duffle" but not "wool coat".

### Fix (proposed)

There should be one source of truth per kind of garment:

1. **A garment from the vocabulary** (its type matches a vocabulary entry) is
   judged by its tags.
2. **A garment a model wrote**, with no match, is judged by its wording, as
   today.

**Implementation.** Put both behind one helper, `protectsAgainst(garment,
need, vocabulary)`, and use it in all three places: the template filter, the
coverage rule and the validator.

**Test.** Add one that every vocabulary garment tagged for a need passes the
validator's check for that need.

**Editorial review.** Review the corpus's `protects` tags once, provisionally.
A dense double-faced or longline wool coat reasonably blocks wind on an 8°C
day. An open, belted wrap coat is the weakest claim.

**Decision needed from the owner:** whether to accept "tags are the truth for
vocabulary garments", and the result of the tag review.

### Regression guard

To add with the fix: the tag-versus-check consistency test above, and the
220-combination sweep (BUG-20261128-d915).

### References

Analysis on 2026-11-28 (gap 2 of the 11 failing combinations). Lesson:
LESSON-20261128-135d.

## BUG-20261128-d915: A stated style that cannot cover the weather gets no weather-appropriate option

**Severity:** Medium
**Status:** Open
**Component:** `src/engine/recommend.ts`, `src/engine/compose.ts`, `src/engine/outfit-writer.ts`, `src/engine/directions.ts`, `docs/CONSUMER_INTEGRATION_CONTRACT.md`

### Description

A stated aesthetic always becomes the best bet. Seven of the 220 combinations
put that aesthetic in weather it doesn't claim. Its vocabulary then has no
garment that meets the weather:
- romantic or bohemian in cold rain or snow (no insulated, water-resistant
  coat);
- rugged-utility in LA heat (no breathable top, no sun accessory).

Since 2026-11-27 these return `constraints_unmet`, so the result is honest.
But the person gets only a look flagged as failing, with nothing that suits the
day.

### Root cause

Direction selection (`src/engine/directions.ts`) honors a stated preference
before outfit composition knows whether that aesthetic's garments can cover
the weather. Nothing in the response offers a weather-ready choice alongside
it.

### Fix (proposed; direction decided by the owner, 2026-11-28)

**Design rule, in the owner's words: "just like in a store, the attendee will
always first show you what you asked and then follow up with something that is
more appropriate but they never not listen to the customer."**

So the requested look always comes first and is never replaced or demoted. The
weather-ready suggestions come after it, as offers.

1. **Keep the stated style exactly as asked.** Its weather gaps become plain
   advice on that outfit rather than failures. Every other hard check stays
   hard: avoided colors, completeness, minor safety, schema.
2. **Add additional weather-appropriate suggestions** to the response, each
   passing every check. Default proposal: the stated style made weather-ready
   by swapping only the failing pieces, plus the candidate aesthetic that best
   suits the weather. Show them only when there's a weather gap.
3. **Status `ok`, and no extra model calls.**
4. **Update the docs:**
   - the consumer contract (a new response field);
   - `docs/OUTFIT_COMPOSITION.md`;
   - `docs/E2E_HARNESS.md`.

### Regression guard

To add with the fix: a harness sweep of every scenario × preferred aesthetic.
Each combination must either pass, or keep the stated style first and offer at
least one alternative that passes every check.

### References

Analysis on 2026-11-28 (gap 1). The owner's decision: keep the requested
style, and add more weather-appropriate suggestions for the client, shown after
the requested look. Lesson: LESSON-20261128-3828.
