# AURA Pipeline Service

Server-side pipeline for AURA Stylist that pre-computes and caches outfit recommendations for popular cities. Runs daily to ensure fresh, weather-appropriate, and trend-aware outfit suggestions.

**Version:** 2.0 (Planned)
**Contract:** See `SIGNAL_CONTRACT.md` for client-service agreement
**Roadmap:** See `SIGNAL_ARCHITECTURE_ROADMAP.md` for client evolution

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Service Use Cases](#service-use-cases)
3. [Architecture](#architecture)
4. [V2 Evolution Plan](#v2-evolution-plan)
5. [Implementation Phases](#implementation-phases)
6. [ROI Analysis](#roi-analysis)
7. [Quick Start](#quick-start)
8. [API Reference](#api-reference)
9. [Configuration](#configuration)
10. [Deployment](#deployment)

---

## Executive Summary

### What This Service Does

The AURA Pipeline Service is the **intelligence backbone** of the AURA Stylist ecosystem. It:

1. **Pre-computes** thousands of outfit recommendations daily (not on-demand)
2. **Caches** results in Redis for instant retrieval (<20ms latency)
3. **Integrates** weather, seasonal trends, and city-specific style DNA
4. **Serves** a simple API that the client app consumes

### Why Pre-Computation?

| Approach | Latency | Cost per Request | User Experience |
|----------|---------|------------------|-----------------|
| **Real-time AI** | 2-5 seconds | $0.002-0.01 | Poor (loading spinner) |
| **Pre-computed** | <20ms | $0.00001 | Excellent (instant) |

**Result:** 100-500x faster, 100-1000x cheaper per request.

### Current vs V2 Vision

| Aspect | Current (V1) | Target (V2) |
|--------|--------------|-------------|
| Response format | Basic (outfits only) | Rich (outfits + context + guidance) |
| Client work | Heavy (translate signals, call Gemini again) | Light (display only) |
| Seasonal trends | Not included | Included in response |
| Hero images | Not supported | Archetype-level images |
| Confidence | Partial | Full breakdown |
| Catalog integration | None | Hints for product matching |

---

## Service Use Cases

### Primary Use Cases (V2 API)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         V2 USE CASE MATRIX                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  UC-1: GET OUTFIT RECOMMENDATIONS (Primary)                            │
│  ────────────────────────────────────────────                          │
│  Client: GET /v2/outfits?cityId=X&persona=X&occasion=X&vibe=X          │
│  Returns: Complete ready-to-render response with:                       │
│    • Outfit items with catalog hints                                   │
│    • Signal guidance (descriptions for UI)                             │
│    • Seasonal context (trending colors, themes)                        │
│    • Hero image URL                                                    │
│    • Confidence score breakdown                                        │
│    • Weather context                                                   │
│                                                                         │
│  UC-2: FILTER BY AVOIDED COLORS                                        │
│  ────────────────────────────────────────────                          │
│  Client: GET /v2/outfits?...&avoidColors=%23ff0000,%2300ff00           │
│  Returns: Outfits with specified colors filtered out                   │
│                                                                         │
│  UC-3: GET AVAILABLE SIGNALS                                           │
│  ────────────────────────────────────────────                          │
│  Client: GET /v2/signals                                               │
│  Returns: All valid personas, occasions, vibes + compatibility rules   │
│                                                                         │
│  UC-4: GET SEASONAL TRENDS                                             │
│  ────────────────────────────────────────────                          │
│  Client: GET /v2/season                                                │
│  Returns: Current season themes, trending colors, materials            │
│                                                                         │
│  UC-5: HEALTH & STATUS (Existing)                                      │
│  ────────────────────────────────────────────                          │
│  Ops: GET /health/detailed                                             │
│  Returns: Redis status, cache hit rate, pipeline status                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Use Case Details

#### UC-1: Get Outfit Recommendations

**Actor:** Client App
**Trigger:** User selects persona, occasion, vibe
**Precondition:** Pipeline has run for the requested city

**Flow:**
1. Client sends GET request with signal parameters
2. Service looks up pre-computed bundle from Redis
3. Service enriches response with seasonal context, guidance, hero image
4. Service applies avoidColors filter if provided
5. Service returns complete V2 response

**Success Response:**
```json
{
  "success": true,
  "version": "2.0",
  "context": {
    "cityId": "new-york-ny",
    "cityName": "New York",
    "signals": { "persona": "professional", "occasion": "work", "vibe": "minimal" },
    "weather": { "temperature": 35, "condition": "snow", "description": "Light snow, cold" }
  },
  "seasonalContext": {
    "season": "Winter 2025-2026",
    "themes": ["Quiet luxury", "Cozy maximalism"],
    "trendingColors": [{ "name": "Chocolate Brown", "hex": "#8B4513" }]
  },
  "signalGuidance": {
    "persona": { "id": "professional", "name": "Professional", "description": "Office/business context" },
    "occasion": { "id": "work", "description": "Meetings, presentations, client calls" },
    "vibe": { "id": "minimal", "description": "Clean lines, monochromatic" }
  },
  "heroImage": {
    "url": "https://storage.../professional-work-minimal-winter25.webp",
    "alt": "Professional minimal winter style"
  },
  "confidence": {
    "overall": 87,
    "level": "high",
    "factors": { "signalConsistency": 92, "weatherAppropriateness": 85 }
  },
  "outfits": [...]
}
```

#### UC-2: Filter by Avoided Colors

**Actor:** Client App (user with color preferences)
**Trigger:** User has specified colors to avoid in profile

**Flow:**
1. Client includes `avoidColors` query parameter (URL-encoded hex codes)
2. Service filters out items matching avoided colors
3. If outfit becomes incomplete, service may substitute from alternatives

**Example:**
```
GET /v2/outfits?cityId=new-york-ny&persona=casual&occasion=hangout&vibe=bold
    &avoidColors=%23ff0000,%23ff6600
```

#### UC-3: Get Available Signals

**Actor:** Client App (during onboarding or profile setup)
**Trigger:** Client needs to populate signal selection UI

**Response:**
```json
{
  "version": "2.0",
  "signals": {
    "personas": [
      { "id": "casual", "name": "Casual", "description": "Everyday relaxed lifestyle" },
      { "id": "professional", "name": "Professional", "description": "Office/business context" }
    ],
    "occasions": [...],
    "vibes": [...],
    "colorEnergies": [...]
  },
  "compatibility": {
    "personaToOccasion": { "professional": ["work", "dinner", "formal"] },
    "occasionToVibe": { "work": ["minimal", "polished"] }
  }
}
```

#### UC-4: Get Seasonal Trends

**Actor:** Client App
**Trigger:** Client wants to display trending information

**Response:**
```json
{
  "current": {
    "season": "Winter",
    "year": "2025-2026",
    "themes": ["Quiet luxury", "Cozy maximalism", "Old money aesthetic"],
    "trendingColors": [
      { "name": "Chocolate Brown", "hex": "#8B4513", "popularity": 0.9 }
    ],
    "keySilhouettes": ["Oversized coats", "Wide-leg trousers"],
    "inSeasonMaterials": ["Cashmere", "Wool", "Corduroy"],
    "avoidMaterials": ["Linen", "Seersucker"]
  }
}
```

---

## Architecture

### Current Architecture (V1)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Daily Pipeline (2 AM UTC)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Stage 1: Data Collection                                        │
│    └── Weather API + City Profiles + Trends                     │
│                           ↓                                      │
│  Stage 2: Signal Aggregation                                     │
│    └── Transform data into actionable signals                   │
│                           ↓                                      │
│  Stage 3: Style Matrix Generation                                │
│    └── Create valid signal combinations (~3-5K per city)        │
│                           ↓                                      │
│  Stage 4: Outfit Generation (AI)                                 │
│    └── Gemini API generates outfit recommendations              │
│                           ↓                                      │
│  Stage 5: Quality Scoring                                        │
│    └── Score confidence, filter low-quality                     │
│                           ↓                                      │
│  Stage 6: Cache Population                                       │
│    └── Store in Redis for instant retrieval                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                         API Layer                                │
├─────────────────────────────────────────────────────────────────┤
│  GET /outfits/:cityId?persona=X&occasion=X&vibe=X               │
│    → Returns: Basic outfit data                                 │
│    → Client must: Translate signals, apply preferences          │
└─────────────────────────────────────────────────────────────────┘
```

### Target Architecture (V2)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER (New)                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  src/data/                                                               │
│    ├── signal-guidance.ts    ← Signal descriptions for UI              │
│    ├── seasonal-trends.ts    ← Quarterly trend data                    │
│    └── hero-images.ts        ← Image URL mappings                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                    Daily Pipeline (Enhanced)                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Stage 1-3: (Unchanged)                                                  │
│                           ↓                                              │
│  Stage 4: Outfit Generation (Enhanced)                                   │
│    └── Gemini now includes:                                             │
│        • Seasonal trend context in prompts                              │
│        • Catalog hints generation (search terms, brands)                │
│                           ↓                                              │
│  Stage 5-6: (Unchanged)                                                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                    SERVICES LAYER (New)                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  src/services/                                                           │
│    ├── response-builder.ts   ← Builds rich V2 responses                 │
│    ├── color-filter.ts       ← Filters avoided colors                  │
│    └── catalog-hints.ts      ← Generates shopping hints                │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                         API LAYER (V2)                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  V1 (Maintained for backward compatibility):                            │
│    GET /outfits/:cityId                                                 │
│                                                                          │
│  V2 (New):                                                               │
│    GET /v2/outfits/:cityId    ← Rich response with all context         │
│    GET /v2/signals            ← Signal definitions + compatibility      │
│    GET /v2/season             ← Current seasonal trends                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Simplified)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Before (V1):                          After (V2):                       │
│  ─────────────                         ────────────                      │
│  • Fetch outfits                       • Fetch outfits                   │
│  • Translate signals locally           • Display directly                │
│  • Apply color preferences             • (Server handles filtering)      │
│  • Maybe call Gemini again             • (No extra AI call needed)       │
│  • Generate hero images                • (Server provides URL)           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Diagram

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Weather    │     │   Seasonal   │     │    City      │
│     API      │     │    Trends    │     │   Profiles   │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       └────────────────────┼────────────────────┘
                            ↓
              ┌─────────────────────────┐
              │      PIPELINE           │
              │  (Daily at 2 AM UTC)    │
              │                         │
              │  • 12 cities            │
              │  • ~3-5K combos/city    │
              │  • ~40-60K total        │
              └───────────┬─────────────┘
                          ↓
              ┌─────────────────────────┐
              │        REDIS            │
              │   (Memorystore)         │
              │                         │
              │  • TTL: 24 hours        │
              │  • ~50K cached bundles  │
              └───────────┬─────────────┘
                          ↓
              ┌─────────────────────────┐
              │      API SERVICE        │
              │    (Cloud Run)          │
              │                         │
              │  • /v2/outfits          │
              │  • /v2/signals          │
              │  • /v2/season           │
              └───────────┬─────────────┘
                          ↓
              ┌─────────────────────────┐
              │      CLIENT APP         │
              │  (v0-aura-stylist)      │
              │                         │
              │  • Display outfits      │
              │  • Show hero image      │
              │  • Match to catalogs    │
              └─────────────────────────┘
```

---

## V2 Evolution Plan

### What Needs to Change

#### New Files to Create

| File | Purpose | Priority |
|------|---------|----------|
| `src/data/signal-guidance.ts` | Descriptions for all signals (UI display) | P0 |
| `src/data/seasonal-trends.ts` | Quarterly trend data (colors, themes, materials) | P0 |
| `src/data/hero-images.ts` | Hero image URL mappings | P1 |
| `src/services/response-builder.ts` | Build rich V2 responses | P0 |
| `src/services/color-filter.ts` | Filter outfits by avoided colors | P1 |
| `src/api/routes/v2/outfits.ts` | V2 outfit endpoint | P0 |
| `src/api/routes/v2/signals.ts` | Signal definitions endpoint | P0 |
| `src/api/routes/v2/season.ts` | Seasonal trends endpoint | P0 |

#### Files to Modify

| File | Change | Priority |
|------|--------|----------|
| `src/api/server.ts` | Mount V2 routes | P0 |
| `src/services/gemini.ts` | Add catalog hints to prompts | P1 |
| `src/models/outfit.ts` | Add catalogHints to OutfitItem | P1 |
| `src/pipeline/stages/4-outfit-generation.ts` | Include seasonal context | P1 |

#### No Changes Needed

| File | Reason |
|------|--------|
| `src/models/signals.ts` | Already has correct taxonomy |
| `src/models/city.ts` | City profiles complete |
| `src/services/redis.ts` | Cache structure works |
| `src/pipeline/stages/1-3` | Data collection unchanged |
| `src/pipeline/stages/5-6` | Scoring/caching unchanged |

---

## Implementation Phases

### Phase 0: Foundation (Week 1)

**Goal:** Establish data modules that power V2 responses

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 0: Data Modules                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  □ Create src/data/signal-guidance.ts                          │
│    ├── PERSONA_GUIDANCE: { id, name, description, keywords }   │
│    ├── OCCASION_GUIDANCE: { id, name, formality, activities }  │
│    ├── VIBE_GUIDANCE: { id, name, description, keywords }      │
│    └── COLOR_ENERGY_GUIDANCE: { id, name, palette[] }          │
│                                                                 │
│  □ Create src/data/seasonal-trends.ts                          │
│    ├── WINTER_2025_2026: { themes, colors, materials }         │
│    ├── getCurrentSeason(): SeasonalTrend                       │
│    └── getSeasonalContext(): formatted for response            │
│                                                                 │
│  □ Create src/data/hero-images.ts                              │
│    ├── HERO_IMAGE_BASE_URL                                     │
│    └── getHeroImageUrl(signals): { url, alt }                  │
│                                                                 │
│  Deliverable: Data modules with full test coverage             │
│  Effort: 2-3 days                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 1: V2 Response Builder (Week 1-2)

**Goal:** Create service that assembles rich V2 responses

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 1: Response Builder                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  □ Create src/services/response-builder.ts                     │
│    ├── V2OutfitResponse interface                              │
│    ├── buildV2Response(bundle, city, weather, signals)         │
│    ├── enhanceOutfit(outfit): add catalogHints                 │
│    └── describeWeather(weather): human-readable                │
│                                                                 │
│  □ Create src/services/color-filter.ts                         │
│    ├── filterAvoidColors(bundle, colors[])                     │
│    └── substituteItems(outfit, alternatives)                   │
│                                                                 │
│  Deliverable: Response builder with unit tests                 │
│  Effort: 2-3 days                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 2: V2 API Routes (Week 2)

**Goal:** Expose V2 endpoints

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 2: V2 Routes                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  □ Create src/api/routes/v2/outfits.ts                         │
│    ├── GET /:cityId with all query params                      │
│    ├── Validation with Zod                                     │
│    ├── Exact match → fuzzy match fallback                      │
│    └── Apply color filter, build V2 response                   │
│                                                                 │
│  □ Create src/api/routes/v2/signals.ts                         │
│    ├── GET / returns all signal definitions                    │
│    └── Include compatibility rules                             │
│                                                                 │
│  □ Create src/api/routes/v2/season.ts                          │
│    ├── GET / returns current season                            │
│    └── Include upcoming season preview flag                    │
│                                                                 │
│  □ Update src/api/server.ts                                    │
│    └── Mount /v2/* routes                                      │
│                                                                 │
│  Deliverable: V2 API endpoints live and tested                 │
│  Effort: 3-4 days                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 3: Catalog Hints (Week 3)

**Goal:** Help client match items to retailer products

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 3: Catalog Hints                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  □ Update src/models/outfit.ts                                 │
│    └── Add CatalogHints interface to OutfitItem                │
│                                                                 │
│  □ Create src/services/catalog-hints.ts                        │
│    ├── generateCatalogHints(item): CatalogHints                │
│    ├── inferPriceRange(item): { min, max }                     │
│    └── suggestRetailers(item): string[]                        │
│                                                                 │
│  □ Update src/services/gemini.ts                               │
│    └── Add catalog hints section to outfit generation prompt   │
│                                                                 │
│  Deliverable: Items include catalog hints                      │
│  Effort: 2-3 days                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 4: Hero Images (Week 3-4)

**Goal:** Generate and serve archetype-level style images

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 4: Hero Images                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  □ Create scripts/generate-hero-images.ts                      │
│    ├── Generate prompts for all signal combos                  │
│    ├── Call image generation API (Imagen/DALL-E)               │
│    └── Upload to Cloud Storage                                 │
│                                                                 │
│  □ Image Matrix:                                                │
│    ├── 6 archetypes × 6 occasions × 4 vibes × 1 season        │
│    └── = 144 images per season                                  │
│                                                                 │
│  □ Update src/data/hero-images.ts                              │
│    └── Map signals to image URLs                               │
│                                                                 │
│  Deliverable: Hero images generated and served                 │
│  Effort: 3-4 days                                               │
│  Cost: ~$3-6 per season refresh                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 5: Pipeline Enhancement (Week 4)

**Goal:** Inject seasonal context into outfit generation

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 5: Pipeline Enhancement                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  □ Update Stage 4 (outfit-generation.ts)                       │
│    ├── Import getSeasonalContext()                             │
│    ├── Include themes, colors, materials in Gemini prompt      │
│    └── Request catalog hints in structured output              │
│                                                                 │
│  □ Update Gemini prompt template:                              │
│    "Current season: Winter 2025-2026                           │
│     Trending themes: Quiet luxury, Cozy maximalism             │
│     Trending colors: Chocolate Brown (#8B4513), Deep Teal      │
│     Preferred materials: Cashmere, Wool, Corduroy              │
│     Avoid materials: Linen, Seersucker"                        │
│                                                                 │
│  Deliverable: Pipeline generates seasonally-aware outfits      │
│  Effort: 2-3 days                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Timeline Summary

```
Week 1:  [████████████] Phase 0 + Phase 1 (Data + Response Builder)
Week 2:  [████████████] Phase 2 (V2 Routes) + Testing
Week 3:  [████████████] Phase 3 + Phase 4 (Catalog + Hero Images)
Week 4:  [████████████] Phase 5 (Pipeline) + Integration Testing
```

---

## ROI Analysis

### Current State Costs

| Resource | Monthly Cost | Notes |
|----------|--------------|-------|
| Cloud Run API | ~$15-30 | Minimal requests |
| Cloud Run Pipeline Job | ~$5-10 | Daily execution |
| Memorystore Redis | ~$35-50 | 1GB basic tier |
| Gemini API (pipeline) | ~$50-100 | Daily generation |
| **Total** | **~$105-190/mo** | |

### V2 Additional Costs

| Resource | One-Time | Monthly | Notes |
|----------|----------|---------|-------|
| Hero Image Generation | ~$6 | ~$6/quarter | 144 images × $0.04 |
| Cloud Storage | - | ~$1 | Image hosting |
| Development | 4 weeks | - | Engineering time |
| **Total V2 Delta** | **~$6** | **~$2/mo** | |

### Value Delivered

#### Client Simplification

| Metric | Before (V1) | After (V2) | Improvement |
|--------|-------------|------------|-------------|
| Client bundle size | ~150KB (signal logic) | ~50KB (display only) | 67% smaller |
| API calls per outfit | 1-2 (may call Gemini) | 1 | 50% fewer |
| Client Gemini cost | $0.002/request | $0 | 100% savings |
| Time to display | ~500ms (processing) | ~50ms (render) | 90% faster |

#### Operational Benefits

| Benefit | Description | Value |
|---------|-------------|-------|
| Single source of truth | Signals defined in service, not duplicated | Fewer bugs |
| Faster iteration | Update service, all clients get changes | Hours → minutes |
| A/B testing ready | Server-side logic enables experimentation | Product velocity |
| Seasonal updates | One place to update quarterly | Reduced maintenance |

#### Business Metrics Impact

| Metric | Expected Impact | Rationale |
|--------|-----------------|-----------|
| User engagement | +15-25% | Faster load, hero images |
| Session duration | +10-20% | Richer content, seasonal trends |
| Conversion (catalog clicks) | +20-40% | Catalog hints enable shopping |
| Development velocity | +30-50% | Less client complexity |

### ROI Calculation

```
Investment:
  Development: 4 weeks × $X/week = $4X
  Infrastructure: ~$8/year additional

Annual Value:
  Client Gemini savings: $0.002 × 100K requests × 12 months = $2,400
  Development velocity: 30% faster × $Y/year = $0.3Y
  User engagement: 20% increase → revenue impact

Payback Period: < 2 months (on Gemini savings alone)
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Gemini API key
- OpenWeatherMap API key

### Local Development

```bash
# Clone the repo
git clone https://github.com/your-org/aura-pipeline-service.git
cd aura-pipeline-service

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your API keys

# Start Redis and API server
docker-compose up -d redis
npm run dev

# In another terminal, run the pipeline
npm run pipeline:manual
```

### Docker

```bash
# Start all services
docker-compose up -d

# Run pipeline manually
docker-compose --profile pipeline up pipeline

# View logs
docker-compose logs -f api
```

---

## API Reference

### V1 Endpoints (Existing)

```bash
# Get outfit (basic response)
GET /outfits/:cityId?persona=professional&occasion=work&vibe=minimal

# List cities
GET /cities

# Health check
GET /health
```

### V2 Endpoints (New)

```bash
# Get outfit (rich response)
GET /v2/outfits/:cityId?persona=professional&occasion=work&vibe=minimal
    &colorEnergy=dark_moody    # Optional
    &avoidColors=%23ff0000     # Optional, URL-encoded hex

# Get signal definitions
GET /v2/signals

# Get seasonal trends
GET /v2/season

# Health (unchanged)
GET /health/detailed
```

---

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Google Gemini API key | Yes |
| `WEATHER_API_KEY` | OpenWeatherMap API key | Yes |
| `REDIS_HOST` | Redis host | Yes |
| `REDIS_PORT` | Redis port | Yes |
| `REDIS_PASSWORD` | Redis password | No |
| `HERO_IMAGE_BASE_URL` | Cloud Storage URL for hero images | No |
| `PIPELINE_MODE` | `full`, `weather-only`, `single-city` | No |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` | No |

---

## Deployment

### GCP Cloud Run

See `infra/` for Pulumi infrastructure:

```bash
cd infra
npm install
pulumi up
```

### Production Checklist

- [ ] V2 routes tested locally
- [ ] Hero images uploaded to Cloud Storage
- [ ] Seasonal trends data populated
- [ ] Client updated to use V2 endpoints
- [ ] Monitoring dashboards updated
- [ ] Rollback plan documented

---

## Project Structure

```
aura-pipeline-service/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── outfits.ts          # V1 outfit endpoints
│   │   │   ├── cities.ts           # City endpoints
│   │   │   ├── health.ts           # Health checks
│   │   │   └── v2/                 # NEW: V2 endpoints
│   │   │       ├── outfits.ts
│   │   │       ├── signals.ts
│   │   │       └── season.ts
│   │   └── server.ts
│   │
│   ├── data/                       # NEW: Static data modules
│   │   ├── signal-guidance.ts
│   │   ├── seasonal-trends.ts
│   │   └── hero-images.ts
│   │
│   ├── pipeline/
│   │   ├── stages/
│   │   │   ├── 1-data-collection.ts
│   │   │   ├── 2-signal-aggregation.ts
│   │   │   ├── 3-style-matrix.ts
│   │   │   ├── 4-outfit-generation.ts  # MODIFIED
│   │   │   ├── 5-quality-scoring.ts
│   │   │   └── 6-cache-population.ts
│   │   └── orchestrator.ts
│   │
│   ├── services/
│   │   ├── redis.ts
│   │   ├── weather.ts
│   │   ├── gemini.ts               # MODIFIED
│   │   ├── response-builder.ts     # NEW
│   │   ├── color-filter.ts         # NEW
│   │   └── catalog-hints.ts        # NEW
│   │
│   ├── models/
│   │   ├── signals.ts
│   │   ├── city.ts
│   │   └── outfit.ts               # MODIFIED
│   │
│   └── utils/
│       ├── config.ts
│       └── logger.ts
│
├── scripts/
│   └── generate-hero-images.ts     # NEW
│
├── infra/                          # Pulumi infrastructure
├── SIGNAL_CONTRACT.md              # Client-service contract
├── SIGNAL_ARCHITECTURE_ROADMAP.md  # Architecture vision
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## Related Documents

- [SIGNAL_CONTRACT.md](./SIGNAL_CONTRACT.md) - Client-service signal agreement
- [SIGNAL_ARCHITECTURE_ROADMAP.md](./SIGNAL_ARCHITECTURE_ROADMAP.md) - Full architecture vision
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - GCP deployment instructions

## Related Repositories

- [v0-aura-stylist-agent](https://github.com/your-org/v0-aura-stylist-agent) - Frontend application

---

## License

MIT
