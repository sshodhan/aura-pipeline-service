# Style Direction Engine (Phase 2)

**Status:** Phase 2 of [`FASHION_INTELLIGENCE_DESIGN.md`](./FASHION_INTELLIGENCE_DESIGN.md).

- **Engine version:** `concepts-0.1`; reads knowledge release `fashion-2026-10.2`.
- **What it does:** turns one `RecommendationContext` into three style
  concepts (Best Bet, Adjacent, Exploration), each with a thesis,
  silhouette, proportion, palette, material and detail directions, a
  rationale, and cited evidence ids.
- **Code:** `src/engine/`. Pure and key-free, like `src/knowledge/`.
- **Runtime:** nothing in the existing pipeline, prompts, Redis or API calls
  it. There is no HTTP endpoint (Phase 5). The local runner is
  `npm run concepts`.

> **Labels.** **Implemented** means it is in code and covered by tests;
> **Planned** means later phases; **Assumption** means not yet confirmed.

---

## 1. Flow

```
RecommendationContext
  └─ parseContext          schema + length caps (untrusted input)
  └─ interpretContext      hard constraints · preferences · opportunities · unknowns · knowledge gaps
  └─ selectDirections      three aesthetics chosen deterministically from the knowledge store
  └─ writer.write          template (no model)  |  model (one call, data-only boundary)
  └─ validateCollection    structural checks; one revision with issue codes; template fallback
  └─ ConceptCollection     concepts + interpretation + selection + validation + diagnostics
```

**Why a hybrid.** Code chooses the three aesthetics. The model, when used,
only writes them. This means:

- the collection's range is guaranteed and testable without a key;
- a model cannot collapse the three roles into three versions of one look;
- the model works only on the part that needs language.

---

## 2. Contracts (`src/engine/types.ts`)

All of these are **Implemented**. They follow the design's
`InterpretedContext` and `StyleConcept`, with these documented additions:

| Contract | Addition | Why |
|---|---|---|
| `InterpretedContext` | `constraints[]` (`{code, text}`) | The validator checks each constraint by code. `hardConstraints[]` keeps the contract's plain strings. |
| | `signals` | The structured values the planner uses: formality band, climate band, precipitation, minor flag, matched aesthetics, and so on. |
| | `knowledgeGaps[]` | What the store cannot support for this context (no regional or contemporary evidence). Stated, never filled in. |
| `StyleConcept` | `aesthetic` | The aesthetic slug. The planned API response has an `aesthetic` field. |
| | `proportionDirection` | The design prose asks for proportions separately from silhouettes. |

`ConceptCollection` contains:

- the versions: `schemaVersion`, `engineVersion` and `knowledgeVersion`;
- `status`: `ok` | `fallback` | `invalid_request` | `insufficient_knowledge`;
- `requestId` and `contextFingerprint` (a sha256 of the context with
  `requestId` excluded);
- `interpreted`, `selection` (assignments, pairwise distances and notes),
  the three `concepts` and `validation`;
- `errors`;
- `diagnostics`: generation mode, model id, calls, revisions, budget, the
  attempts with their outcomes and issue codes, tokens, latency, and the
  evidence ids provided.

Concept ids are `<fingerprint8>-<role>`.

---

## 3. Context interpretation (`src/engine/context.ts`)

**Hard constraints** (each has a code):

| Code | When |
|---|---|
| `formality` | Always: the occasion's band on a 1–5 scale (1 athletic or lounge · 2 casual · 3 smart casual · 4 business or dressy · 5 formal) and a target inside it |
| `rain_protection` / `snow_protection` | Condition mentions rain, drizzle, showers or storms (or `precipitationLikely`) / snow or sleet |
| `insulation` · `warm_layer` · `light_layer` · `breathable` | Climate band: cold below 5°C · cool 5–12 · mild 13–20 · warm 21–27 · hot 28 and above (`breathable` for warm and hot) |
| `wind_protection` | Condition mentions wind or gusts |
| `sun_protection` | Clear or sunny condition and warm or hot |
| `performance` | Athletic occasion |
| `avoid_colors` | Any avoided colors |
| `minor_safe` | The age range's lower bound is under 18 |

**Occasion rules.** The occasion maps to a formality band by keyword, first
match wins (an **Assumption**: a small rule set tuned to the benchmark,
listed in code):

| Kind | Band | Strict | Notes |
|---|---|---|---|
| errands | 1–2 | no | Listed first, so "running errands" is not a run |
| athletic | 1 | yes | |
| formal_event | 4–5 | yes | |
| business | 4 | yes | |
| home | 1–2 | no | |
| office | 3–4 | no | |
| date | 2–4 | no | |
| dinner | 2–4 | no | |
| hangout | 2–3 | no | |
| unrecognized | 2–4 | no | Stated as an unknown |

**Strict** means no formality stretch is allowed (see §4).

**Lifestyle.** The lifestyle sets the target formality, clamped to the band.
The occasion always wins: the Portland gala with a "casual" lifestyle aims at
4, not 2.

**What is never used for taste.** Gender expression, age and city never pick
an aesthetic. A test changes them and checks that the selection is identical.

- Gender expression reaches the writer as context.
- Age only triggers `minor_safe`.
- City only selects the knowledge region.

**Unknowns** stay unknown: gender expression, age range, colors, fit and
aesthetic preference are listed when absent, never defaulted.

**Preferences.**

- Stated aesthetics ("bold", "minimal", "polished", …) match aesthetics via
  each record's `profile.preferenceTerms`.
- Phrases that match nothing are kept in `unmatchedPreferences`, never
  guessed at.

---

## 4. Direction selection (`src/engine/directions.ts`)

**Knowledge it needs.** Release `fashion-2026-10.2` adds an optional
`profile` to every aesthetic reference. Its values are Aura editorial and
provisional (see [`FASHION_KNOWLEDGE.md`](./FASHION_KNOWLEDGE.md) §2):

- `formality: [min, max]` on the scale above;
- `climates`: the climate bands it suits;
- `expressiveness`: 1 (restrained) to 5 (statement);
- `palette`;
- `preferenceTerms`.

Aesthetics without a profile are skipped and noted.

**Fit** (0–1, a context fit, not a quality score):

| Factor | Score |
|---|---|
| Formality: range meets the band | 1, minus 0.2 per step from the target |
| Formality: one step outside a non-strict band | 0.35 (a stretch) |
| Formality: otherwise | ineligible |
| Climate: band suited | 1 |
| Climate: one band away | 0.45 (needs adapting) |
| Climate: otherwise | ineligible |

The weights are 0.45 formality, 0.35 climate, 0.1 closeness of the range's
center to the target, and 0.1 lifestyle match.

**Distance** between two aesthetics (0–1) is weighted as follows:

- token overlap of silhouettes: 25%;
- token overlap of materials (texture): 25%;
- formality center: 20%;
- expressiveness: 30%, the clearest signal of a different identity.

**Roles:**

| Role | Rule |
|---|---|
| `best_bet` | The best-fitting stated aesthetic preference, if one is eligible. Otherwise the strongest fit, with ties going to the more versatile (less expressive) aesthetic. |
| `adjacent` | Fit ≥ 0.6 and distance from the best bet ≥ 0.45. Stated preferences and the lifestyle's aesthetic are favored. Beyond distance 0.6 it is penalized, because it stops being approachable. |
| `exploration` | Fit ≥ 0.4 and distance ≥ 0.55 from both other directions, then the best fit. Otherwise the most different acceptable fit. |

**Insufficient knowledge.** With fewer than three eligible aesthetics, the
result is `insufficient_knowledge`. A third direction is never invented.

**Results on the 20 benchmark scenarios** (`npm run concepts`, as of
2026-10-14). All 20 get three distinct aesthetics:

- minimum pairwise aesthetic distance per scenario: 0.50–0.60;
- maximum pairwise text overlap: 0.15–0.30 (limit 0.45).

| Role | Aesthetics chosen (count) |
|---|---|
| best_bet | relaxed-metropolitan-tailoring 5, rugged-utility 4, artistic-minimal 3, quiet-luxury 3, sport-luxe 2, streetwear 2, romantic 1 |
| adjacent | sport-luxe 5, quiet-luxury 4, artistic-minimal 3, romantic 3, streetwear 2, eclectic-maximalist 1, relaxed-metropolitan-tailoring 1, rugged-utility 1 |
| exploration | **eclectic-maximalist 16**, romantic 1, rugged-utility 1, sport-luxe 1, streetwear 1 |

**Known limitation.** Exploration concentrates on `eclectic-maximalist`. It
is the only expressiveness-5 aesthetic and its profile is broad, so it is the
most different acceptable fit almost everywhere.

The rule is working as written: each collection is diverse. Across
collections, though, the wildcard is predictable. The fix is more aesthetic
references with high expressiveness at different formality levels (a
knowledge change), not special cases in code. Phase 4 curation and Phase 6
evaluation should judge whether this matters to people.

---

## 5. Writers and the trust boundary (`src/engine/writer.ts`, `prompt.ts`)

**`TemplateConceptWriter`** (deterministic, no model):

- composes each concept from the aesthetic record (its definition sentence,
  silhouettes, materials, palette) and the interpreted context;
- removes avoided colors and climate-inappropriate fabrics, uses preferred
  colors as the accent, and adds one remedy per weather constraint;
- cites the aesthetic's record and the principles it applied.

It runs in tests and local runs, and is the fallback. **It makes no claim to
editorial quality.**

**`ModelConceptWriter`** makes one call per write through
`TextGenerationModel`, the same interface as the Phase 0 pipeline core.

- **Trusted instructions** come only from code. They name engine values:
  roles, aesthetic slugs and evidence ids (validated slugs), issue codes and
  field names.
- **The request** (all user text plus its interpretation) is JSON inside a
  `<<<AURA_REQUEST_DATA nonce=…>>>` block.
- **Evidence** goes inside a `<<<AURA_EVIDENCE_DATA nonce=…>>>` block via
  `renderEvidenceAsData`.

Each block has its own random nonce, so text inside cannot close it. Tests
put a fake closing delimiter and an injected instruction in `occasion` and
check that neither escapes the block.

**Revision feedback** carries only issue codes, roles and field names (for
example `avoided_color · best_bet · paletteDirection`). It never quotes
request or model text, so a model's own output cannot be replayed as an
instruction.

**What the model is told:**

- one concept per assignment, with a specific thesis (adjectives are not a
  thesis);
- never use an avoided color;
- meet every weather constraint;
- cite only provided ids, including the aesthetic's own record;
- respect a stated gender expression without stereotyped defaults, and stay
  open to any expression when none is stated;
- make no regional or trend claims without regional or contemporary
  evidence;
- keep everything age-appropriate for minors.

---

## 6. Validation (`src/engine/validate.ts`)

The checks are deterministic and structural:

| Code | Check |
|---|---|
| `role_coverage` | Exactly one concept per role |
| `aesthetic_mismatch` | Each concept uses its assigned aesthetic |
| `evidence_not_provided` / `evidence_missing_reference` | Cites only ids the writer was given, and always the aesthetic's own record |
| `avoided_color` | No avoided color in any field that describes the look (the rationale may explain the avoidance) |
| `generic_thesis` | At least 8 words, names a garment, shape or material, and isn't carried by praise words ("stylish", "elegant", "perfect", …) |
| `vague_direction` | Each direction has at least 4 words |
| `missing_constraint` | Each weather or activity constraint is addressed by a remedy term ("water-resistant", "insulating", "linen", "brimmed hat", …). Restating the forecast ("rainy", "windy") does not count. |
| `not_distinct` | Token overlap between any two concepts' identity text is at most 0.45 |
| `unsupported_claim` | Without contemporary evidence: no trend or "this season" claims. Without regional evidence: no "locals" / "Parisian" / "<city> style" claims. |
| `minor_safety` | For minors, no revealing or sexualized styling terms |

**What this does not judge.**

- The keyword checks are heuristics. Passing them shows a concept addresses
  each requirement in words, not that it is good.
- Composition, distinctiveness as people perceive it, and visual potential
  belong to Phase 4's rubric and human calibration.

---

## 7. Budget and fallback (`src/engine/plan.ts`)

- **Budget.** At most **2 model calls** per request: a draft, plus one
  revision. Set it with `maxModelCalls` or `--max-calls`.
- **Revision.** A draft that fails validation is revised once, with issue
  codes.
- **Provider errors.** A provider error waits 1 second, then uses the second
  call.
- **Fallback.** If no valid collection arrives within budget, the engine
  returns the template collection with `status: "fallback"`,
  `generationMode: "template_fallback"` and `budgetExhausted: true`. It
  never loops and never returns an invalid model collection.
- **Diagnostics.** Each attempt records its purpose, latency, outcome
  (`ok`, `provider_error`, `parse_error`, `schema_error` or
  `validation_failed`), issue codes and token usage when reported.

---

## 8. Running it

```bash
npm run concepts                       # template writer, all 20 scenarios, no keys
npm run concepts -- fixtures/scenarios/19-london-work-drizzle.json
GEMINI_API_KEY=… npm run concepts -- --writer gemini --save-prompts   # real model
npm run concepts -- --writer gemini --model <id> --max-calls 2 --as-of 2026-10-14
```

**Output.** Output goes to `baselines/local/concepts-<writer>-<timestamp>/`
(git-ignored):

- `scenarios/<id>.json`, the full collection;
- `summary.json`;
- `summary.md`, with roles, distances, overlap, validity, calls and latency,
  plus the issues seen, including those from failed model attempts;
- with `--save-prompts`, `prompts/<id>-call<n>.txt`.

The command exits 1 if any collection is invalid.

**Model.** The default model is the pipeline's `PIPELINE_TEXT_MODEL`
(`gemini-2.0-flash`), which keeps results comparable with the Phase 0
baseline. **Assumption:** that model id is still served; pass `--model`
otherwise. The Gemini writer requests `responseMimeType: application/json`.
`.env` is loaded, and `src/utils/config.ts` is never imported.

**Real model results: pending.** This environment has no `GEMINI_API_KEY`.
The milestone question ("compelling, diverse concepts from sparse context")
needs a Gemini run and a human read of its 60 concepts.

---

## 9. What Phase 3 can consume

Phase 3 now uses these; see [`OUTFIT_COMPOSITION.md`](./OUTFIT_COMPOSITION.md).

All of the following is **Implemented**:

| Use | API |
|---|---|
| Plan three directions for a context | `planStyleDirections(context, store, {writer, asOf, region?, maxModelCalls?})` → `ConceptCollection` |
| Per-concept direction for garment composition | `concept.silhouetteDirection`, `proportionDirection`, `paletteDirection`, `materialDirection`, `definingDetails`, `aesthetic`, `evidenceIds` |
| Constraints every outfit must meet | `collection.interpreted.constraints` (codes and text), `signals.avoidedColors`, `signals.formalityBand`, `signals.minor` |
| Re-check composed outfits | `validateCollection` patterns are reusable per code (`missing_constraint`, `avoided_color`, `minor_safety`, `unsupported_claim`) |
| Run keyless | `TemplateConceptWriter`, `runConceptScenarios`, `npm run concepts` |

**Not in Phase 2:**

- garment-level outfits (Phase 3);
- the quality rubric, ranking and curation (Phase 4);
- API, storage and caching (Phase 5);
- blind evaluation (Phase 6);
- any change to the existing pipeline or the consumer app.
