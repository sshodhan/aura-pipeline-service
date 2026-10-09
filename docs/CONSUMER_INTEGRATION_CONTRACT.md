# Consumer integration contract — verified reality and future compatibility

**Consumer:** `sshodhan/v0-aura-stylist-agent` at `64cd967` (read-only review). **Service:** `sshodhan/aura-pipeline-service` at `24f7672`. **Status:** interface design, NOT an active integration.

## Verified current state
- Consumer `main` does not call the pipeline service. Its bridge `lib/pipeline-client.ts` was described on an unmerged branch, not consumer `main`.
- Consumer uses free-text geocoding, Open-Meteo weather in degrees Celsius, 7 adult personas (5 teen categories when applicable), 8 occasions with server-side `other`, 6 vibes, 6 color energies; gender default female and age-range default 25–35. Explicit fit/silhouette and favorite/avoided colors are supported. Comfort, secondary persona and intelligence toggles are collected but not applied in the reviewed recommendation path.
- Consumer recommendation uses a Gemini JSON response schema. Existing outputs are `OutfitSuggestion` with four garment strings (baseLayer, lowerBody, outerwear, footwear), `proTip`, `styleReasoning`, `weatherStory`, `activity`, `coffeeSpot`, `storeType`, `lookTitle`, optional `*Why`, and accessories. `StyleRecommendation` is a narrower partner shape. `AppLook` supplies a precedent for external-look importing.
- Aisle: the default look plus two alternatives chosen from fixed persona-specific directions; ≥2 changed garments; sequential generation on explicit switch; browser-local snapshot.
- Current service API: `GET /outfits/:cityId?persona=...&occasion=...&vibe=...`; returns `outfit`, `alternatives`, `fromCache`, `matchType`, `confidence`, `generatedAt` or a 404 on miss. It is NOT an on-demand recommendation API.

## Known contract drift
| Subject | Existing SIGNAL_CONTRACT.md | Implemented reality |
|---|---|---|
| URL | `GET /outfits?cityId=...` | `GET /outfits/:cityId` |
| Cache key | `cityId:persona:occasion:vibe` | Includes date and weather; inspect implementation before changing |
| Response | `outfits`, `cached` | `outfit`, `alternatives`, `fromCache`, `matchType` |
| Client bridge | `lib/pipeline-client.ts` | Not in consumer main |
| Context | Reduced persona/occasion/vibe | Consumer handles richer demographic, fit, colors and refinement |

## Proposed versioned service contract (Planned)
Request must support city/location, normalized weather in Celsius, occasion, lifestyle/persona, optional vibe/color, explicit demographic context, fit and avoided-color preferences, and optional refine instructions. Unknown inputs remain unknown; no synthetic user-history requirement.

Response: `schemaVersion`, stable `collectionId`, `knowledgeVersion`, `engineVersion`, context fingerprint, up to three `recommendations` with roles `best_bet` / `adjacent` / `exploration`, style concept, complete garment specification, rationale, fashion evidence IDs, validity status, and diagnostics. A consumer adapter (future, owned by consumer) should convert this response to its existing `OutfitSuggestion` without another garment recommendation call. Preserve the ten core fields the Aisle snapshot requires; `*Why` fields strongly recommended.

**Compatibility rules:** The service must not import consumer TS types or React code. Use JSON fixtures and contract tests. Normalize temperature at the boundary, preserve stable identities across requests and retries, represent unsupported cities without pretending supported, and version any schema-breaking change.

## Non-goals
This document does not authorize coupling, consumer code changes, deployment, or replacement of the existing image generation path.
