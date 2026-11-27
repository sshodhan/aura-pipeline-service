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

---

## Appendix B: Styling capability inventory (Q6)

This appendix lists every styling capability, meaning fashion intelligence
rather than UI, that exists in the consumer today, next to its counterpart in
this service.

- **Consumer column:** Verified at consumer commit `64cd967`; paths are
  relative to the consumer repo.
- **Service column:** Verified at `24f7672`.
- **Eventual owner:** follows the matrix above. Nothing moves until the
  migration trigger in that matrix is met.

| Capability | Consumer today | Service today | Eventual owner |
|---|---|---|---|
| Outfit recommendation prompt and schema | `app/actions/gemini-actions.ts:329-773` (`gemini-3.8-flash`, JSON `responseSchema`) | `src/services/gemini.ts:37-120` (`gemini-2.0-flash`, free-text JSON) | Service |
| Signal precedence / conflict resolution | `lib/signalPrecedence.ts:76-396` (occasion always primary; weights only logged) | Hard exclusion of combinations (`src/models/signals.ts:242-276`); heuristic consistency score (`src/pipeline/stages/5-quality-scoring.ts:90-126`) | Service (context interpreter) |
| Occasion, vibe, color-energy and silhouette guidance text | `gemini-actions.ts:95-271` | `src/models/signals.ts:29-148`; unused richer tables in `src/data/signal-guidance.ts` | Service (aesthetic vocabulary) |
| Gender-specific garment rules | `gemini-actions.ts:357-391` | None | Service (text). Image identity rules (`gemini-actions.ts:897-935`) stay with the consumer |
| Age-aware styling and teen guardrails | `packages/core/src/ageDescription.ts:34-173` | None | Service, as hard constraints. No age-based taste defaults (design boundaries) |
| Identity defaults (`female`, `25-35`) | `gemini-actions.ts:352-354`; `packages/core/src/ageRanges.ts` | None | Consumer (product decision). The service treats unknown as unknown |
| Seasonal trends | `lib/fashionContext/seasonalTrends.ts:203-320` (static; Fall 2025 served in 2026) | Stage 1 seasonal defaults, never prompted (`src/pipeline/stages/1-data-collection.ts:113-147`); unused `src/data/seasonal-trends.ts` | Service (knowledge store with provenance) |
| Regional / city styles | Three tables: `lib/fashionContext/regionalStyles.ts:632-761` (16 regions, `"la"` substring defect), `gemini-actions.ts:273-327`, `lib/fashionInsightGenerator.ts:8-19` (computed, never rendered) | `src/models/city.ts` (12 US cities, `styleDNA`) | Service (knowledge store) |
| Taxonomy lists | 7+ copies: `components/StylistTab.tsx:103-230`, `ProfileModal.tsx:49-57`, `OnboardingModal.tsx:225-252`, `packages/core/src/signals.ts`, `packages/contracts/src/index.ts:28-39`, and others | `src/models/signals.ts` (stated as a mirror of the consumer) | Service publishes the vocabulary; the consumer owns labels and emoji |
| Persona weather ranking (pill order) | `StylistTab.tsx:281-347` | None | Consumer (UI ordering) |
| Refine mapping (casual/dressier → persona; mood → vibe) | `StylistTab.tsx:1090-1118, 2046-2047` | None | Consumer interaction. The service accepts the refined context |
| Aisle directions and garment-diversity gate | `lib/aisleInspiration.ts:4-134`; `gemini-actions.ts:586-608, 753-757` | Style matrix enumerates signal combinations (`src/pipeline/stages/3-style-matrix.ts`) | Service (direction planner and collection curator). The consumer keeps carousel and selection state |
| Inference engine and mapping tables | `lib/inferenceEngine.ts`; `packages/core/src/mappings.ts:13-266`. No production callers on web | None | Not migrated (unused) |
| Signal aggregation | `lib/signalAggregator.ts:31-222`. `aggregateAllSignals` has no callers | Stage 2 (`src/pipeline/stages/2-signal-aggregation.ts`) | Service (context interpreter) |
| On-device ML (confidence, preference detection, precedence learning) | `lib/ml/*`. Writes to `localStorage`, never read back | `ml-service/` (XGBoost scorer, embeddings, re-ranker); optional, blended in stage 5 | Future decision (personalization is secondary) |
| Outfit item parsing (garment cards) | `lib/outfitItems.ts:105-192` | n/a (structured `items[]`) | Consumer adapter |
| Image, flat-lay and video prompts; garment crops | `gemini-actions.ts:868-1335`; `app/actions/video-actions.ts`; `lib/imageUtils.ts:23-46` | `src/data/hero-images.ts:289` builds image prompts (unused) | Consumer |
| Lifestyle concierge (`activity`, `coffeeSpot`, `storeType`; Plan places) | Outfit schema fields; `gemini-actions.ts:1599-1657` | None | Open question. The consumer requires these fields today (`CONSUMER_INTEGRATION_CONTRACT.md` §A8.1) |
| Partner request normalization and job orchestration | `lib/integrations/core/*` | None | Consumer (partner product); it may call the service later |
| Recommendation identity / cache keys | `lib/cacheKeys.ts:39-92` (`v7`) | `src/models/outfit.ts:213-251` | Service owns recommendation IDs and versions. The consumer owns image cache keys |
| Recommendation-quality evaluation | None beyond required schema fields and the Aisle gate | Heuristic stage-5 scores | Service (Phase 6 harness) |

### B.1 Boundary flags inside this repository (Verified)

- **`src/data/hero-images.ts`** builds image-generation prompts and Cloud
  Storage URLs. Image generation is consumer-owned. The module is not imported
  anywhere, so it can be removed or moved behind an optional rendering adapter
  without behavior change.
- **`src/data/*` (signal guidance, seasonal trends, hero images)** is not
  imported by any route or stage. It is planned V2 material, not live
  behavior.
- **`SIGNAL_CONTRACT.md`** names the consumer's `types/signals.ts` as the
  source of truth. That inverts the target ownership: the service should own
  the recommendation vocabulary, and the consumer should own presentation.
