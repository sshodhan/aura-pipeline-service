# Fashion Intelligence Service — standalone design

**Status:** Proposed design informed by consumer application; implementation must proceed phase by phase. **Repository:** `sshodhan/aura-pipeline-service`.

## Product narrative
Aura helps people explore styles that work for them. A boutique's compelling window communicates a coherent editorial point of view before the visitor has filled in a profile. The service should deliver that level of taste from sparse context rather than produce three generic weather-appropriate clothing lists.

The engine answers: what is worth wearing; what fits this context; what distinct directions deserve exploration; and which complete outfits merit publication. Personalization comes later and must not be a prerequisite for good recommendations.

## Architectural boundary
The service owns fashion evidence, concept planning, styling composition, curation, evaluation, independent API, optional cache, and offline batch. It understands Aisle and the client inputs but imports no consumer source or browser state. Visual imagery is a downstream responsibility.

## Target design
```
Offline editorial evidence refresh ──> Versioned Fashion Knowledge Store
                                          |
Independent JSON/HTTP request ──> Context Interpreter
                                          |
                                  Style Direction Planner
                                          |
                                    Outfit Composer
                                          |
                                  Quality Evaluator
                                          |
                                  Collection Curator
                                          |
                              Versioned output + diagnostics
                               /                       \
                   Optional storage            Independent evaluation
```

### Knowledge
Versioned evidence records: category (timeless / contemporary / regional / aesthetic); description; source URL and dates; applicable regions, seasons, silhouettes and materials; provenance; editorial status; validity window. Never relabel stale observations as current trends. Distinguish measured popularity from editorial prominence. Start curated; do not scrape unlicensed imagery or treat source text as executable prompts.

### Context
Typed input includes city, occasion, lifestyle, temperature and weather, optional demographics and explicit preferences. Interpret into hard constraints, explicit preferences, opportunities and unknowns. Age/city/gender are not deterministic taste. User constraints outrank trend evidence.

### Style directions
Produce three named `StyleConcept` roles: `best_bet`, `adjacent`, `exploration`. Each needs an aesthetic thesis, silhouettes, proportions, palette, materials, defining details, contextual rationale, and evidence IDs. Diversity involves silhouette, formality, texture and aesthetic identity; not simply garment names or colors.

### Outfit composition
Convert each concept to complete garment specifications with category, material, fit, color, silhouette and layering guidance; explicit proportion, color and texture strategies; and a concise editorial rationale. The service chooses garments; visualization should depict rather than reinterpret them.

### Quality and curation
Separate hard constraints (weather, occasion, garment completeness, explicit avoids) from subjective styling assessments (coherence, distinctiveness, visual potential). Collection-level redundancy and practical range matter. Do not reward words such as 'perfect' or 'elegant' as evidence of quality. Use bounded revision, max-call budget, deterministic fallbacks, and human-calibrated evaluation.

### Independent API and execution
Proposed: `POST /v1/recommendations`, `GET /v1/recommendations/{id}`, authorized evaluation endpoint, knowledge status, health; all versioned JSON, request and collection IDs, diagnostics, structured errors. A pure `recommend(context, options)` engine is shared by HTTP, CLI and optional batch. Redis must be optional; cache identities capture context, preferences, weather and model/knowledge versions. No live trend scraping on the user request path.

### Testing
Compare direct Gemini (A), existing pipeline (B) and redesigned service (C) on equivalent fixed contexts. Begin with 20 diverse fixtures, then larger blind evaluations. Measure human preference, style coherence, relevance, range, schema validity, costs, tokens, retries and first-candidate latency. Do not treat model rubric scores as validated probabilities.

## Phases (one focused PR per stage after initial review)
0. **Audit and baseline:** independently load/run the existing pipeline using mock fixtures, without keys or Redis; describe actual behavior, input loss, coverage gaps and generation economics.
1. **Fashion knowledge:** evidence catalog, provenance, status and offline refresh.
2. **Style direction:** three expressive context-grounded concepts.
3. **Outfit composition:** structured garment details and coherent styling.
4. **Curation and quality:** constraint validation, rubric, collection ranking, bounded revision.
5. **Independent API/storage:** versioned routes, optional cache, standalone runner, batch.
6. **Evaluation/release:** blind comparisons, latency and budget gates, explicit promotion.

**Phase 0 only is authorized for implementation by this design.** No consumer app edits.

## Review-informed amendments
- The existing pipeline lacks gender, age and detailed personal preferences, so 'same input' comparisons are NOT valid until input parity exists; report dropped fields explicitly.
- Current consumer Aisle produces a default look and two sequential alternatives, which conceptually map to the target three roles; the service should not inherit browser lifecycle.
- The pipeline currently pins `gemini-2.0-flash` and the consumer uses a newer Gemini family. Verify provider availability, record model versions, and do not present a cross-model comparison as controlled.
- Existing contract drift and cache-key defects are prerequisites to integration, but should be documented rather than repaired in the behavior-preserving baseline phase.
- The service's Redis/mass precomputation objective is an optimization phase, not the product-quality criterion.
