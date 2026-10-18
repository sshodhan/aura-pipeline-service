# Quality and Curation (Phase 4)

**Status:** Phase 4 of [`FASHION_INTELLIGENCE_DESIGN.md`](./FASHION_INTELLIGENCE_DESIGN.md).
The user approved it with two decisions: a **rules-only rubric** (no model
judge) and **keep and flag** an outfit that is still weak after its revision.

- **Versions:** engine `recommend-0.2` (Phase 3 was `recommend-0.1`); rubric
  `rubric-0.1`; knowledge release `fashion-2026-10.3` (unchanged).
- **What it does:**
  - scores every outfit from 1 to 5 on four editorial dimensions, each score
    with its reasons;
  - reports those scores apart from the hard checks;
  - revises weak outfits once;
  - keeps a revision only if it helps;
  - flags whatever is still weak.
- **Entry point:** `recommend()` runs curation by default, after composition.
  `curate: false` returns exactly the Phase 3 output, with `quality: null`.
- **What it is not:**
  - The scores are rubric readings of garment attributes, not probabilities
    that a person will like the outfit.
  - The thresholds are **uncalibrated** until people rate outfits in Phase 6.

> **Labels.** **Implemented** means it is in code and covered by tests;
> **Planned** means later phases; **Assumption** means not yet confirmed.

---

## 1. Flow

```
recommend(context)
  └─ planStyleDirections   Phase 2 (≤2 model calls)
  └─ composeOutfits        Phase 3 (≤2 model calls)
  └─ curateCollection      Phase 4: score → decide → one revision → keep only improvements → flag (≤1 model call)
  └─ RecommendationCollection   + quality (assessments, initial scores, revised, low confidence, range) + diagnostics.curation
```

A request makes at most **5 model calls**: concepts 2, outfits 2 and
curation 1.

- **Model-written outfits** are revised by the model.
- **Template output**, including a Phase 3 template fallback, is revised by
  the template at no model cost.
- **No mixing.** A model's collection never receives template garments.
  With `maxCurationCalls: 0`, weak model outfits are flagged, not replaced.

---

## 2. Contracts (`src/engine/curate.ts`, `src/engine/outfit-types.ts`)

`QualityAssessment` follows the design appendix, with additions:

| Field | Meaning |
|---|---|
| `candidateId`, `role` | The outfit's id and its role (`best_bet`, `adjacent`, `exploration`) |
| `hardChecks` | `{passed, violations}`: Phase 3's validation issue codes for this outfit, never mixed into the scores |
| `editorialAssessment` | `composition`, `contextualRelevance`, `distinctiveness`, `visualPotential` (integers 1–5) and a `rationale` that lists the rubric's notes |
| `reasons` | **Addition.** The reasons behind each dimension's score |
| `issueCodes` | **Addition.** Rubric issue codes on the final version |
| `decision` | For the first version: `reject` (hard checks fail), `revise` (any dimension below the threshold) or `accept` |
| `revisionInstructions` | Issue codes sent to the revision; set only when `decision` is `revise` |
| `outcome` | **Addition.** Where the outfit ended up: `accepted`, `revised`, `low_confidence` or `rejected` |
| `evaluatorVersion` | `rubric-0.1` |

**Where these appear in the response:**

- `Recommendation.quality` holds each outfit's assessment.
- `RecommendationCollection.quality` (`CollectionQuality`) holds:
  - every assessment;
  - the first-version scores (`initialScores`), so revisions can be
    audited;
  - `revisedRoles` and `lowConfidence`;
  - collection range: the minimum number of differing core garments, and
    the colors and garment types shared between outfits.
- `diagnostics.curation` holds the mode (`none`, `template_repair` or
  `model_revision`), calls, attempts and latency. `totalModelCalls` includes
  curation.

---

## 3. The rubric (`src/engine/quality.ts`, `src/engine/colors.ts`)

**What it reads.** The rubric reads only garment attributes (color, material,
fit, silhouette, type) and the knowledge store's vocabularies (each garment
type's formality range and climates, and each aesthetic's expressiveness and
silhouettes).

**What it never reads.** It never reads the outfit's prose: title,
strategies, rationale, `why`, pro tip.

**Why that matters:** praise words such as "perfect" or "elegant" cannot
raise a score, and missing prose cannot lower one. A test and a harness check
both prove this.

Each dimension starts at 5 and loses points per finding, clamped to 1–5.

| Dimension | Rule | Penalty | Principle |
|---|---|---|---|
| `composition` | More accent colors than the aesthetic carries. The limit depends on the aesthetic's expressiveness: 1 accent for expressiveness ≤2, 2 for 3, 4 for 4 or more. | −1 per extra accent, at most −2 | `tp-neutral-base-one-accent` |
| | Warm and cool neutrals, at least 2 of each, with neither twice the other | −1 | `tp-color-temperature` |
| | Top and bottom both full (oversized, loose, boxy), unless the aesthetic's silhouettes include "oversized" (streetwear) | −1 | `tp-volume-balance` |
| | Fewer than 2 material families among the clothes (footwear and accessories excluded) | −1 | `tp-texture-contrast` |
| `contextualRelevance` | Garments whose vocabulary formality range excludes the target formality | −1, or −2 when 3 or more | |
| | Garments (not accessories) whose vocabulary climates are at least one band from today's | −1, or −2 when 3 or more | `tp-fabric-for-weather` |
| | A stated preferred color is never used | −1 | |
| `distinctiveness` | From the fewest core garments that differ from any other outfit: 4 → 5, 3 → 4, 2 → 3, fewer → 1 | | |
| | Shares at least 60% of its colors (Jaccard) with another outfit | −1 | |
| `visualPotential` | **A specificity proxy only.** A garment is vague when its color is generic ("neutral", "dark"), its material is generic ("fabric"), its fit is generic ("normal"), or its type is a single word ("trousers") | −1 per vague garment, at most −3 | |

**Lookup tables (Assumptions: Aura editorial judgment, uncalibrated,
versioned with `rubric-0.1`):**

- **Color families.** `classifyColor` sorts colors into neutral or accent,
  and warm or cool. Names it does not know are "unclassified" and never
  penalized.
- **Material families.** Wool, silk, leather, technical, linen, velvet,
  cotton, knit and other.
- **Garment types outside the vocabulary.** Common in model output. Their
  formality and climate are not checked, and the reasons say so.

**Known limits (to test in calibration):**

- **Classic pairings are flagged.** The temperature rule flags navy with
  camel, which many stylists treat as a classic pairing.
- **Shallow distinctiveness.** It compares garment types per core slot and
  colors, not the overall feel.
- **Visual potential is not appeal.** It measures whether an image model has
  enough to depict the outfit, not whether the outfit looks good.
- **No taste.** Nothing here judges taste, flattery or whether garments suit
  a stated gender expression. Those stay with people (the harness lists them
  as needing a person).

---

## 4. Decisions and thresholds

| Condition | Decision |
|---|---|
| Hard checks fail | `reject` (cannot happen after Phase 3, which always returns a valid collection; the guard stays) |
| Any dimension below `REVISE_BELOW` (3) | `revise` |
| Otherwise | `accept` |

**Threshold.** `REVISE_BELOW` is set per request with `reviseBelow`. It is
**uncalibrated**: Phase 6 should move it once people's ratings show where
the rubric and readers agree.

---

## 5. Revision

**One revision per request, for the flagged outfits only.**

**Template repair** (template output, no model call). The template rewrites
the flagged roles with hints derived from the issue codes:

| Issue code | Hint |
|---|---|
| `too_many_accents` | Keep 1 accent; surplus accents become palette neutrals (outer layer first, then mid, bottom, footwear, top, accessory) |
| `neutral_temperature_clash` | Use neutrals of the dominant temperature, if the palette keeps at least 2 |
| `single_texture` | Steer away from the current top and mid-layer types |
| `proportion_unbalanced` | Steer away from the current bottom type |
| `formality_drift`, `climate_drift` | Steer away from the named garment types |
| `low_distinctiveness`, `color_repetition` | Steer away from garment types shared with the other outfits |

The hints change the template's choices only for the roles they name. The
other roles are byte-identical.

**Model revision** (model-written outfits, 1 call):

- **Same boundary as Phase 3.** The request, concepts and evidence are sent
  as data blocks.
- **Codes only.** Feedback is issue code, role and dimension. The model
  never sees its earlier text, so nothing a model wrote is echoed back into
  instructions.
- **No retry.** A provider error, a parse error or a schema error costs the
  one call, and the originals are kept.

**Adoption** is the same for both paths. A flagged outfit's new version is
swapped in only if:

- the whole collection still passes every hard check;
- the revised outfit's total score goes up;
- no other outfit's total goes down. Distinctiveness is relative, so one
  outfit's revision can move the others.

Otherwise the original stays. An outfit still below the threshold is kept
and marked `low_confidence`, so the collection always has three looks. This
is the user's "keep and flag" decision.

---

## 6. Results on the 20 benchmark scenarios (template writers, as of 2026-10-18)

| Dimension | 3 | 4 | 5 | Mean |
|---|---|---|---|---|
| composition | 3 | 21 | 36 | 4.55 |
| contextualRelevance | 2 | 5 | 53 | 4.85 |
| distinctiveness | 5 | 27 | 28 | 4.38 |
| visualPotential | 0 | 0 | 60 | 5.00 |

**At the default threshold (3):**

- No outfit scores below 3, so nothing is revised or flagged.
- Phase 3 output is byte-identical to `recommend-0.1` on all 20 scenarios.

**Rubric notes found (60 outfits):**

- `single_texture` 15;
- `neutral_temperature_clash` 7;
- `climate_drift` 7;
- `too_many_accents` 5;
- `color_repetition` 5.

**At threshold 4** (the harness's strict probe):

- 9 outfits are flagged; template repair keeps 5 revisions and 5 outfits end
  `low_confidence`.
- Every collection stays valid, and no outfit scores lower.
- **Example: the New York cold-rain work best bet.**
  - The repair takes composition from 3 to 5 at the cost of one
    contextual-relevance point.
  - Before: cream cashmere crewneck, grey cashmere cardigan, navy wool coat,
    camel wool trousers, grey boots, chocolate scarf. That is three warm and
    three cool neutrals, and every garment is from the wool family.
  - The template swaps the crewneck for a crisp cotton shirt, which adds
    texture. It moves the cool neutrals to chocolate and black.
  - The rubric then notes the shirt as meant for other weather, although it
    is layered under cashmere and a down-lined coat.
  - The result is also tonal (three chocolate pieces), which the rubric does
    not penalize.
  - This is the kind of case calibration should settle.

**What these numbers mean.** They describe the deterministic template, which
draws from curated vocabularies, so high specificity is expected. The rubric
matters most for model output, which has not been run here (no
`GEMINI_API_KEY` in this environment).

---

## 7. Calibration (input to Phase 6)

`npm run recommend` writes two CSV files next to its summary:

| File | Columns | For |
|---|---|---|
| `calibration-sheet.csv` | `item_id`, `group` (scenario, `S01`…), `context` (what the person told Aura), `garments` (name, material, fit, silhouette), and blank `composition`, `contextual_relevance`, `distinctiveness`, `visual_potential`, `overall` (1–5) and `notes` | Raters. **Blind:** no roles, aesthetics, prose or scores, and roles are shuffled within each scenario. |
| `calibration-key.csv` | `item_id`, `scenario_id`, `role`, `aesthetic`, the four rubric scores, `decision`, `outcome`, `issue_codes`, `evaluator_version`, `engine_version`, `knowledge_version` | Joining ratings back to the rubric |

**Item ids** are a hash of scenario and role, so they are stable across
runs.

**Planned (Phase 6):**

- collect ratings from several people;
- measure agreement between raters, and between raters and the rubric, per
  dimension;
- adjust rules, weights or `REVISE_BELOW`;
- bump `rubric-0.x` with each change.

Until then, treat a score as a structural reading, not a quality verdict.

---

## 8. Running it

```bash
npm run recommend                                    # template writers; writes summary + calibration CSVs
npm run recommend -- --revise-below 4                # exercise template repair
npm run recommend -- --no-curate                     # Phase 3 output only
GEMINI_API_KEY=… npm run recommend -- --writer gemini   # model writers; curation revises with the model (≤5 calls)
npm run e2e                                          # includes the phase4-quality section
```

**Tests:**

- `tests/unit/quality-rubric.test.ts` covers each rule's negative case,
  hollow-word invariance and determinism.
- `tests/unit/quality-curate.test.ts` covers:
  - the default threshold;
  - Phase 3 parity;
  - template repair and its hints;
  - model revision with codes only;
  - failed, worse and invalid revisions kept out;
  - the zero budget;
  - the 5-call cap;
  - the calibration sheets.

---

## 9. What Phase 5 can consume

All of the following is **Implemented**:

- **Recommendations.** `recommend(context, store, {…, curate?, reviseBelow?, maxCurationCalls?})`
  returns recommendations with `quality` per outfit and per collection.
- **Diagnostics.** `diagnostics.curation` and a `totalModelCalls` that
  includes curation, for cost and latency gates.
- **Versions.** `evaluatorVersion` and `engineVersion`, for cache identity.
  A rubric change must invalidate cached collections.

**Open questions for the consumer** (see
[`CONSUMER_INTEGRATION_CONTRACT.md`](./CONSUMER_INTEGRATION_CONTRACT.md) §A9):

- whether to show `low_confidence`;
- whether to expose scores at all. The current assumption is no: they are
  uncalibrated and meant for evaluation.

**Not in Phase 4:**

- **A model judge.** The user chose rules only. A judge could be added later
  as a separate, labeled evaluator, never merged into the rubric.
- **Re-ranking or replacing directions.** The user chose keep and flag.
- **Human calibration** (Phase 6).
- **The API and storage** (Phase 5).
- **Any change to the existing pipeline or the consumer app.**
