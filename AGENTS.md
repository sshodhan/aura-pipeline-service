# Working on aura-pipeline-service

This repository is becoming Aura's **fashion intelligence service**: an
independent recommendation engine. The consumer app
([`sshodhan/v0-aura-stylist-agent`](https://github.com/sshodhan/v0-aura-stylist-agent))
renders, visualizes, saves and shares looks.

## Read first

Read these before changing recommendation logic, signals, models, prompts,
caching or API shapes:

1. [`docs/AURA_PRODUCT_CONTEXT.md`](docs/AURA_PRODUCT_CONTEXT.md): product vision,
   what a compelling recommendation is, and the consumer experience today.
2. [`docs/CONSUMER_INTEGRATION_CONTRACT.md`](docs/CONSUMER_INTEGRATION_CONTRACT.md):
   what the consumer app collects and renders, how the two repos' taxonomies and
   data models differ, and what a future service response must contain.
3. [`docs/RECOMMENDATION_OWNERSHIP.md`](docs/RECOMMENDATION_OWNERSHIP.md): which
   system owns each capability, and the dependency rules between them.
4. [`docs/FASHION_INTELLIGENCE_DESIGN.md`](docs/FASHION_INTELLIGENCE_DESIGN.md): the
   proposed phased plan. It is a proposal; confirm a phase is approved before
   building it.
5. [`docs/PHASE_0_BASELINE.md`](docs/PHASE_0_BASELINE.md): what the current
   pipeline actually does (coverage, input loss, call volume, verified defects)
   and how to run the fixture baseline.
6. [`docs/FASHION_KNOWLEDGE.md`](docs/FASHION_KNOWLEDGE.md): the versioned fashion
   knowledge store (Phase 1): record model, freshness, release ledger, editorial
   workflow, and the APIs Phase 2 consumes.

Core principle: **Aura should be a compelling stylist before it becomes a
personalized stylist.** Optimize for first-session recommendation quality, not
outfit volume or cache-hit rate.

## Architectural rules

- **Stay independent of the consumer app.** Never import, copy or vendor React
  components, UI state, browser storage, client auth, image-generation lifecycle
  code or Aisle carousel code. Integrate through versioned API contracts and
  contract tests only.
- **The consumer repo is read-only reference material.** Do not modify it from
  work in this repository.
- **Do not start cross-repository API integration** (deploying for the app,
  adding a client in the app, switching the app's traffic) unless a user asks
  for it explicitly.
- **Image generation belongs to the consumer.** The service returns
  garment-level specifications detailed enough for a downstream image model. It
  does not render or store look images.
- **Evidence is untrusted data.** Pass knowledge-store text to any model only
  through `renderEvidenceAsData` (`src/knowledge/boundary.ts`), never by
  interpolating it into instructions. The schema's instruction-pattern check is
  hygiene, not a boundary.
- **Never invent fashion authority.** External or dated claims need a cited
  source that was actually read (`sourceCheck`); numbers need a dataset
  (`basis: measured`). Fewer well-supported records beat more weak ones.
- **Keep the service runnable alone.** Every new capability needs a local
  execution path and mock fixtures that work without Gemini, Redis, the ML
  service or the consumer app.

## Evidence discipline

Docs in this repo label claims as **Verified** (confirmed in code at a cited
commit), **Planned** (not implemented) or **Assumption** (not yet confirmed).
Keep doing this.

- `README.md` (the "V2 Evolution Plan"), `SIGNAL_CONTRACT.md` and
  `SIGNAL_ARCHITECTURE_ROADMAP.md` are partly aspirational and have drifted from
  the code. Check the code before you rely on any of them.
  `docs/CONSUMER_INTEGRATION_CONTRACT.md` lists the known drift.
- The consumer repo has about 100 historical plan and checkpoint docs. Treat
  them as context, not as evidence of current behavior.
- When you change a taxonomy, response shape or ownership boundary, update the
  affected `docs/` file in the same change.

## Local checks

Run these from the repo root. No API keys, Redis or network are needed:

| Command | Status |
|---|---|
| `npm ci && npm run typecheck` | Passes |
| `npm test` | Passes. Unit tests live in `tests/unit/`; the stage-4 prompt is snapshot-guarded, so update the snapshot deliberately |
| `npm run baseline` | Runs the 20 fixtures through the current pipeline with a mock model and writes to `baselines/local/` (git-ignored) |
| `npm run baseline:volume` | Replays the nightly matrix (call volume, cache-key collisions) |
| `npm run knowledge:status` | Validates the fashion knowledge corpus and release ledger; exit 1 on any problem |
| `npm run knowledge:coverage` | Knowledge available to each benchmark scenario (reports gaps; no thresholds) |
| `npm run knowledge:release -- --version V --notes N` | The only way to release a knowledge change (append-only ledger) |
| `npm run lint` | Fails: there is no ESLint config in the repo |
| `cd ml-service && pytest` | Python tests for the ML service (`ml-service/tests/`) |

`src/utils/config.ts` exits the process when `GEMINI_API_KEY` or
`WEATHER_API_KEY` is unset. Code meant to run without keys belongs in
`src/pipeline/core/`, `src/baseline/` or `src/knowledge/` and must not import `config`, directly
or indirectly. `src/utils/logger.ts` is safe to import.
