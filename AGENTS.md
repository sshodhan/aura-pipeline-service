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

Run these from the repo root. Their status was verified at commit `24f7672`:

| Command | Status |
|---|---|
| `npm ci && npm run typecheck` | Passes |
| `npm test` | Exits 1: "No test files found". There are no TypeScript tests yet. |
| `npm run lint` | Fails: there is no ESLint config in the repo |
| `cd ml-service && pytest` | Python tests for the ML service (`ml-service/tests/`) |

`src/utils/config.ts` exits the process if `GEMINI_API_KEY` or
`WEATHER_API_KEY` is unset. Tests and local harnesses must stub configuration
rather than need real keys.
