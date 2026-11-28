# Regression Testing Checklist

These are the checks a test can't run. Everything a test can decide belongs in
`npm test` and `npm run e2e`. A path that can only be checked by a person, or
needs a key this repository doesn't have, gets a numbered Part here.

- **Numbering.** Parts are numbered, and a number is never reused.
- **Citing.** Cite a Part from a PR or bug entry, for example "Part 2
  triggered".

---

## Part 1: Real-model run

**When:** any change to prompts, writers, validation, the call budget or
curation, before the change is used with a real model.

```bash
GEMINI_API_KEY=… npm run e2e -- --writer gemini --as-of <today>
GEMINI_API_KEY=… npm run recommend -- --writer gemini --save-prompts
```

- [ ] `e2e` has 0 failures. Read the `live-model` line: calls and fallbacks
  per stage.
- [ ] Fallback rate per stage is recorded in the PR. A rise against the last
  recorded run is investigated.
- [ ] At most 5 model calls per request.
- [ ] Read at least 10 of the saved `scenarios/<id>.json` collections,
  including a stated preference in bad weather. Note anything a person would
  not wear.
- [ ] No prompt in `prompts/` contains request or evidence text outside a data
  block.

## Part 2: Human read of outfits and the calibration sheet

**When:** a rubric, threshold or vocabulary change; before any phase is called
done.

- [ ] `npm run recommend` writes `calibration-sheet.csv` (blind) and
  `calibration-key.csv`.
- [ ] A person rates at least one scenario group per city without the key.
- [ ] Disagreements of 2 points or more between the rater and the rubric are
  listed in the PR, for Phase 6 calibration.

## Part 3: Knowledge release review

**When:** any change under `knowledge/`.

- [ ] Every new external claim was read in full at its source, and
  `sourceCheck` says so.
- [ ] New records are `provisional`. A named person approves them before
  they're relied on.
- [ ] `npm run knowledge:coverage` gaps are read. A gap that is stated beats a
  claim that is filled in.

## Part 4: Before any consumer integration

**When:** before the consumer app calls this service (not started; needs the
owner's explicit request).

- [ ] The open questions in `docs/CONSUMER_INTEGRATION_CONTRACT.md` §A9 are
  decided: dress-only looks, looks with no outer layer, accessories without a
  slot, and showing scores or `low_confidence`.
- [ ] How the app shows `constraints_unmet`, and the weather alternatives from
  BUG-20261128-d915, is decided and documented.
