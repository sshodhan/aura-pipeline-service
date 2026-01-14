# Signal Architecture Contract

**Version:** 1.0.0
**Last Updated:** January 12, 2026
**Shared Between:** `v0-aura-stylist-agent` (client) ↔ `aura-pipeline-service` (backend)

---

## Purpose

This document defines the **signal contract** between the AURA Stylist client app and the Pipeline Service backend. Both systems MUST implement these exact signal values to ensure compatibility.

**Reference:** See `SIGNAL_ARCHITECTURE_ROADMAP.md` in the client repo for the full architecture vision.

---

## Three-Layer Signal Taxonomy

### Layer 1: Lifestyle Personas (WHO you are - stable identity)

```typescript
export const PERSONAS = [
  "casual",           // Everyday relaxed lifestyle
  "professional",     // Office/business context
  "athletic",         // Fitness/sports lifestyle
  "business-casual",  // Flexible professional
  "street-style",     // Urban fashion-forward
  "elevated-casual",  // Polished everyday
  "athleisure",       // Active comfort lifestyle
] as const;

export type Persona = typeof PERSONAS[number];
```

**Note:** `minimalist` and `romantic` were removed in Phase 4.1 - these are aesthetic vibes, not lifestyle personas.

---

### Layer 2: Activity Contexts (WHAT you're doing - situational)

```typescript
export const OCCASIONS = [
  "work",      // Office, meetings, professional
  "hangout",   // Casual social, coffee with friends
  "active",    // Workout, sports, physical activity
  "dinner",    // Evening dining, restaurants
  "errands",   // Shopping, running around town
  "home",      // Staying in, working from home
  "date",      // Romantic outing, making an impression
  "formal",    // Black tie, special events
] as const;

export type Occasion = typeof OCCASIONS[number];
```

---

### Layer 3: Aesthetic Vibes (HOW you want it styled - dynamic mood)

```typescript
export const VIBES = [
  "minimal",    // Clean lines, monochromatic, understated
  "polished",   // Refined tailoring, sophisticated
  "laid_back",  // Relaxed fits, effortless
  "bold",       // Statement pieces, confident
  "romantic",   // Soft, flowing, feminine touches
  "creative",   // Artistic, unique, eclectic
] as const;

export type Vibe = typeof VIBES[number];
```

---

### Color Energy (Palette preference)

```typescript
export const COLOR_ENERGIES = [
  "dark_moody",    // Deep blacks, charcoal, navy, jewel tones
  "light_airy",    // Soft whites, creams, pastels
  "bold_vibrant",  // Bright reds, electric blues, vivid hues
  "earthy_warm",   // Browns, terracotta, olive, rust
  "cool_calm",     // Cool blues, soft grays, sage
  "rich_deep",     // Burgundy, emerald, deep purple
] as const;

export type ColorEnergy = typeof COLOR_ENERGIES[number];
```

---

## Signal Precedence (Phase 4.2)

When signals conflict, apply this hierarchy:

```typescript
export const SIGNAL_WEIGHTS = {
  weather: 0.25,           // Highest - practical constraints
  occasion: 0.20,          // Context drives formality
  userConstraints: 0.20,   // Silhouette, color avoids (hard constraints)
  vibes: 0.15,             // Aesthetic filter
  persona: 0.12,           // Identity baseline
  regionalTrends: 0.08,    // City style DNA
} as const;
```

**Rule:** `occasion` overrides `persona` for formality. Example: A `casual` persona at a `formal` occasion should get formal recommendations.

---

## API Contract

### Request Format (Client → Pipeline)

```typescript
interface PipelineRequest {
  cityId: string;           // e.g., "new-york-ny"
  persona: Persona;         // From Layer 1
  occasion: Occasion;       // From Layer 2
  vibe: Vibe;              // From Layer 3
  colorEnergy?: ColorEnergy; // Optional
}
```

**Endpoint:** `GET /outfits?cityId=X&persona=X&occasion=X&vibe=X`

### Response Format (Pipeline → Client)

```typescript
interface PipelineResponse {
  success: boolean;
  cityId: string;
  signals: {
    persona: Persona;
    occasion: Occasion;
    vibe: Vibe;
  };
  weather?: {
    temperature: number;
    feelsLike: number;
    condition: string;
    humidity: number;
  };
  outfits: PrecomputedOutfit[];
  cached: boolean;
  generatedAt: string;
}

interface PrecomputedOutfit {
  outfitId: string;
  rank: number;
  items: OutfitItem[];
  styling: {
    overallVibe: string;
    colorStory: string;
    silhouetteProfile: string;
    occasionFit: string;
  };
  rationale: string;
}
```

---

## Supported Cities

Both repos must use these exact city IDs:

| City | ID | Tier |
|------|----|------|
| New York | `new-york-ny` | 1 |
| Los Angeles | `los-angeles-ca` | 1 |
| Chicago | `chicago-il` | 1 |
| Miami | `miami-fl` | 2 |
| San Francisco | `san-francisco-ca` | 2 |
| Seattle | `seattle-wa` | 2 |
| Austin | `austin-tx` | 2 |
| Boston | `boston-ma` | 2 |
| Denver | `denver-co` | 3 |
| Nashville | `nashville-tn` | 3 |
| Atlanta | `atlanta-ga` | 3 |
| Portland | `portland-or` | 3 |

---

## Cache Key Structure

Pipeline caches outfits with this key pattern:

```
aura:outfit:{cityId}:{persona}:{occasion}:{vibe}
```

Example: `aura:outfit:new-york-ny:casual:work:minimal`

---

## Future Phases (Roadmap Alignment)

### Phase 4.2: Signal Hierarchy
- [ ] Client: Implement `SignalPrecedenceEngine`
- [ ] Pipeline: Apply weights during outfit generation

### Phase 4.3: Confidence Scoring
- [ ] Client: Display confidence indicators
- [ ] Pipeline: Return confidence scores with outfits

### Phase 4.4: Implicit Signals
- [ ] Client: Track behavioral signals (dwell time, regenerations)
- [ ] Pipeline: Accept implicit signals in requests (future)

### Phase 4.5: Progressive Profiling
- [ ] Client: Implement progressive question flow
- [ ] Pipeline: Handle partial signal sets gracefully

### Phase 4.6: Style Archetypes
- [ ] Both: Validate archetype definitions match

### Phase 4.7: Feedback Loop
- [ ] Client: Capture outfit ratings
- [ ] Pipeline: Accept feedback for ML training (future)

---

## Versioning

When signal definitions change:

1. Update this document in **both repos**
2. Bump the version number
3. Ensure backward compatibility or coordinate deployment

**Breaking changes require:**
- Client update deployed first (to handle new/old responses)
- Pipeline update deployed second
- Or: Feature flag in both systems

---

## Sync Checklist

When modifying signals:

- [ ] Update `SIGNAL_CONTRACT.md` in both repos
- [ ] Update `src/models/signals.ts` in pipeline service
- [ ] Update `types/signals.ts` in client app
- [ ] Update `lib/pipeline-client.ts` in client app
- [ ] Test end-to-end with all signal combinations
- [ ] Update `SIGNAL_ARCHITECTURE_ROADMAP.md` if needed

---

## Contact

- **Client Repo:** `v0-aura-stylist-agent`
- **Service Repo:** `aura-pipeline-service`
- **Architecture Doc:** `SIGNAL_ARCHITECTURE_ROADMAP.md`
