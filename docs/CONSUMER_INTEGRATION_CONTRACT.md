# Consumer integration contract — verified reality and future compatibility

**Consumer:** `sshodhan/v0-aura-stylist-agent` at `64cd967` (read-only review). **Service:** `sshodhan/aura-pipeline-service` at `24f7672`. **Status:** interface design, NOT an active integration.

## Verified current state
- Consumer `main` does not call the pipeline service: no `PIPELINE_API_URL` and no `lib/pipeline-client.ts`. *Doc claim (unverified):* the client bridge exists only on the unmerged consumer branch `claude/server-pipeline-architecture-docs-dfLui` (consumer `docs/reference/RECOMMENDATION_QUALITY_ECOSYSTEM.md:25-28, 83`).
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

---

## Appendix A: Verified evidence (Q1–Q7)

The sections above are the normative summary. This appendix holds the line-level
evidence behind them, which answers the seven review questions:

| Question | Section |
|---|---|
| Q1: inputs | A3 |
| Q2: how inputs affect generation | A4 |
| Q3: response shapes | A5 |
| Q4: Aisle | A6 |
| Q7: taxonomy and data-model differences | A7 |
| Q5: what a service must return | A8 |
| Q6: capability ownership | [`RECOMMENDATION_OWNERSHIP.md`](./RECOMMENDATION_OWNERSHIP.md), Appendix B |

Labels:

- **Verified:** read in code. Consumer paths are relative to the consumer repo at `64cd967`; service paths are relative to this repo at `24f7672`.
- **Doc claim:** stated in a document, not confirmed in code.
- **Inference:** reasoned from code, not executed.
- **Planned:** future requirement.

Line numbers will drift.

### A3. Inputs the consumer collects (Q1)

All web-app inputs are stored in the browser (`localStorage`) or in React state
**(Verified)**. Supabase holds no preference or profile data; it stores image
and video caches, saved outfits and boards, look budgets, and partner jobs.

#### A3.1 Explicit inputs

| Input | Values (exact IDs) | Default | Storage | Reaches the outfit prompt? | Evidence |
|---|---|---|---|---|---|
| City / location | Free text, geocoded by Open-Meteo; "Near Me" uses browser geolocation plus Nominatim. No fixed city list. | None; required at onboarding | `aura_cached_weather` (location is part of weather) | Yes, as `weather.location` | `services/weatherService.ts:59-117`; `components/OnboardingModal.tsx:168-178, 209` |
| Lifestyle / persona | Adults: `casual`, `professional`, `athletic`, `business-casual`, `street-style`, `elevated-casual`, `athleisure`. Ages `15-18`/`18-25`: `chill-hangout`, `cute-hangout`, `comfy`, `party`, `athletic`. | `casual` | `aura_style_context`; click history in `aura-persona-history` | Yes, as the raw ID (descriptive guidance only for the 5 teen IDs) | `StylistTab.tsx:103-221, 880-883`; `App.tsx:191-208`; `packages/core/src/mappings.ts:325-345` |
| Occasion | `work`, `hangout`, `active`, `dinner`, `errands`, `home`, `date`, `formal` (the server also accepts `other`) | `hangout` | `aura_onboarding_data.occasion` | Yes; always the primary focus (§A4.3) | `packages/core/src/signals.ts:52-60`; `app/actions/gemini-actions.ts:114-172, 422` |
| Style vibe | `minimal`, `polished`, `laid_back`, `bold`, `romantic`, `creative`; multi-select, uncapped on web | `[]` | `aura_onboarding_data.styleVibes` | Yes | `signals.ts:43-49`; `OnboardingModal.tsx:183-185`; `gemini-actions.ts:95-112` |
| Color energy | `dark_moody`, `light_airy`, `bold_vibrant`, `earthy_warm`, `cool_calm`, `rich_deep`; multi-select | `[]` | `aura_onboarding_data.colorEnergy` | Yes | `signals.ts:63-69`; `gemini-actions.ts:174-215` |
| Gender | `male`, `female`, `non-binary` | `female` | `aura_user_profile.gender` | Yes (dedicated garment-rule block) | `packages/core/src/types.ts:88`; `gemini-actions.ts:352, 358-392` |
| Age range | `15-18`, `18-25`, `25-35`, `26-35`, `36-45`, `46-55`, `56+` | `25-35` | `aura_user_profile.ageRange` | Yes, plus a strict teen guardrail and an age-based palette fallback | `packages/core/src/ageRanges.ts:2-15`; `ageDescription.ts:110-173` |
| Silhouette (top / bottom) | `Oversized`, `Relaxed`, `Fitted`, `Structured`, `Flowing` | Varies by screen | `aura_user_profile.silhouette` | Yes, when set | `types.ts:83`; `gemini-actions.ts:217-252, 462` |
| Favorite / avoid colors | 12 preset hex values (Navy `#1e3a8a` … Camel `#d2691e`); up to 5 favorites | None | `aura_user_profile.colorProfile` | Yes, as raw hex; avoids are prefixed "NEVER use" | `ProfileModal.tsx:60-73, 275-283`; `gemini-actions.ts:254-271` |
| Temperature unit | `C`, `F` | `F` | React state | Display only | `types.ts:3`; `App.tsx:189` |
| Uploaded selfie or garment | Image data URL | None | React state only | No; it only selects the identity-locking image model | `VisualizeTab.tsx:173-176, 394-432, 518-522` |

#### A3.2 Derived inputs

- **Weather (Verified):**
  - Source is Open-Meteo, with temperature in **°C**, precipitation in mm and
    wind in km/h.
  - `condition` is a heuristic with exactly seven values: `Rainy`,
    `Light Rain`, `Windy`, `Clear`, `Partly Cloudy`, `Cloudy`, `Cold`
    (`services/weatherService.ts:3-11`).
  - Humidity is never set. A prompt rule that depends on it ("Breathable for
    high humidity (>80%)") is therefore dead (`gemini-actions.ts:575`).
- **Temporal context (Verified):** the web path takes the hour, day and season
  from the **server** clock (`gemini-actions.ts:77-83, 401-403`). The cache
  key's time of day comes from the **client** clock (`lib/cacheKeys.ts:50-59`).
  **Inference:** for users far from the server's time zone, the two can
  disagree.
- **Seasonal trends (Verified):** a static table with Winter/Spring/Summer 2026
  and **Fall 2025** entries. A missing year falls back to the closest year, so
  October 2026 is served Fall 2025 trends. The season is computed for the
  Northern Hemisphere only (`lib/fashionContext/seasonalTrends.ts:203-283`).
- **Regional styles (Verified):** 16 regional profiles matched by an exact key
  first, then by **substring** (`lib/fashionContext/regionalStyles.ts:632-706`).
  **Inference:** the `"la"` key (`:646`) makes cities such as Dallas, Atlanta
  and Portland resolve to the Los Angeles profile. A second, overlapping city
  table lives inline in the prompt builder (`gemini-actions.ts:273-327`).
- **On-device ML (Verified):** generation events are written to `localStorage`
  (`lib/ml/index.ts:37-90`; `lib/ml/storage.ts:12-15`) but **never read back**
  into generation. The learners in `lib/ml/*` have no call sites outside
  `lib/ml/`.

#### A3.3 Collected but not used in outfit generation (Verified)

- Secondary persona and its weight.
- Comfort priority, preferred fabrics and restrictions.
- The `useCulturalContext` and `useSeasonalTrends` toggles.
- Name and email (used only for the greeting and the email digest).
- `tempMin`/`tempMax` and humidity.
- Body fit, budget and brand types, which have no UI at all
  (`packages/core/src/signals.ts:153-172`).
- All on-device ML data.

`primaryPersona` is effectively unused, because `styleContext` always defaults
to `casual` (`gemini-actions.ts:415`; `App.tsx:192`).

### A4. How inputs shape generation (Q2)

#### A4.1 Call path (Verified)

1. **Trigger.** Any of: auto-generate, a persona click, a city change, or
   Refine (`StylistTab.tsx:1604-1814`).
2. **Persona and cache key.** `generateOutfitAndHero` resolves the persona and
   builds the `stylist-v7-…` cache key (`StylistTab.tsx:1345-1354`). A
   `localStorage` hit skips generation entirely.
3. **Text generation.** `getOutfitSuggestionAction(weather, persona, unit,
   gender, onboardingSignals, userProfile, age)` builds the prompt
   (`gemini-actions.ts:329-605`). It calls Gemini with a JSON `responseSchema`
   (`:610-715`), with no temperature, seed or tools set.
4. **Images.** A main image follows (`StylistTab.tsx:1445-1448`), then a
   flat-lay (`:1496-1561`).

#### A4.2 Models (Verified)

| Use | Model | Evidence |
|---|---|---|
| Outfit text, Plan | `gemini-3.8-flash` | `lib/geminiModels.ts:38` |
| Image without a reference | `gemini-3.1-flash-image` | `geminiModels.ts:44` |
| Image with a selfie or garment (identity lock) | `gemini-3-pro-image` | `geminiModels.ts:51-56` |
| Video | `veo-3.1-generate-preview` / `veo-3.1-fast-generate-preview`; `sora-2` | `app/actions/video-actions.ts:124, 142`; `openai-video-actions.ts:212-214` |

For comparison, this service hardcodes `gemini-2.0-flash`
(`src/utils/config.ts:77`). **Assumption:** that model may no longer be
available. Check before capturing baselines (see
[`PHASE_0_BASELINE.md`](./PHASE_0_BASELINE.md)).

There is **no Google Search grounding** on the outfit call. Only the Plan
feature uses Google Maps grounding, seeded with the outfit's `activity`,
`coffeeSpot` and `storeType` (`gemini-actions.ts:1599-1656`).

#### A4.3 Precedence engine (Verified)

`lib/signalPrecedence.ts`:

- **Base weights:** occasion 35, constraints 25, persona 20, vibe 20 (`:79-82`).
- **Formality conflicts:** move 10 points from persona to occasion
  (`:244-248`).
- **Color constraints:** move 5 points from vibe to constraints (`:251-257`).
- **Occasion is always the primary signal:** 35 or more against at most 20 for
  persona or vibe (`:265-273`). The tests assert this.
- **Prompt effect:** the engine puts a `PRIORITY STYLING DIRECTIVE` with a
  confidence value at the top of the prompt (`gemini-actions.ts:494-498`). The
  weights themselves are only logged.

The weight comment in `packages/core/src/signals.ts:29-30` (40/30/20/10) and
the repo's `validate-precedence.js` both describe an older weighting.

#### A4.4 Prompt structure (Verified, `gemini-actions.ts:490-582`)

The prompt sections appear in this order:

1. Location line and city context.
2. Temporal context.
3. Occasion block: formality, activities and dress code.
4. Vibe block.
5. Color-energy block.
6. Silhouette and favorite/avoid colors, or the age-based palette fallback when
   no color preference exists.
7. Seasonal block (themes, silhouettes, materials; no colors).
8. Regional block (characteristics, silhouettes, cultural notes; no palette).
9. Weather (temperature, precipitation, wind, condition).
10. Persona (raw ID).
11. Age range and gender block.
12. On Aisle requests only, an `AISLE ALTERNATIVE` appendix (`:586-605`).

#### A4.5 Cache identity (Verified)

```
{stylist|outfit-viz}-v7-{persona}-{occasion}-{vibes}-{colorEnergy}-{location}-{condition}
  -{floor(°C/5)}-{gender}-{age}-{timeOfDay}[-avoid:…-fav:…-top:…-bot:…]
```

Built in `lib/cacheKeys.ts:39-92`. Lists are sorted and tokens normalized.

- **Excluded from the key:** unit, precipitation, wind, day and season.
- **Advice entries:** no TTL; evicted only under storage-quota pressure
  (`StylistTab.tsx:1388, 1398`).
- **Stale doc:** consumer `docs/CACHE_KEY_ARCHITECTURE.md` describes key
  version v3.

#### A4.6 Consumer defects relevant to recommendation quality (Verified unless noted)

- **Mood ends up as a pose instruction.** The main-image call passes the
  primary vibe as the 12th positional argument. That position is `poseHint`,
  so prompts read e.g. `POSE: minimal` (`StylistTab.tsx:1445-1447`
  vs. `gemini-actions.ts:808-823`; same in `hooks/useAisleGeneration.ts:103`).
- **Wrong regional profiles.** The regional substring matching described in
  §A3.2 (Inference for specific cities).
- **Stale seasonal data.** Fall 2025 is served in fall 2026 (§A3.2).

### A5. Existing recommendation responses (Q3)

There are five primary shapes, plus several derived mirrors **(Verified)**.

#### A5.1 `OutfitSuggestion`: the canonical internal shape

Defined in `packages/core/src/types.ts:18-53`. Gemini produces it directly via
the `responseSchema` (`gemini-actions.ts:610-713`).

```ts
interface OutfitSuggestion {
  baseLayer: string; lowerBody: string; outerwear: string; footwear: string
  proTip: string; styleReasoning: string; weatherStory: string
  activity: string; coffeeSpot: string; storeType: string
  items?: OutfitItem[]                        // derived in the browser, never from Gemini
  sunglasses?: string; sunglassesWhy?: string; bracelet?: string; braceletWhy?: string
  hat?: string; hatWhy?: string
  lookTitle?: string; currentLookSummary?: string
  retainedItems?: string[]; changedItems?: string[]; addedItems?: string[]
  baseLayerWhy?: string; lowerBodyWhy?: string; outerwearWhy?: string; footwearWhy?: string
}
```

- **Schema:** the four garments, the four `*Why` fields, `proTip`,
  `styleReasoning`, `weatherStory`, `activity`, `coffeeSpot` and `storeType`
  are required (`:697-712`).
- **Color lives inside the garment name.** The schema requires a color word in
  `baseLayer` and `lowerBody`, and the image prompt says "Render each garment
  in the exact color stated in its name" (`:620, :629, :990`).
- **Missing garment-level fields:** there are no separate fields for material,
  fit, category or ID.
- **No validation after parsing** (`:721`). Only Aisle requests are checked,
  by the distinctness gate.
- **The prompt is returned too.** The action returns
  `{ ...outfit, _prompt }` (`:769`). The browser caches this; partner looks
  strip it (`lib/looks/lookService.ts:66-81`).

#### A5.2 `OutfitItem`: garment cards built in the browser

Defined in `packages/core/src/types.ts:55-63` and built by
`lib/outfitItems.ts:112-161`.

- The card name is the garment string up to its first `.`.
- The description comes from the `*Why` field.
- The categories are `outerwear`, `base layer`, `bottom`, `footwear`,
  `sunglasses`, `bracelet` and `hat`.

#### A5.3 `StyleRecommendation`: the partner contract (Muse, UniquePeople)

Defined in `lib/integrations/core/types.ts:39-51` and built only by
`assembleRecommendation` (`lib/integrations/core/service.ts:22-66`).

- **Shape:**
  - `recommendationId` (`aura_<uuid>`) and `requestId`.
  - `interpretation`.
  - A `look` with `{name, color?, reason}` per garment, accessories, `proTip`,
    `styleReasoning`, `weatherStory` and `activity`.
  - `images`.
  - `metadata` (model IDs, `generatedAt`, `cacheHit`, `durationMs`).
- **Lossy:** it drops `coffeeSpot`, `storeType` and `items`.
- **`color` is never populated** (`service.ts:57-60`).
- **No schema version field.**

#### A5.4 `AppLook`: shared-look import

Defined in `lib/looks/types.ts:26-36`.

- It carries a whitelisted `OutfitSuggestion`, along with weather, persona,
  image URLs and the expiry time.
- The app hydrates it with
  `replaceOutfit(look.outfit, {source: "imported", aisle: false})`
  (`App.tsx:479`).
- **This is the precedent for showing an externally produced recommendation
  without calling Gemini for text.**

#### A5.5 Other mirrors

- **Aisle snapshot** (`lib/aisleCollection.ts:38-74`): validated with zod;
  10 required strings of at most 6,000 characters; at most 3 entries.
- **`saved_outfits.outfit`:** the 4 garments plus `styleReasoning`
  (`lib/moodBoards.tsx:202-211`).
- **Mobile contract:** `packages/contracts` `styleResponseSchema`
  (`packages/contracts/src/index.ts:49-56`) targets a `/styling` route that
  does not exist.

#### A5.6 What no response contains (Verified)

- **Style or archetype labels:** persona is only echoed back.
- **Fashion evidence, provenance or grounding links.**
- **Image prompts:** they are always built at image time from the outfit
  fields.
- **A server-side ID for the app's own looks:** only partner jobs get a
  `recommendationId`.

Existing versioning markers are limited to:

- `CACHE_KEY_VERSION = "v7"` (`lib/cacheKeys.ts:39`)
- Aisle `schemaVersion: 1` (`aisleCollection.ts:7-8`)
- the partner metadata model IDs

### A6. How the Aisle produces three distinct looks (Q4)

All of this is **Verified**.

#### Directions

- The three looks are the **default look plus two alternatives**.
- The two directions come from a fixed per-persona switch over six constants
  (`lib/aisleInspiration.ts:4-45`):

  | Direction ID | Title |
  |---|---|
  | `tailoring` | "A different cut" |
  | `layering` | "Fresh layers" |
  | `texture` | "Soft structure" |
  | `movement` | "Made to move" |
  | `clean` | "Clean lines" |
  | `expressive` | "A fresh perspective" |

  For example, `professional` gets `[tailoring, texture]` and `casual` gets
  `[layering, texture]`.
- The code describes them as "variations within a persona, never replacement
  occasion/persona values" (`:20`).
- No model chooses the directions, and there is no randomness.

#### Distinctness

1. **Prompt appendix.** It requires changing "at least TWO core garments by
   garment type or a clearly different silhouette" compared with each earlier
   look (`gemini-actions.ts:594-605`).
2. **Server-side gate.** `isDistinctAisleOutfit` throws
   `AISLE_OUTFIT_NOT_DISTINCT` before any image is paid for
   (`gemini-actions.ts:753-757`; `aisleInspiration.ts:113-134`).
   - Garment families are matched by regex.
   - Text the gate cannot recognize counts as *not* distinct.
3. **Client-side re-check** (`lib/aisleGeneration.ts:63-67`).

The model, schema, temperature and image settings are identical to the
default look's.

#### Generation

- **Only when the user flips the Aisle switch.** "No effect starts paid work"
  (`hooks/useAisleGeneration.ts:39`).
- **Sequential.** For each direction: text → distinctness check → main image →
  publish → flat-lay (`aisleGeneration.ts:51-77`).
- **Each alternative is compared against all earlier looks.**
- **Each stage has a 120-second deadline.**
- **No automatic retry.** A retry fills in only the stages that are missing.

#### Storage and limits

- **Browser only:** `localStorage["aura_aisle_collection"]`, capped at 3 looks
  (`MAX_AISLE_LOOKS`, `aisleCollection.ts:7-9`).
- **Telemetry covers failures only** (`useAisleGeneration.ts:142-146`).

### A7. Taxonomy and data-model differences (Q7)

#### A7.1 Signals

Consumer column: commit `64cd967`. Service column: `src/models/signals.ts` at
`24f7672`. All rows **Verified**.

| Dimension | Consumer | This service | Consequence |
|---|---|---|---|
| Persona | 7 adult IDs (identical strings) plus 5 teen IDs; SettingsTab still offers the deprecated `minimalist` and `romantic` | 7 IDs | Teen and deprecated IDs have no service equivalent |
| Occasion | Same 8 IDs; server also accepts `other` | 8 IDs | `other` unsupported |
| Vibe | Same 6 IDs; **multi-select** | 6 IDs; one per bundle (`vibes[0]`, `src/models/outfit.ts:220`) | Multi-vibe requests collapse |
| Color energy | Same 6 IDs; **multi-select** | 6 IDs; one per combination | Palettes are defined separately in each repo; not compared value by value |
| Persona × occasion conflict | Allowed; resolved by **occasion priority** (`signalPrecedence.ts:141-178`) | **Excluded:** `isValidCombination` rejects pairs outside `PERSONA_OCCASION_COMPATIBILITY` (`signals.ts:242-276`); `casual` + `formal` is never generated | A consumer "Dressier on a hangout" or "casual persona at a formal event" request can never be served from the cache |
| Vibe × occasion | Soft rules (`romantic` + `active`, `bold` + `formal` flagged) | Hard exclusion via `OCCASION_VIBE_COMPATIBILITY` | Same as above |
| Gender | `male`, `female`, `non-binary`; default `female`; drives garment rules | Typed (`UserSignals.gender`, includes `prefer-not-to-say`) but **not used** in generation (`src/services/gemini.ts:37-120`) | Service outputs are not gender-aware |
| Age | 7 ranges; teen guardrails | `ageRange?: string`, unused | None in service |
| Silhouette | Title case (`Oversized` …) | Lowercase (`oversized` …), unused in generation | Case mismatch; not used |
| Color constraints | Favorite and avoid hex presets; avoids are hard | `colorPreferences`, unused | Hard constraints cannot be honored |
| Location | Free text, worldwide | 12 fixed US city IDs (`src/models/city.ts:57-380`) | London, Paris and others unsupported |
| Weather condition | 7 Title-case heuristics from Open-Meteo | 12 snake_case values from OpenWeatherMap codes | Needs a normalization table |
| Temperature | °C; cache bucket `floor(°C/5)` | °F; ranges `cold` <40 · `cool` <55 · `mild` <70 · `warm` <85 · `hot` (`src/services/weather.ts:80-86`) | Bucket edges differ |
| Time | Hour, day and season from the server clock | Date only | — |
| Trends | Static seasonal and regional tables in the prompt | Seasonal defaults computed in stage 2 but **never put in the prompt** | — |

#### A7.2 Recommendation data model

| Concept | Consumer `OutfitSuggestion` | Service `PrecomputedOutfit` (`src/models/outfit.ts:17-55`) |
|---|---|---|
| Garments | Four fixed slots (`baseLayer`, `lowerBody`, `outerwear`, `footwear`) plus optional `hat`, `sunglasses`, `bracelet`; each is one free-text string | `items[]` with `category` ∈ `top`, `bottom`, `outerwear`, `footwear`, `accessory`, `dress` and fields `name`, `description`, `color`, `colorHex?`, `fabric?`, `style?`, `brand?` |
| Dresses | No dress slot; a lower body is mandatory (`gemini-actions.ts:542-543`) | `dress` category exists |
| Color | Inside the garment name (image prompts depend on this) | Separate `color` and `colorHex` |
| Per-garment rationale | `*Why` (required by the schema) | None (`description` is a description, not a rationale) |
| Look rationale | `styleReasoning`, `proTip`, `weatherStory` | `rationale` (1–2 sentences) |
| Styling strategy | None | `styling.{overallVibe, colorStory, silhouetteProfile, occasionFit}` |
| Lifestyle context | `activity`, `coffeeSpot`, `storeType` (feed images and the Plan tab) | None |
| Title | `lookTitle` (optional) | None |
| IDs | None for app looks; `aura_<uuid>` for partner looks | `outfitId = outfit-${Date.now()}-${index}`: not stable or reproducible (`src/services/gemini.ts:147`) |
| Alternatives | Aisle (default plus 2) | `rank` 1–3 inside one bundle; `GET /outfits/:cityId` returns `outfit` plus `alternatives` |
| Quality | None | Bundle `qualityMetrics` (heuristic; see [`PHASE_0_BASELINE.md`](./PHASE_0_BASELINE.md)) |
| Versioning | Cache key `v7`; Aisle `schemaVersion: 1` | None |

#### A7.3 Drift in this repository's `SIGNAL_CONTRACT.md` (Verified)

| `SIGNAL_CONTRACT.md` says | Code says |
|---|---|
| `GET /outfits?cityId=X&persona=…` | `GET /outfits/:cityId?persona=…&occasion=…&vibe=…&date=…` (`src/api/routes/outfits.ts:35-48`) |
| Cache key `aura:outfit:{cityId}:{persona}:{occasion}:{vibe}` | `aura:outfit:{cityId}:{date}:{persona}:{occasion}:{vibe}:{tempRange}_{condition}` (`src/models/outfit.ts:213-223`) |
| Response `{success, cityId, signals, weather?, outfits[], cached, generatedAt}` | `{success, fromCache, matchType, outfit, alternatives, confidence, generatedAt}` (`outfits.ts:72-80`) |
| Sync checklist names consumer `lib/pipeline-client.ts` | Not on consumer `main` (see "Verified current state" above) |
| Precedence weights weather 0.25, occasion 0.20, … | Not implemented in either repo; the consumer uses 35/25/20/20 (§A4.3) |

Treat `SIGNAL_CONTRACT.md` as historical. The "Proposed versioned service contract" above is the
target.

### A8. What a standalone service would need to return (Q5)

#### A8.1 Required by the current consumer UI

These fields are Verified as read by the UI. Any future adapter must be able
to produce them.

| Field | Why it is required | Evidence |
|---|---|---|
| `baseLayer`, `lowerBody`, `outerwear`, `footwear` | Garment cards, image and flat-lay prompts, Aisle comparison, Save. Each must be non-empty, contain a color word, and put a short name before the first `.`. | `lib/outfitItems.ts:113-158`; `gemini-actions.ts:958-961, 990`; `aisleInspiration.ts:61, 130`; `moodBoards.tsx:206` |
| `styleReasoning` | "Why it works", Visualize overlay, image prompt, Save, the partner page | `TodayOutfit.tsx:205`; `VisualizeTab.tsx:1814-1853`; `moodBoards.tsx:210` |
| `proTip` | Shown on Today; required by the Aisle snapshot | `TodayOutfit.tsx:205`; `aisleCollection.ts:42` |
| `weatherStory` | Required by the Aisle snapshot | `aisleCollection.ts:42` |
| `activity`, `coffeeSpot`, `storeType` | Image prompt ("LOCATION VIBE"), Plan and Stores search seeds, look identity | `gemini-actions.ts:980-981, 1607-1609`; `PlanTab.tsx:533-545`; `visualizeStaging.ts:34-35` |

**If any of these ten strings is missing, the look cannot be persisted.** The
snapshot serializer returns `null`, the key is removed and a `CACHE_ERROR` is
logged (`aisleCollection.ts:64-71`; `lib/aislePersistence.ts:6-18`). This
happens for single looks too, because every `replaceOutfit` creates a
collection (`lib/lookSession.ts:127`).

**Stability requirement.** These 10 fields form a look's identity: the 4
garments, `hat`, `sunglasses`, `bracelet`, `styleReasoning`, `activity` and
`coffeeSpot` (`lib/visualizeStaging.ts:32-36`). Any change discards the look's
images and its Aisle binding. A service must return **byte-identical** strings
whenever the same recommendation is fetched again.

#### A8.2 Strongly recommended

- **`baseLayerWhy`, `lowerBodyWhy`, `outerwearWhy`, `footwearWhy`.** Without
  them the cards fall back to generic copy (`outfitItems.ts:116-155`).
- **Optional accessory pairs:** `hat`, `sunglasses` and `bracelet`, each with
  its `*Why`.
- **`lookTitle`.** The fallback is "Recommended for you".
- **A stable recommendation ID**, needed for sharing and retries.
- **A schema version.**

#### A8.3 Inputs the service would need to accept

- **Refine.** Refine is a full regeneration with a changed persona and/or a
  single vibe. There is no "edit one garment" call
  (`StylistTab.tsx:1090-1117`).
- **Full input set:**
  - weather
  - persona
  - unit
  - gender
  - age range
  - `styleVibes`, `occasion` and `colorEnergy`
  - `favoriteColors`, `avoidColors`, `topPreference`, `bottomPreference` and
    `primaryPersona`

  (`gemini-actions.ts:329-350`)
- **Aisle alternatives.** These add `directionId` and `previousOutfits` (one to
  three sets of four garments, each at most 240 characters;
  `aisleInspiration.ts:15-18, 50-69`). The service must either guarantee that
  at least 2 garments differ, or return an error the app can map to
  `too-similar`.

#### A8.4 Not needed from the service (Verified)

- **Image prompts.** The consumer builds them from outfit fields.
- **Grounding links.** These come from the separate Plan call.
- **`_prompt`.** No UI reads it, and the design requires that prompts are
  never exposed (see the design doc §6).

### A9. Open questions (Assumptions to resolve before any integration)

| Question | Current assumption |
|---|---|
| Who produces `activity`, `coffeeSpot` and `storeType`? | The consumer, via a separate call. The service may later offer optional "scene" suggestions. |
| Should the service accept the consumer's teen categories? | No. They map to a lifestyle plus an age constraint at the adapter. |
| How do Aisle directions map to collection roles? | Default slot → `best_bet`; alternative slots → `adjacent` and `exploration`. Fixed per-persona directions are replaced by the service's planner. |
| Is `gemini-2.0-flash` still served? | Unknown. Phase 0 verifies this. |
| Are color-energy palettes equivalent across the two repos? | Not compared. Resolve when the knowledge store defines the aesthetic vocabulary. |
