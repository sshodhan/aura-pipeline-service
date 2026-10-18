# End-to-end validation harness

**Status:** Implemented (`src/harness/`, `npm run e2e`; harness
`e2e-0.2`). It validates Phases 0–4 together on the 20 benchmark scenarios.

- **What it is:** one command that checks every phase against its documented
  claims, each fixture's own expectations, hostile input, broken models and
  the consumer contract.
- **Keys:** none by default. It runs in about 0.4 s with template writers,
  the mock model and scripted models.
- **Output:** a report in which every check is **pass**, **fail**,
  **needs a person**, or **skipped**.
- **What it does not do:** score taste.
  - Anything a deterministic check cannot decide (polish, comfort, whether
    garments suit a stated gender expression) is reported as needing a
    person, never auto-passed.
  - The Phase 4 rubric it checks reads garment structure. The harness tests
    that the rubric behaves as documented, not that its scores agree with
    people.

```bash
npm run e2e                                         # key-free; exits 1 on any failure
npm run e2e -- --as-of 2026-10-18 --out <dir>
GEMINI_API_KEY=… npm run e2e -- --writer gemini     # phases 2–4 on a real model
```

Output goes to `baselines/local/e2e-<writer>-<timestamp>/report.json` and
`report.md` (git-ignored). `tests/unit/e2e-harness.test.ts` runs the full
template harness on every `npm test`. It also proves the harness fails when
an outfit stage is broken.

---

## Sections

| Section | What it checks | How |
|---|---|---|
| `phase0-baseline` | The current pipeline still behaves as [`PHASE_0_BASELINE.md`](./PHASE_0_BASELINE.md) says | Mock baseline and call-volume replay at the document's date. Checks: 18 supported cities; 10 in the matrix (1 exact, 9 fuzzy); 18 placeholder outfits publishable; the brief's NYC example never served; 894 nightly calls; 149 bundle keys; 745 overwrites. A failure means the docs or the pipeline changed. |
| `phase1-knowledge` | The corpus and ledger are valid and honest | Schema and integrity checks. Content matches the latest release. No external claim lacks a source check. Missing regional and contemporary knowledge is stated per scenario. Every aesthetic meets the garment coverage rule. |
| `phase2-concepts` | Three valid, distinct directions per scenario | Concept checks pass; three distinct aesthetics; adjacent at least 0.45 from the best bet; a stated preference becomes the best bet. |
| `phase3-outfits` | Three valid outfits per scenario | All checks pass. Each outfit conforms to the published schema, belongs to its concept, and differs from the others in at least 2 core garments. At most 4 model calls for concepts and outfits. Template output, curation included, is identical on a second run. |
| `phase4-quality` | The rubric and curation ([`QUALITY_CURATION.md`](./QUALITY_CURATION.md)) | Details below |
| `input-parity` | Every input the current pipeline drops reaches the new engine | For each field Phase 0 reports dropped (gender expression, age range, colors, fit, comfort, extra aesthetics), the interpreted context carries it. |
| `fixture-expectations` | Each scenario's `expectedConstraints` (written in plain English in the fixtures) | Rules map lines to checks. "No white or cream garments" → no garment uses them. "Waterproof outer layer and footwear" → water-resistant outer layer and rain-capable footwear. Lines without a rule are marked as needing a person. |
| `adversarial` | Hostile input, broken models, the budget | Details below |
| `consumer-adapter` | How each outfit maps onto the consumer's four garment slots ([`CONSUMER_INTEGRATION_CONTRACT.md`](./CONSUMER_INTEGRATION_CONTRACT.md) §A8.5) | Undisplayable names fail. Looks that hit an open question (§A9: no outer layer, a dress-only look, an accessory with no slot) are listed for a decision. |
| `live-model` | A real-model run | Skipped without `--writer gemini`. With it, reports calls and fallbacks per stage; reading the outfits is left to a person. |

**Adversarial checks:**

- **Injection.** A payload that tries to close a data block and issue an
  instruction is put into each of 10 free-text request fields. At both model
  stages it must appear only inside a well-formed data block (marker,
  preface, one JSON line, end marker), and the final collection must still
  pass its checks and schema.
- **Invalid requests.** Six kinds are rejected before any model call.
- **Broken models.** A model that throws, answers in prose, or returns the
  wrong shape is replaced by the template within 4 calls.
- **Budget.** A budget of 1 call per stage is honored.
- **Revisions.** A failing draft is revised with issue codes only.
- **Too little knowledge.** With too few aesthetics, the result is an honest
  `insufficient_knowledge`.

**Phase 4 checks**, per scenario:

- every outfit has four integer scores from 1 to 5, each with reasons;
- hard checks are reported apart from the scores and match validation;
- rescoring the returned outfits reproduces the reported scores;
- adding praise words ("perfect, elegant, flawless, effortlessly chic") to
  every prose field changes no score;
- no outfit scores lower than its first version, and a kept revision scores
  higher;
- at most 1 curation call and 5 model calls in all;
- an outfit left `low_confidence` is listed as needing a person.

**Phase 4 probes:**

- **Template repair at threshold 4.** Revisions happen with no model call,
  every collection stays valid, and nothing scores lower.
- **Model revision.** A scripted model revises in one call from issue codes
  only. A marker in its first draft never reaches the revision prompt, and
  the better version is kept.
- **Failed revision.** It keeps the originals and flags the weak outfits.

---

## Results (template writers, as of 2026-10-18)

| Section | Pass | Fail | Needs a person | Skipped |
|---|---|---|---|---|
| phase0-baseline | 10 | 0 | 0 | 0 |
| phase1-knowledge | 17 | 0 | 0 | 0 |
| phase2-concepts | 65 | 0 | 0 | 0 |
| phase3-outfits | 100 | 0 | 0 | 0 |
| phase4-quality | 143 | 0 | 0 | 0 |
| input-parity | 46 | 0 | 0 | 0 |
| fixture-expectations | 47 | 0 | 27 | 0 |
| adversarial | 32 | 0 | 0 | 0 |
| consumer-adapter | 40 | 0 | 20 | 0 |
| live-model | 0 | 0 | 0 | 1 |

**Fixture expectations needing a person (27):**

- garments suiting the stated gender expression (19 scenarios);
- polish or expression for dinners and dates (5);
- comfort for walking or long wear (2);
- a video-call-presentable top (1).

**Consumer adapter, 60 outfits:**

- 50 map directly onto the four slots;
- 10 have no outer layer (warm and hot scenarios);
- 10 carry an accessory with no consumer slot (scarves, beanies).

These are the §A9 open questions, now counted.

**Phase 4.**

- At the default threshold (3), no template outfit needs revision, so
  nothing is revised or flagged.
- Mean scores:
  - composition 4.55;
  - contextual relevance 4.85;
  - distinctiveness 4.38;
  - visual potential 5.
- At the strict threshold (4), template repair keeps 5 revisions and leaves
  5 outfits `low_confidence`.

**Found and fixed by the harness.** Injection checks showed that free text in
`preferences.fit` and `preferences.preferredColors` flowed verbatim into
garment fields and names, breaking the schema. The interpreter now
recognizes fit terms and plain color phrases (fixed in Phase 2, see
[`STYLE_DIRECTIONS.md`](./STYLE_DIRECTIONS.md) §3). Fixture output is
unchanged.

---

## Reading a failure

- **`phase0-baseline`:** the pipeline's behavior or the Phase 0 document
  changed. Update whichever is wrong.
- **`phase1-knowledge`:** fix the corpus, or release it with
  `npm run knowledge:release`.
- **`phase2`, `phase3`, `phase4`, `fixture-expectations`, `adversarial`:** a
  regression in the engine. The detail names the scenario, role and issue
  codes.
- **`consumer-adapter` failure:** a garment name a consumer card could not
  show.

**What this harness cannot tell you.** Whether the recommendations are
compelling. That needs a real-model run and people reading the outfits,
which is Phase 6 (blind evaluation) in
[`FASHION_INTELLIGENCE_DESIGN.md`](./FASHION_INTELLIGENCE_DESIGN.md).
