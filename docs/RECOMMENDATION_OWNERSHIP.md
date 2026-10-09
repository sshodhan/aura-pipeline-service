# Recommendation ownership — independent service, informed by consumer

**Status:** Proposed target ownership; consumer implementation observations verified at `64cd967`; service implementation at `24f7672`.

## Ownership matrix
| Capability | Present today | Intended long-term owner | Migration trigger |
|---|---|---|---|
| Fashion trend and city knowledge | Duplicated in service and consumer | Service | Quality and freshness proven |
| Signal taxonomy and precedence | Duplicated; drift exists | Shared versioned contract; service interprets | Compatibility tests pass |
| Style concept selection | Fixed consumer Aisle directions; service style matrix | Service | Blind evaluation improvement |
| Garment recommendation and composition | Both use Gemini independently | Service | Recommendation parity and improved quality |
| Feasibility / quality checks | Service heuristic scoring; limited consumer checks | Service | Offline quality evaluation validated |
| Three-look curation | Consumer Aisle diversity check | Service selects; consumer displays | Collection API and tests pass |
| Current look / Aisle lifecycle | Consumer | Consumer | Never migrate |
| Visualization, image prompts / assets | Consumer; service has hero-image planning helpers | Consumer / separate renderer | Never make recommendation engine depend on it |
| Refine interaction | Consumer | Consumer UI; service handles refine intent in API | Refine API contract tested |
| Profile collection, login, Save/Share | Consumer | Consumer | Never migrate |
| Precompute, cache and batch generation | Service | Service | Cache correctness + demonstrated demand |
| Personalization ML | Prototypes in both repos | Future decision | Reliable, consented signals and offline evaluation |

## Verified gaps and drift
- Consumer maintains several city/style taxonomies and mappings; some overlap with service definitions. Do not bulk-delete: migrate only once output parity and Phase 6 quality gates pass.
- Consumer region matching has an overly broad `la` substring case; independent service must use unambiguous location IDs instead of repeating this defect.
- The current service `src/data/hero-images.ts` includes image-oriented concerns, but image generation is not a recommendation-core requirement.
- Service API is cache-only and current scoring is a heuristic, not proof of attractive fashion.
- Consumer has richer identity and preferences not represented in the current pipeline input contract.
- Experimental ML tracking is not established as live personalization authority.

## Dependency rules
1. The standalone service never imports consumer components, browser state, authentication or image generation code.
2. A service recommendation is a full, renderer-independent outfit specification, not a prompt for the consumer to invent garments.
3. Shared knowledge is a versioned data contract with schema and fixture tests, not copy-pasted application code.
4. The consumer owns visual lifecycle, stable Aisle selection and media ownership.
5. Service implements CLI fixtures, an independent API, mock provider, and optional storage.
6. All provider/model/knowledge changes are measurable and reversible; no secret values enter fixtures.
7. Contract drift is documented and resolved deliberately, rather than silently normalized.

**Rule:** Product awareness is required. Runtime code coupling is not.
