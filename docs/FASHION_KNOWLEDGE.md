# Fashion Knowledge Store (Phase 1)

**Status:** Phase 1 of [`FASHION_INTELLIGENCE_DESIGN.md`](./FASHION_INTELLIGENCE_DESIGN.md).

- **Knowledge version:** `fashion-2026-10.1`, released 2026-10-09.
- **Corpus:** 13 timeless principles and 11 aesthetic references, all
  **provisional** Aura editorial judgment.
- **Contemporary and regional records:** none (see §1).
- **Runtime:** nothing in the pipeline, prompts, Redis or API reads the store
  yet. Phase 2 is its first consumer.

> **Labels.** **Implemented** means it is in code and covered by tests;
> **Planned** means later phases; **Assumption** means not yet confirmed.

---

## 1. What is in the corpus, and what is not

| Type | Records | Basis | Editorial status | Source-checked |
|---|---|---|---|---|
| `timeless_principle` | 13 | Aura editorial judgment | provisional | n/a |
| `aesthetic_reference` | 11 | Aura editorial judgment | provisional | n/a |
| `regional_influence` | **0** | – | – | – |
| `contemporary_observation` | **0** | – | – | – |

**Why there are no regional or contemporary records.** The plan was to
research and cite them. The session's network policy blocked every source page
tried:

- fashion publications: net-a-porter.com, fashionunited.com, theimpression.com,
  trendalytics.co;
- reference and climate sources: weather.gov, metoffice.gov.uk, wikipedia.org.

Web search summaries were available, but a search summary is not the page, so
no claim could be confirmed against its source. Per the rule "fewer
well-supported records over weak claims", none were added.

To add them, an editor allows the source domains in the environment's network
settings and follows §6.

**Draft status.** Every record was drafted by Claude
(`reviewedBy: "claude (draft for human editorial review)"`) and waits for a
human editor to approve it. Approval is a separate act from source
verification (§2).

---

## 2. Record model

Records follow the design doc's evidence contract, with these documented
deviations (implemented in `src/knowledge/schema.ts`).

**Three separate questions.** The design contract had one
`verified | provisional | historical` status. Here it is split into three
fields:

| Field | Question it answers | Values |
|---|---|---|
| `basis` | Where does the claim come from? | `editorial_judgment` (Aura's own styling judgment) · `external_observation` (reported by a cited publication or brand) · `measured` (quantified by a dataset) |
| `sourceCheck` | Was an external claim confirmed against the content of its cited source? | `checked_against_source` (with `checkedAt` and `method`) · `not_checked`. Required for external and measured claims; forbidden for editorial judgment. |
| `editorialStatus` + `editorialReview` | Has a human editor approved the record for use? | `provisional` → `approved` (needs `approvedBy` and `approvedAt`) → `historical` |

The contract's `verified` maps to `editorialStatus: approved`. External
verification lives only in `sourceCheck`. **Approval never implies the claim
was checked.** The schema also refuses to approve an external claim that
nobody checked against its source.

**Numbers only when measured.** A `measurement` (metric, value, method,
dataset source) is allowed only when `basis` is `measured` and its source has
kind `dataset`. Nothing else may carry popularity or adoption figures. The
legacy `src/data/seasonal-trends.ts` has `popularity: 0–1` values with no
source. Those are not part of this store.

**Other additions to the contract:**

- `title`, a short display name.
- `provenance[].accessedAt`, replacing the contract's per-source `reviewedAt`.
  Editorial review now lives in `editorialReview.lastReviewedAt`.
- A per-record `knowledgeVersion`, meaning the release in which the record was
  added or last changed.

**Integrity checks** (`readKnowledge`):

- ids are unique and every source resolves;
- external and measured claims cite a publication, brand or dataset with a
  `sourceUrl`;
- editorial judgment cites only Aura editorial;
- every aesthetic tag is defined by an `aesthetic_reference`; the aesthetic
  vocabulary is the set of those records;
- legacy unsourced records can never be approved.

---

## 3. Freshness: review due is not the same as expired

Freshness has two independent axes (`src/knowledge/freshness.ts`):

| Axis | Applies to | Effect |
|---|---|---|
| **Validity** (`current` / `expired` / `not_yet_valid`) | Time-sensitive records only: every `contemporary_observation`, which must set `validFrom`/`validUntil` within 366 days, and any `regional_influence` that sets `validUntil`. | Expired and not-yet-valid records are **excluded** from queries by default. |
| **Review** (`current` / `review_due`) | All records. Due after 365 days (timeless, aesthetic), 180 (regional) or 90 (contemporary) since `editorialReview.lastReviewedAt`. | Review-due records **stay usable** and are flagged so an editor looks again. |

Timeless principles and aesthetic references are durable. The schema rejects
`validUntil` on them, so they can become due for review but never expire.

---

## 4. Versioning

**Canonical content hash** (`computeContentHash`):

1. Take every source and every evidence record.
2. Sort sources and records by `id`, in code-unit order (independent of locale
   and ICU version).
3. Sort object keys recursively. Arrays keep their order, because list order
   can carry meaning.
4. Serialize `{"evidence": [...], "sources": [...]}` with `JSON.stringify`
   and no whitespace.
5. Take the sha256 of the UTF-8 bytes.

**`snapshot.json` is never part of the input**, and neither is which file a
record lives in. Moving records between files or editing release notes doesn't
change the hash.

**Version-bump discipline is enforced separately** by the release ledger in
`snapshot.json`:

- The ledger is append-only, oldest first. Each entry is
  `{version, contentHash, releasedAt, notes}`.
- `npm run knowledge:release -- --version fashion-YYYY-MM.N --notes "…"` is
  the only supported way to add a release. It refuses a reused version, an
  unchanged content hash, and content with validation problems.
- Validation fails when the current content no longer matches the latest
  release ("content changed since release …"), when two consecutive releases
  have the same hash, or when a record cites a version that was never
  released.
- Reviewers check that a PR only **appends** to `releases`.

---

## 5. Untrusted-data boundary

**The boundary.** Evidence text comes from editors and cited publications.
Consumers must pass it to any model as **quoted data**, using
`renderEvidenceAsData(hits)` (`src/knowledge/boundary.ts`). That function:

- serializes the selected fields as JSON, so quotes and newlines are escaped;
- wraps the JSON between `<<<AURA_EVIDENCE_DATA nonce=…>>>` and
  `<<<END_AURA_EVIDENCE_DATA nonce=…>>>`, using a fresh random nonce per
  render;
- states that the contents are reference material, not instructions.

Text inside a record can't predict the nonce, so it can't close the block
early.

**Supplemental hygiene.** The schema also rejects URLs in text and obviously
instruction-like phrases ("ignore previous instructions", "system prompt", …).
That check is **not** a security boundary. It misses paraphrases and other
languages, and a test demonstrates one such miss.

---

## 6. Editorial workflow (the offline refresh)

There is no scraping and no automatic ingestion. Knowledge changes arrive as
reviewed pull requests:

1. **Propose.** Add or edit records in `knowledge/evidence/*.json` with
   `editorialStatus: "provisional"` and `knowledgeVersion` set to the release
   you are about to cut. For an external observation:
   - add the source to `knowledge/sources.json`;
   - fill `provenance` (`sourceUrl`, `publishedAt`, `accessedAt`);
   - summarize **only what the page states**, paraphrased briefly;
   - set `sourceCheck: {status: "checked_against_source", checkedAt, method: "full_page_read"}`
     only after reading the page itself;
   - for contemporary records, set `validFrom` (the publish date) and a
     `validUntil` no more than 12 months later.
2. **Check.** Run `npm run knowledge:status`. Fix every content problem.
3. **Release.** Run
   `npm run knowledge:release -- --version <next> --notes "<what changed>"`,
   then `npm test`.
4. **Approve (human editor).** Set `editorialStatus: "approved"` and
   `editorialReview.approvedBy` / `approvedAt`, then release again.
5. **Retire.** Set `editorialStatus: "historical"` rather than deleting, so
   past references still resolve.

---

## 7. Commands

| Command | What it does |
|---|---|
| `npm run knowledge:status -- [--as-of D] [--json]` | Version and latest release; counts by type, editorial status and source check; expired records; review-due records; content and release validation. Exits 1 on any problem. Local preview of the Planned `GET /v1/knowledge/status`. |
| `npm run knowledge:release -- --version V --notes N` | Appends a release (§4). |
| `npm run knowledge:coverage -- [--as-of D] [--json]` | Knowledge available to each of the 20 benchmark scenarios, by type. No minimums for regional or contemporary evidence; absence is reported as a note. |

**Coverage at release** (as of 2026-10-09, fall):

- Every scenario can draw on 13 timeless principles and 10 aesthetic
  references. `relaxed-coastal` is tagged spring/summer only.
- Every scenario gets 0 regional and 0 contemporary records, with notes
  saying so.
- London and Paris map to their own regions (`london`, `paris`) and never
  borrow another city's evidence.

---

## 8. What Phase 2 can consume

All of the following is **Implemented**, pure, and key-free (no `config`,
network or model calls):

| Use | API |
|---|---|
| Load a validated, released corpus | `loadKnowledge(dir?)` → `KnowledgeStore`. Throws `KnowledgeValidationError` listing every problem. |
| Current version, for recommendation metadata | `store.knowledgeVersion` and `store.snapshot.releases` |
| Retrieve evidence for a context | `store.query({types, aesthetics, regions, includeGlobal, season, garmentCategories, statuses, asOf, includeExpired})` returns `KnowledgeHit[]` (`{evidence, freshness}`). Results are ordered approved → provisional, then by type and id. Expired and historical records are excluded unless requested. |
| The aesthetic vocabulary, for direction planning | `store.aesthetics()` returns the 11 aesthetic slugs. The full definitions are `store.query({types: ["aesthetic_reference"]})`, each with silhouettes, materials and garment categories. |
| Cite evidence in outputs | `evidence.id` matches the planned `evidenceIds` field on `StyleConcept` and on recommendations. `store.get(id)` and `store.source(id)` resolve it. |
| Pass evidence to a model safely | `renderEvidenceAsData(hits)` returns `{nonce, text, ids}`. Phase 2 prompts should use this, never interpolate evidence text directly. |
| Qualify claims | Each hit carries `editorialStatus`, `basis`, `sourceCheck` and freshness (`validity`, `review`). Phase 2 should say "provisional" or "editorial" where relevant. |
| Per-scenario context | `regionForScenario(scenario)`, `seasonFor(date)` and `scenarioCoverage(store, scenarios, asOf)` |

**Constraints Phase 2 should respect:**

- The corpus currently gives **no regional or contemporary grounding**, so
  concepts must not claim city-specific or trend authority.
- Every record is provisional editorial judgment until approved.
- Season is northern-hemisphere by date (an **Assumption**, fine for the
  current benchmark cities).

**Not in Phase 1:**

- no API endpoint (Phase 5);
- no use by the existing pipeline or prompts;
- no LLM calls;
- no automated ingestion;
- no migration of the unsourced legacy trend data in `src/data/` or the
  stage-1 defaults.
