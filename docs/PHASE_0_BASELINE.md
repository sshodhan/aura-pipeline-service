# Phase 0: Baseline and Architectural Boundaries

**Status:** Phase 0 tooling, keyless analysis and tests are complete. The
**real Gemini baseline is pending**: it needs `GEMINI_API_KEY` (see §7).

**Scope:** Phase 0 of [`FASHION_INTELLIGENCE_DESIGN.md`](./FASHION_INTELLIGENCE_DESIGN.md).
Run the existing pipeline independently from fixtures, without keys or Redis,
and describe its actual behavior, input loss, coverage gaps and generation
economics. No styling behavior was changed.

**Service code reviewed:** this branch. Facts about the original code refer to
commit `24f7672`.

> **Labels.**
> - **Verified:** read in code.
> - **Measured (replay):** computed by running the pipeline's own stage 2–3 code
>   deterministically. No model is involved, so the result needs no key.
> - **Measured (mock):** produced by the runner with the mock model. This
>   exercises plumbing only and says **nothing about outfit quality**.
> - **Pending:** needs a real Gemini run.

---

## 1. What Phase 0 adds

| Piece | Path | Purpose |
|---|---|---|
| Pipeline core, isolated | `src/pipeline/core/` | Stage-4 prompt and parser (`outfit-prompt.ts`), retry loop with an injectable model and per-attempt diagnostics (`generate-outfits.ts`), weather styling rules, seasonal trend defaults, bundle assembly. Moved out of `services/gemini.ts`, `services/weather.ts` and stages 1 and 4 **unchanged**. The prompt was checked byte-identical against the pre-move implementation on all 20 fixtures and is snapshot-tested. |
| Logger without config | `src/utils/logger.ts` | Reads `LOG_LEVEL` and `NODE_ENV` directly with the same defaults, so modules that only log no longer require API keys. |
| Benchmark scenarios | `fixtures/scenarios/*.json` | 20 cold-start requests in the design's `RecommendationContext` shape. Each also records how it maps onto the pipeline's fixed signals, its expected constraints and its known failure cases. |
| Baseline runner | `src/baseline/`, `src/scripts/run-baseline.ts` | Runs each scenario through stages 2–3 (coverage), the stage-4 loop, bundle assembly and stage-5 rule scoring. Writes per-scenario JSON plus `summary.json` and `summary.md`. |
| Call-volume analysis | `npm run baseline:volume` | Replays the nightly matrix for all 12 cities. |
| Tests | `tests/unit/` (25 tests) | The repository's first TypeScript tests. `npm test` previously exited 1 with "No test files found". |

### How to run

```bash
npm ci
npm run typecheck && npm test
npm run baseline                    # mock model, no keys → baselines/local/ (git-ignored)
npm run baseline:volume             # nightly call-volume replay
# Real baseline (see §7):
NODE_USE_ENV_PROXY=1 npm run baseline -- --provider gemini --out baselines/gemini-<date> \
  [--model <id>] [--price-in <usd/1M tokens> --price-out <usd/1M tokens>]
```

---

## 2. Map of implemented and planned features (Verified)

| Area | Implemented | Planned or documented, but not implemented |
|---|---|---|
| Stage 1: data collection | OpenWeatherMap current weather and forecast for 12 hard-coded US cities; static city profiles | Trend research. `collectTrendSignals` returns hard-coded seasonal lists ("TODO: Integrate with trend APIs") |
| Stage 2: signal aggregation | City archetypes → top personas, occasions and vibes, through fixed mapping tables | Trend signals are computed but **never reach the prompt** |
| Stage 3: style matrix | Persona × occasion × vibe × color energy, filtered by hard compatibility tables and city priorities | Aesthetic direction design |
| Stage 4: outfit generation | One Gemini call per matrix entry (`gemini-2.0-flash`, free-text JSON, no `responseSchema`), with 2 retries | Gender, age, preferences, structured garment schema, budgets |
| Stage 5: quality scoring | Keyword and rule heuristics on the **first outfit only**, optionally blended with the ML service | Calibrated or aesthetic quality evaluation |
| Stage 6: cache population | Redis `SETEX` with a 24-hour TTL, plus a per-city index set | Versioned, curated collections |
| API | `GET /outfits/:cityId` (cache lookup only; 404 on miss), `/cities`, `/health`, `POST /pipeline/trigger`, `/feedback`, `/users/:id/profile` | V2 routes (`/v2/outfits`, `/v2/signals`, `/v2/season`), the README's response builder, color filter and catalog hints |
| V2 data modules | `src/data/*` (signal guidance, seasonal trends, hero images) | **Not imported anywhere** |
| ML service | FastAPI scorer, embeddings and re-ranker; stage 5 uses it only when healthy | Re-ranking at serve time; training data |
| Tests | Python tests in `ml-service/tests`; **this phase adds** `tests/unit` | Integration tests (`npm run test:integration` points at a missing `tests/integration`) |
| Tooling | `typecheck`, `build`, `dev` | `lint` (no ESLint config); `pipeline:manual` and `seed:cities` point at missing `src/scripts/*.ts` |

---

## 3. Generation economics (Measured, replay)

From `npm run baseline:volume`, characterized in `tests/unit/call-volume.test.ts`:

| Metric | Value |
|---|---|
| Gemini calls per nightly run | **894**, up to 2,682 when every call uses both retries |
| Does matrix size vary with temperature? | No; the cold-weather penalty never drops an entry below the confidence cutoff |
| Distinct Redis bundle keys written | **149** |
| Bundles overwritten because the key omits colorEnergy | **745 (83.3%)**: each persona × occasion × vibe is generated 6 times and only the last write survives |
| Tier limits (`outfitCombinations`, 200–500) | Never bind: the largest matrix is Portland's at 114 entries |
| Occasions never served in any city | `formal`, `home` |
| Personas never served in any city | `athletic` |

| City | Calls / night | Distinct keys | Occasions served |
|---|---|---|---|
| new-york-ny | 96 | 16 | date, dinner, work |
| los-angeles-ca | 96 | 16 | active, errands, hangout, work |
| chicago-il | 42 | 7 | active, dinner, work |
| miami-fl | 66 | 11 | errands, hangout, work |
| san-francisco-ca | 78 | 13 | active, errands, hangout, work |
| seattle-wa | 78 | 13 | active, errands, hangout, work |
| austin-tx | 96 | 16 | active, errands, hangout, work |
| boston-ma | 42 | 7 | active, dinner, work |
| denver-co | 96 | 16 | active, errands, hangout, work |
| nashville-tn | 48 | 8 | errands, hangout |
| atlanta-ga | 42 | 7 | active, date, work |
| portland-or | 114 | 19 | active, date, errands, hangout |

This contradicts the volume claims elsewhere. The README says the service
"pre-computes thousands of outfit recommendations daily", and a consumer doc
claims "~40–60K bundles". The code produces 894 calls and 149 surviving
bundles a night.

**Per-call latency, tokens and provider cost are Pending** (§7).

---

## 4. Coverage of the 20 benchmark scenarios (Measured, replay)

| Outcome | Scenarios |
|---|---|
| City supported | 18 of 20 (London and Paris are not pipeline cities) |
| In the nightly matrix, so a cache hit is possible | **10 of 20** |
| Retrieved through the exact key | 1. Exact match needs mild **and** clear weather, because `GET /outfits/:cityId` hard-codes `"mild"`/`"clear"` (`src/api/routes/outfits.ts:58-66`) |
| Retrieved only through the fuzzy `KEYS` scan | 9 |
| Never cached (GET returns 404) | 10: 8 in supported cities, plus the 2 unsupported cities |

Reasons a supported-city request misses the matrix (a scenario can have more
than one):

| Reason | Count |
|---|---|
| Occasion not prioritized for the city | 6 |
| Vibe not prioritized for the city | 5 |
| Persona not prioritized for the city | 3 |
| Persona/occasion pair excluded by `PERSONA_OCCASION_COMPATIBILITY` | 1 |

**The design brief's own example is never served.** "Woman, 36-45, casual
afternoon hangout in New York" misses because New York's matrix has neither
the `casual` persona nor the `hangout` occasion.

---

## 5. Input loss (Measured, replay)

| Input | What happens |
|---|---|
| Gender expression, age range | Dropped in **19 of 19** scenarios that supply them. The prompt has no gender or age, so outputs are not gender-aware and have no teen guardrails. |
| Avoided colors, preferred colors, fit, comfort priority | Always dropped. Avoids are hard constraints in the consumer. |
| Second preferred aesthetic | Dropped (one vibe per bundle) |
| Vibe | **Invented** whenever no aesthetic preference is given |
| Color energy | **Invented** in every scenario without preferred colors; it has no `RecommendationContext` equivalent. The cache key then discards it anyway (§3). |
| City, occasion, lifestyle, weather condition | Free text mapped to fixed enums. Cities outside the 12 are unsupported. |

**Consequence for Phase 6:** Variant B cannot receive input equivalent to the
other variants. Comparisons must report dropped fields; the runner records
them per scenario.

---

## 6. Quality scoring and failure behavior (Verified; Measured, mock)

### Scoring

- **The rule-based scorer does not measure outfit content.** The mock model's
  placeholder outfits (`[mock] top 1`, "placeholder" styling) score **69.8 to
  81.8**. **All 18** clear the orchestrator's publish threshold of 40
  (`src/pipeline/orchestrator.ts:207`).
- **Only the first outfit is scored.** Weather and occasion checks read
  `outfits[0]` alone (`src/pipeline/stages/5-quality-scoring.ts:141, 184`).
  Outfits 2 and 3 are never evaluated.
- **The occasion check rewards self-description.** It counts words such as
  "perfect", "ideal", "polished" and "relaxed" in the model's own
  `overallVibe` and `occasionFit` text (`:185-215`).
- **Regional relevance relies on substring tests that rarely match.**
  `"street-style".includes(archetype)` and
  `"earthy_warm".includes(cityColor)` (`src/models/city.ts:406, 415`).
- **ML scoring is optional.** It is used only when the ML service is healthy,
  and the blended score then **replaces** the rule score (`:235, 268`). Baseline
  runs skip it; the scorer returns 503 until a model is trained.

### Failure behavior (Verified)

| Situation | What happens |
|---|---|
| Model call or JSON parse fails | Retried twice with 1 s then 2 s backoff. Each attempt is now observable as `provider_error` or `parse_error`. |
| An entry fails after its retries | Dropped silently: `processBatch` returns `null` and the run continues (`src/pipeline/stages/4-outfit-generation.ts:113, 129`). The run is still reported as `success` because entry errors are not added to `errors`. |
| Any stage throws | The whole run is marked `failed` and nothing is cached. |
| Response has fewer than 3 outfits | Logged and accepted. |
| Malformed item fields | Accepted: there is no schema validation of items (`src/pipeline/core/outfit-prompt.ts:133`). |
| Outfit and item IDs | Use `Date.now()`, so they are not stable or reproducible (`outfit-prompt.ts:140, 144`). |

---

## 7. Real Gemini baseline (Pending)

The mock run proves the plumbing. It is **not** a quality baseline, and none of
its outfit content or scores should be compared with anything.

To capture the real Variant B baseline:

1. **Add the key.** Put `GEMINI_API_KEY` in the cloud environment's settings
   (or a local `.env`). Environment changes apply to new sessions.
2. **Check model availability.** The pipeline pins `gemini-2.0-flash`
   (`src/utils/models.ts`); the consumer now uses `gemini-3.8-flash`. If the
   pinned model is no longer served, that failure is itself a finding: record
   it. Optionally re-run with `--model <id>`. The summary marks this as an
   override, and it is no longer the pipeline as configured.
3. **Run it.** In proxied environments, Node's built-in `fetch` needs
   `NODE_USE_ENV_PROXY=1`:
   `NODE_USE_ENV_PROXY=1 npm run baseline -- --provider gemini --out baselines/gemini-YYYY-MM-DD`.
   Pass `--price-in` and `--price-out` with current published prices to get
   cost estimates. Without them, cost stays `null`.
4. **Commit the output directory** under `baselines/`, outside `local/`. Fill
   this section with per-call latency (p50/p95), tokens, retries, failures and
   cost.

Runner limitations to keep in mind when reading the results:

- Scenarios run **sequentially**; the nightly pipeline runs batches of 10
  concurrently.
- Weather comes from fixtures, converted through the pipeline's own rules; it
  is not fetched from OpenWeatherMap.
- ML scoring is skipped.
- The season and trend defaults follow the run date.

---

## 8. Verified defects (documented, not fixed in Phase 0)

Phase 0 is behavior-preserving. These defects feed the Phase 5 API and storage
redesign.

| # | Defect | Evidence |
|---|---|---|
| 1 | The exact-match lookup hard-codes `mild`/`clear`, so on most days requests fall through to a fuzzy scan that returns an arbitrary first match | `src/api/routes/outfits.ts:58-66, 84`; `src/services/redis.ts:130, 138` |
| 2 | `KEYS` (O(N), blocking) runs on the request path | `src/services/redis.ts:130` |
| 3 | The bundle cache key omits colorEnergy, so 5 of every 6 bundles are overwritten (§3) | `src/models/outfit.ts:213-223` |
| 4 | `parseBundleCacheKey` splits `{range}_{condition}` on `_`, which breaks conditions such as `partly_cloudy`, `light_rain` and `heavy_rain` | `src/models/outfit.ts:240` |
| 5 | Seasonal trend signals never reach the prompt | `src/pipeline/stages/2-signal-aggregation.ts` vs `src/pipeline/core/outfit-prompt.ts` |
| 6 | No gender, age or preferences reach generation (§5) | `src/pipeline/core/outfit-prompt.ts:30-113` |
| 7 | Stage 5 scores only the first outfit, using keywords (§6) | `src/pipeline/stages/5-quality-scoring.ts:141, 184-215` |
| 8 | Entry-level generation failures do not mark the run `partial` | `src/pipeline/stages/4-outfit-generation.ts:113-129`; `src/pipeline/orchestrator.ts` |
| 9 | `POST /pipeline/trigger` is unauthenticated while Cloud Run allows `allUsers`, so anyone can start an 894-call run | `src/api/routes/pipeline.ts:22`; `infra/components/cloud-run.ts:41, 138-143` |
| 10 | Production CORS origins are placeholders | `src/api/server.ts:38-39` |
| 11 | `package.json` scripts point at missing files; there is no ESLint config | `package.json:13-14, 19` |
| 12 | README and `SIGNAL_CONTRACT.md` describe endpoints, keys, responses and volumes the code does not have | [`CONSUMER_INTEGRATION_CONTRACT.md`](./CONSUMER_INTEGRATION_CONTRACT.md) §A7.3; §3 above |

---

## 9. Prerequisites for Phase 1

- [x] Pipeline core runs without keys, Redis or the consumer app.
- [x] 20-scenario fixture set with a validated schema.
- [x] `npm test` passes, and the stage-4 prompt is snapshot-guarded.
- [x] Generation economics (calls, cache efficiency) measured by replay.
- [ ] Real Gemini Variant B baseline captured and committed (§7).
- [ ] The user reviews the scenario set and its expected constraints. They
      become the Phase 6 benchmark.
