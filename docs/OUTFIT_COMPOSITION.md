# Outfit Composition (Phase 3)

**Status:** Phase 3 of [`FASHION_INTELLIGENCE_DESIGN.md`](./FASHION_INTELLIGENCE_DESIGN.md).

- **Engine version:** `recommend-0.1` (concept stage `concepts-0.1`); reads
  knowledge release `fashion-2026-10.3`. Phase 4 adds curation after this
  stage and bumps the engine to `recommend-0.2`
  ([`QUALITY_CURATION.md`](./QUALITY_CURATION.md)); with `curate: false` the
  output below is unchanged, byte for byte.
- **What it does:** dresses each of Phase 2's three style concepts as a
  complete outfit. Each garment has a category, layer, type, color, material,
  fit, silhouette and a reason. Each outfit adds layering, proportion, color
  and texture strategies, a styling rationale, weather notes and a pro tip.
- **Entry point:** `recommend(context, store, options)` in
  `src/engine/recommend.ts`. It is pure and key-free, and runs concepts
  (Phase 2) and then outfits.
- **Runtime:** nothing in the existing pipeline, prompts, Redis or API calls
  it. There is no HTTP endpoint (Phase 5). The local runner is
  `npm run recommend`.

> **Labels.** **Implemented** means it is in code and covered by tests;
> **Planned** means later phases; **Assumption** means not yet confirmed.

---

## 1. Flow

```
recommend(context)
  └─ planStyleDirections   Phase 2: interpret → select 3 aesthetics → write concepts → validate (≤2 model calls)
  └─ composeOutfits        Phase 3: dress each concept → validate → one revision → template fallback (≤2 model calls)
  └─ RecommendationCollection   recommendations[3] = {role, concept, outfit} + validation + diagnostics
```

Composition is a **separate stage**. It has its own call budget, its own
revision with issue codes, and its own deterministic fallback, so a failure is
attributed to the stage that caused it. Concepts and outfits make at most
**4 model calls** (2 per stage; set with `maxModelCallsPerStage` or
`--max-calls`). Phase 4's curation can add 1, for at most 5 per request.

---

## 2. Contracts (`src/engine/outfit-types.ts`)

All of these are **Implemented**.

**`GarmentSpec`:**

| Field | Meaning |
|---|---|
| `id` | `<outfit id>-g<n>`, stable for the same request and knowledge |
| `category` | `top` · `bottom` · `dress` · `outerwear` · `footwear` · `accessory` (the pipeline's `OutfitItem` categories) |
| `layer` | `base` · `mid` · `outer` for tops and outerwear; `null` for the rest |
| `type` | Garment type without color ("wool wide-leg trousers") |
| `name` | Short display name: the color word plus the type, no period ("grey wool wide-leg trousers") |
| `color`, `material`, `fit`, `silhouette`, `details?` | Specification |
| `why` | One sentence on what the garment does for this look and weather |

`colorHex` is not produced. **Assumption:** color names are enough for image
prompts, as they are in the consumer app today.

**`OutfitSpec`:**

- `id` (`<concept id>-outfit`), `conceptId`, `role`, `aesthetic`, `title`;
- `garments` (3–7);
- `layering`, `proportionStrategy`, `colorStrategy`, `textureStrategy`;
- `stylingRationale`, `weatherNotes`, `proTip`;
- `evidenceIds`, `knowledgeVersion`.

**`RecommendationCollection`:**

- `schemaVersion`, `engineVersion`, `conceptEngineVersion`,
  `knowledgeVersion`;
- `status`: `ok` | `fallback` | `invalid_request` | `insufficient_knowledge`;
  `fallback` if either stage fell back;
- `requestId`, `contextFingerprint`, `asOf`, `interpreted`, `selection`;
- `recommendations[3]`;
- `validation: {concepts, outfits}`, `errors`;
- `diagnostics: {concepts, outfits, totalModelCalls, latencyMs}`.

---

## 3. Garment vocabularies (knowledge release `fashion-2026-10.3`)

Every aesthetic profile now has `garments[]`: 193 options across the 11
aesthetics, Aura editorial and provisional
([`FASHION_KNOWLEDGE.md`](./FASHION_KNOWLEDGE.md) §2). Each option gives:

- `category`, `type`, `material`, `fit` and `layer`;
- the `climates` and `formality` range it suits;
- what weather it `protects` against: `rain`, `wind`, `cold` or `sun`.

**Coverage rule.** `garmentCoverageGaps` in `src/engine/garments.ts` is
tested for all 11 aesthetics. For every climate and formality level an
aesthetic claims, it must have:

- a base top, a bottom and footwear;
- for cold and cool, an insulating outer layer;
- for cold, an outer layer that is both insulating and rain-capable, and
  boots (for snow and cold rain);
- rain-capable footwear in every claimed climate;
- a shade accessory for warm and hot;
- a rain-capable outer layer somewhere.

**Gender expression.** The keyless template never picks dresses, skirts,
blouses, heels or similar (`TEMPLATE_EXCLUDED`), so it makes no gendered
default; every template outfit works for any expression. Those options stay
in the vocabulary as data for the model writer. The model is told to use
garments consistent with a stated gender expression, without stereotyped
defaults.

---

## 4. Writers and the trust boundary (`outfit-writer.ts`, `outfit-prompt.ts`)

**`TemplateOutfitWriter`** (deterministic, no model):

- **Slots.** It fills a base top, a bottom and footwear. It adds:
  - a middle layer in cold or cool weather;
  - an outer layer when the context has rain, snow, cold, wind or a cool
    "warm layer" need;
  - a light layer in mild weather;
  - a tailored layer for formal and business occasions;
  - a shade accessory in strong sun, or a warm one in the cold.
- **Choice.** For each slot it picks the vocabulary option that best fits the
  climate band, the occasion's formality band and target, and athletic needs.
  Weather needs (`protects`) are a hard filter whenever some option meets
  them. In the heat, heavy fabrics are penalized. A garment type already used
  by an earlier role is penalized, so the three outfits differ.
- **Colors.** It uses the concept template's palette helper
  (`composePalette`, `src/engine/palette.ts`): avoided colors are removed, a
  stated preferred color becomes the top's color, and footwear stays neutral.
- **Fit.** A requested fit is applied to the top, bottom and outer layer.

It runs in tests and local runs, and is the fallback. **It makes no claim to
editorial quality.**

**`ModelOutfitWriter`** makes one call for all three outfits. The prompt
carries three nonce-tagged data blocks:

- the request (`AURA_REQUEST_DATA`);
- the concepts plus each aesthetic's `garmentOptions` (`AURA_CONCEPT_DATA`).
  Concepts can be model output from stage 1, so they are data too;
- the evidence (`AURA_EVIDENCE_DATA`, via `renderEvidenceAsData`).

Instructions name only roles, aesthetic slugs, evidence ids, issue codes and
field or category names. Revision feedback is issue codes only (for example
`incomplete_outfit · best_bet · footwear`). Tests check that a fake closing
delimiter or an injected instruction inside a concept never escapes its
block.

---

## 5. Validation (`src/engine/outfit-validate.ts`)

The checks are deterministic and structural:

| Code | Check |
|---|---|
| `outfit_coverage` / `aesthetic_mismatch` | One outfit per concept, with the concept's role and aesthetic |
| `incomplete_outfit` | One pair of footwear; a dress, or a top and a bottom; 3–7 garments |
| `missing_outer_layer` | An outer layer is present for rain, snow, cold or wind |
| `missing_constraint` | Each weather need is met **on the garment that handles it**: a water-resistant outer layer and rain-capable footwear; boots for snow; an insulating outer layer for cold; a wind-resistant outer layer; a mid or outer layer for cool or mild; nothing heavy and something breathable in the heat; a hat or sunglasses in strong sun; running footwear and technical fabrics for athletic activity |
| `occasion_mismatch` | Nothing too casual (hoodies, joggers, shorts, graphic tees, trainers, …) for formal or business occasions; no sneakers, tees or denim at formal events |
| `avoided_color` | No avoided color in any garment's color, name or details, or in the color strategy |
| `name_format` | The name contains its color word, has no period and is at most 80 characters (the consumer shows text before the first `.`) |
| `generic_why` | Each garment's reason has at least 5 words and isn't carried by praise words |
| `fit_not_honored` | A requested fit appears on a main garment |
| `not_distinct_garments` | Every pair of outfits differs by garment type in at least **2 core slots** (top or dress, bottom, outer layer, footwear). This is the consumer Aisle gate's rule. |
| `evidence_not_provided` / `unsupported_claim` / `minor_safety` | As in Phase 2: cited ids were provided; no city or trend claims without evidence; age-appropriate for minors |

**What this does not judge.**

- Whether a garment is well chosen, colors harmonize, proportions flatter or
  the outfit is compelling.
- Keyword checks show a requirement is addressed in words, not well.
- The rubric and curation are Phase 4
  ([`QUALITY_CURATION.md`](./QUALITY_CURATION.md)); human calibration is
  Phase 6.

---

## 6. Results on the 20 benchmark scenarios

These come from `npm run recommend` (template writers, as of 2026-10-18):

- 20/20 collections are valid at both stages.
- Each outfit has 3–6 garments.
- Every pair of outfits differs in 3 or 4 of the 4 core slots.
- No model calls; p50 latency is about 2 ms per request.

Sample (Chicago office, −6 °C snow, avoids white and cream), best bet in
relaxed metropolitan tailoring:

| Layer | Garment |
|---|---|
| base | charcoal fine-gauge merino crewneck |
| mid | navy soft-shouldered wool blazer |
| outer | camel water-resistant quilted car coat |
| bottom | grey wool wide-leg trousers |
| footwear | grey treated leather chelsea boots |
| accessory | camel wool scarf |

**Known limitations:**

- **Exploration repeats.** Phase 2's exploration concentration carries
  through: eclectic-maximalist exploration outfits repeat across scenarios.
- **Gender-neutral only.** Template outfits never include dresses or skirts.
- **Color assignment is mechanical.** Palette order sets each garment's
  color, so color harmony is not judged.
- **Real-model results are pending.** This environment has no
  `GEMINI_API_KEY`.

---

## 7. Running it

```bash
npm run recommend                                                       # template writers, all 20 scenarios, no keys
npm run recommend -- fixtures/scenarios/06-chicago-work-snow.json
GEMINI_API_KEY=… npm run recommend -- --writer gemini --save-prompts    # both stages on Gemini
npm run recommend -- --writer gemini --model <id> --max-calls 2         # --max-calls is per stage
```

**Output.** Output goes to `baselines/local/recommend-<writer>-<timestamp>/`
(git-ignored):

- `scenarios/<id>.json`, the full collection;
- `summary.json`;
- `summary.md`, with each role's garment names, modes, distinctness,
  validity, calls and latency, plus the issues seen, including failed model
  attempts;
- with `--save-prompts`, `prompts/<id>-<stage>-call<n>.txt`.

The command exits 1 if any collection is invalid. The default model is
`PIPELINE_TEXT_MODEL`, as in Phase 2.

---

## 8. Consumer mapping

This mapping is **Planned** and owned by the consumer: the service does not
implement the adapter. See
[`CONSUMER_INTEGRATION_CONTRACT.md`](./CONSUMER_INTEGRATION_CONTRACT.md) §A8.5
for the field table, and §A9 for the open questions (dress-only looks, looks
without an outer layer, accessories without a consumer slot).

---

## 9. What Phase 4 can consume

All of the following is **Implemented**:

| Use | API |
|---|---|
| Full recommendations for a context | `recommend(context, store, {conceptWriter, outfitWriter, asOf, region?, maxModelCallsPerStage?})` |
| Hard checks to separate from subjective scoring | `validateCollection` (concepts) and `validateOutfits` (outfits), with typed issue codes |
| Distinctness signal | `differingCoreSlots(a, b)` and `validation.outfits.differingCoreSlots` |
| Per-stage diagnostics for cost and latency gates | `diagnostics.concepts`, `diagnostics.outfits`, `totalModelCalls` |
| Keyless runs | the template writers, `runRecommendScenarios`, `npm run recommend` |

Phase 4 consumes these as described in
[`QUALITY_CURATION.md`](./QUALITY_CURATION.md).

**Not in Phase 3:**

- quality rubric and curation (Phase 4, now implemented);
- API, storage and byte-identical refetch (Phase 5);
- images;
- the consumer adapter;
- any change to the existing pipeline or the consumer app.
