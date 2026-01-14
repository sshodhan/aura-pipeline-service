# AURA Stylist - Signal Architecture Roadmap

**Last Updated:** January 10, 2026
**Current Status:** Phase 4.1 Complete, Phase 4.2-4.7 Planned
**Vision:** Industry-leading personalized styling through optimal signal architecture

---

## Executive Summary

This document outlines the complete signal architecture journey from basic onboarding to industry-leading personalization. Based on comprehensive research of leading fashion apps (Stitch Fix, Wishi, Thread) and academic fashion psychology, we've defined a 4-phase roadmap culminating in an optimized signal system.

**Key Insight from Research:**
- Leading apps use **3-5 initial questions** with progressive profiling
- **90+ data points** collected over time (Stitch Fix model)
- **Three-layer taxonomy**: Identity (stable) → Context (situational) → Aesthetics (dynamic)
- **Implicit signals** (dwell time, behavior) outperform explicit alone
- **Confidence scoring** handles conflicting signals

---

## Phase Overview

| Phase | Status | Focus | Completion |
|-------|--------|-------|------------|
| **Phase 1** | ✅ Complete | Onboarding UI & Data Collection | Jan 8, 2026 |
| **Phase 2** | ✅ Complete | Signal Integration & Enhancement | Jan 9, 2026 |
| **Phase 3** | ✅ Complete | ProfileModal Deep Personalization | Jan 10, 2026 |
| **Phase 4.1** | ✅ Complete | Signal Taxonomy Cleanup | Jan 10, 2026 |
| **Phase 4.2-4.7** | 🔨 In Progress | Signal Architecture Optimization (FINAL) | TBD |

---

## Phase 1: Onboarding UI & Data Collection ✅

**Status:** COMPLETE (January 8, 2026)
**Goal:** Build foundational signal collection system

### Objectives
- Create user-friendly onboarding experience
- Collect initial style preferences
- Establish localStorage persistence
- Integrate with existing app flow

### Implementation
- ✅ Built `OnboardingModal.tsx` with single-screen experience
- ✅ Implemented multi-select pattern for style vibes
- ✅ Implemented single-select pattern for occasion
- ✅ Added localStorage persistence (`aura_onboarding_data`)
- ✅ Fixed all undefined variable bugs
- ✅ Validated type safety (43 tests passing)

### Signals Collected
1. **Style Vibes** (multi-select): minimal, polished, laid_back, bold, romantic, creative
2. **Occasion** (single-select): work, hangout, active, dinner, errands, home, date, formal
3. **Color Energy** (multi-select): dark_moody, light_airy, bold_vibrant, earthy_warm, cool_calm, rich_deep

### Files Modified
- `components/OnboardingModal.tsx`
- `types/signals.ts`
- `App.tsx`

### Key Learnings
- Users complete 3-signal onboarding in ~30 seconds
- Multi-select allows for hybrid style expression
- Visual emoji-based selection improves engagement

---

## Phase 2: Signal Enhancement ✅

**Status:** COMPLETE (January 9, 2026)
**Goal:** Integrate onboarding signals into outfit generation

### Objectives
- Pass signals to AI prompt
- Enhance outfit recommendations with user preferences
- Maintain backward compatibility
- Support hybrid style combinations

### Implementation
- ✅ Enhanced `getOutfitSuggestionAction()` with `onboardingSignals` parameter
- ✅ Created helper functions:
  - `getStyleVibeGuidance()` - Translates vibes to aesthetic descriptions
  - `getOccasionGuidance()` - Provides formality and dress code context
  - `getColorEnergyGuidance()` - Influences color palette selection
- ✅ StylistTab loads and passes onboarding data
- ✅ AI prompt sections added for each signal type

### Prompt Enhancements
\`\`\`
OCCASION: Hangout
- Formality level: Casual, relaxed
- Activities planned: Coffee with friends
- Dress code: Smart casual

STYLE VIBE: Minimal + Polished
- Clean lines, monochromatic palette
- Refined tailoring, sophisticated silhouettes

COLOR ENERGY: Dark & Moody
- Palette: Deep blacks, charcoal grays, navy blues
- Mood: Dramatic, sophisticated, urban edge
\`\`\`

### Files Modified
- `app/actions/gemini-actions.ts`
- `components/StylistTab.tsx`

### Key Learnings
- Multiple vibes create nuanced style blends (minimal + bold = minimalist statements)
- Occasion provides formality calibration
- Color energy influences palette without overriding weather needs

---

## Phase 3: ProfileModal Deep Personalization ✅

**Status:** COMPLETE (January 10, 2026)
**Goal:** Integrate all 8 signal categories from ProfileModal

### Objectives
- Utilize silhouette preferences for fit guidance
- Integrate color preferences (favorites & avoid)
- Use primaryPersona to override quick-select
- Load comprehensive user profile data
- Maintain backward compatibility

### Implementation
- ✅ Added `userProfile` parameter to `getOutfitSuggestionAction()` (6th parameter)
- ✅ Created helper functions:
  - `getSilhouetteGuidance()` - Provides fit descriptions for 5 silhouette types
  - `getColorPreferencesGuidance()` - Prioritizes favorites, avoids dislikes
- ✅ Enhanced StylistTab to load `aura_user_profile` from localStorage
- ✅ Synced gender and age from profile
- ✅ Primary persona now overrides quick-select context

### ProfileModal Signals Integrated

**All 8 Categories:**

1. **Style Vibe** (shared with OnboardingModal)
2. **Occasion** (shared with OnboardingModal)
3. **Color Energy** (shared with OnboardingModal)
4. **Personal Info**: userName, emailAddress
5. **Identity**: gender, ageRange
6. **Primary Persona**: User's default style archetype
7. **Silhouette Preferences** ⭐ NEW
   - Top: Oversized, Relaxed, Fitted, Structured, Flowing
   - Bottom: Oversized, Relaxed, Fitted, Structured, Flowing
8. **Color Preferences** ⭐ NEW
   - Favorites: Hex codes (max 5) - prioritized in recommendations
   - Avoid: Hex codes (unlimited) - NEVER used in recommendations

### Prompt Enhancements
\`\`\`
SILHOUETTE PREFERENCES:
- Top silhouette: Relaxed - Comfortable fits with ease
- Bottom silhouette: Fitted - Close to body, tailored
- Prioritize these fits when selecting garments

COLOR PREFERENCES (User-specified):
- Favorite colors: #1a2b3c, #4d5e6f, #7a8b9c
- Prioritize these colors in outfit selection
- Colors to avoid: #ff0000, #00ff00
- NEVER use these colors in recommendations
\`\`\`

### Files Modified
- `app/actions/gemini-actions.ts`
- `components/StylistTab.tsx`
- `SIGNALS_IMPLEMENTATION_STATUS.md`

### Key Learnings
- 8 signal categories provide comprehensive personalization
- Silhouette preferences significantly improve fit satisfaction
- Color avoidance is critical (users have strong dislikes)
- Primary persona creates stable style identity

---

## Phase 4: Signal Architecture Optimization (FINAL) 🔨

**Status:** IN PROGRESS (Phase 4.1 Complete)
**Goal:** Align with industry best practices for maximum personalization quality

### Research Foundation

Based on comprehensive analysis of:
- **Stitch Fix**: 90 data points initially, 30-100 behavioral dimensions
- **Fashion Psychology Research**: Identity vs situational dressing patterns
- **Professional Styling Frameworks**: 6-12 core style archetypes
- **UX Best Practices**: 3-5 initial questions, progressive profiling

### Strategic Objectives

1. **Eliminate Signal Confusion** - Clear taxonomy separating identity, context, aesthetics
2. **Implement Signal Hierarchy** - Precedence rules for conflicting signals
3. **Enable Implicit Learning** - Track behavior beyond explicit selections
4. **Progressive Profiling** - Reduce upfront friction, learn over time
5. **Confidence Scoring** - Communicate certainty, handle ambiguity

---

## Phase 4 Components

### 4.1 Signal Taxonomy Cleanup ✅ **COMPLETE**

**Status:** ✅ Complete (January 10, 2026)

**Problem:** Duplication and unclear boundaries between persona, occasion, and vibes

**Issues Resolved:**
- ✅ Removed `minimalist` from PERSONAS (kept in VIBES as aesthetic)
- ✅ Removed `romantic` from PERSONAS (kept in VIBES as aesthetic)
- ✅ Clarified when to use persona vs vibe with inline help text

**Solution: Three-Layer Framework**

**Layer 1: Lifestyle Personas** (WHO you are - stable identity)
\`\`\`typescript
// REMOVE: minimalist, romantic (these are aesthetics, not lifestyles)
const LIFESTYLE_PERSONAS = [
  "casual",           // Everyday relaxed lifestyle
  "professional",     // Office/business context
  "athletic",         // Fitness/sports lifestyle
  "business-casual",  // Flexible professional
  "street-style",     // Urban fashion-forward
  "elevated-casual",  // Polished everyday
  "athleisure",       // Active comfort lifestyle
]
\`\`\`

**Layer 2: Activity Contexts** (WHAT you're doing - situational)
\`\`\`typescript
// Activity-based occasions
const OCCASIONS = [
  "work",      // Office, meetings
  "hangout",   // Casual social
  "active",    // Workout, sports
  "dinner",    // Evening dining
  "errands",   // Running around
  "home",      // Staying in
  "date",      // Romantic outing
  "formal",    // Black tie, special events
]
\`\`\`

**Layer 3: Aesthetic Vibes** (HOW you want it styled - dynamic mood)
\`\`\`typescript
// Keep all aesthetic descriptors here
const STYLE_VIBES = [
  "minimal",    // Clean lines, monochromatic
  "polished",   // Refined tailoring
  "laid_back",  // Relaxed fits
  "bold",       // Statement pieces
  "romantic",   // Soft, flowing
  "creative",   // Artistic, unique
]
\`\`\`

**Implementation Tasks:**
- [x] Remove `minimalist` from STYLE_PERSONAS array in StylistTab.tsx
- [x] Remove `romantic` from STYLE_PERSONAS array in StylistTab.tsx
- [x] Update ProfileModal PERSONA_OPTIONS to match lifestyle-only list
- [x] Update documentation clarifying three layers
- [x] Add inline help text explaining difference
- [x] Create comprehensive regression test suite (15 test cases)

**Files Modified:**
- `components/StylistTab.tsx` - Removed duplicates from STYLE_PERSONAS
- `components/ProfileModal.tsx` - Updated PERSONA_OPTIONS
- `types/signals.ts` - Added three-layer framework documentation
- `types.ts` - Added primaryPersona documentation
- `SIGNALS_IMPLEMENTATION_STATUS.md` - Updated completion status
- `PHASE4_ML_PROGRESS_TRACKER.md` - Updated completion status
- `validate-ui-regression.js` - NEW: Regression test suite
- `TESTING.md` - NEW: Testing guide

**Impact:**
- ✅ Eliminates cognitive confusion
- ✅ Clear mental model: Lifestyle → Activity → Aesthetic
- ✅ Enables any combination (professional + hangout + romantic)
- ⚠️ **Breaking change** - Users with minimalist/romantic personas need to re-select (intentional to reduce complexity)
- ✅ Clean training data for future ML models

---

### 4.2 Signal Hierarchy & Precedence Rules 🎯

**Problem:** When signals conflict, unclear which takes priority

**Research Finding:** Context > Aesthetics > Identity (Stitch Fix model)

**Proposed Hierarchy:**

\`\`\`typescript
/**
 * Signal Precedence Algorithm
 *
 * 1. OCCASION (Highest Priority)
 *    - Immediate need overrides general preferences
 *    - Example: "formal" occasion forces dressy outfit even for casual persona
 *
 * 2. SILHOUETTE & COLOR PREFS (User-Specified Constraints)
 *    - Hard constraints: NEVER violate avoidColors
 *    - Soft constraints: Prioritize favorites, preferred fits
 *
 * 3. VIBES (Aesthetic Filter)
 *    - Style the outfit according to mood
 *    - Multiple vibes blend (minimal + bold = minimalist statements)
 *
 * 4. PERSONA (Identity Baseline)
 *    - Provides default when occasion is ambiguous
 *    - Influences quality level and aesthetic lens
 *
 * 5. TEMPORAL CONTEXT (Situational Override)
 *    - Time of day influences formality
 *    - Season influences fabrics/colors
 *    - Weather provides practical constraints
 */
\`\`\`

**Implementation Tasks:**
- [ ] Create `SignalPrecedenceEngine` class in `lib/signalPrecedence.ts`
- [ ] Define precedence rules as configurable weights
- [ ] Add conflict detection logic
- [ ] Implement signal blending algorithm
- [ ] Add logging for precedence decisions
- [ ] Create test suite for edge cases

**Test Scenarios:**
- Professional + Hangout + Bold → Elevated casual with statement pieces
- Casual + Formal + Minimal → Minimalist dressy (occasion wins)
- Athletic + Date + Romantic → Elevated athletic with soft touches

---

### 4.3 Confidence Scoring System 📊

**Problem:** No way to communicate recommendation certainty or handle ambiguity

**Research Finding:** Show confidence scores, offer alternatives when low confidence

**Confidence Factors:**

\`\`\`typescript
interface ConfidenceScore {
  overall: number          // 0-100
  factors: {
    signalConsistency: number   // Do signals align or conflict?
    historicalSuccess: number   // Has this combo worked before?
    weatherAppropriate: number  // Does outfit match conditions?
    occasionMatch: number       // Outfit fits occasion formality?
    profileCompleteness: number // How much user data available?
  }
  recommendation: "high" | "medium" | "low"
}
\`\`\`

**Scoring Algorithm:**

\`\`\`typescript
function calculateConfidence(signals: SignalSet): ConfidenceScore {
  // Signal Consistency (30%)
  // - High if persona, occasion, vibes align naturally
  // - Low if contradictory (professional + loungewear + bold)

  // Historical Success (20%)
  // - Track user satisfaction with similar combinations
  // - Learn from regeneration patterns

  // Weather Appropriateness (20%)
  // - High if outfit matches temperature, precipitation

  // Occasion Match (20%)
  // - High if formality aligns with occasion requirements

  // Profile Completeness (10%)
  // - Higher with more user data (silhouette, colors, etc.)
}
\`\`\`

**UX Handling:**

- **High Confidence (>75)**: Show single recommendation
- **Medium Confidence (50-75)**: Show recommendation + 1 alternative
- **Low Confidence (<50)**: Show 3 diverse options OR ask clarifying question

**Implementation Tasks:**
- [ ] Create `ConfidenceScoring` module in `lib/confidenceScoring.ts`
- [ ] Integrate with outfit generation
- [ ] Add UI indicator for confidence level
- [ ] Design alternative outfit UI for low confidence
- [ ] Track accuracy: Compare confidence to user satisfaction

---

### 4.4 Implicit Signal Tracking 📈

**Problem:** Only collecting explicit signals, missing behavioral data

**Research Finding:** Stitch Fix tracks 30-100 behavioral dimensions

**Behavioral Signals to Track:**

\`\`\`typescript
interface ImplicitSignals {
  // Engagement Metrics
  outfitViewDuration: number[]      // Time spent viewing each outfit
  scrollSpeed: number[]             // Fast scroll = disinterest
  imageZoomActions: number          // Zoom = high interest

  // Interaction Patterns
  regenerationFrequency: number     // How often user regenerates
  regenerationContext: {            // Why did they regenerate?
    personaChanged: boolean
    occasionChanged: boolean
    vibeChanged: boolean
    noSignalChange: boolean         // Just didn't like it
  }

  // Selection Behavior
  favoriteActions: number           // Items saved to favorites
  quickDismissals: number           // Dismissed in <2 seconds

  // Temporal Patterns
  timeOfDayPreferences: {           // When do they use the app?
    morning: number
    afternoon: number
    evening: number
  }
  dayOfWeekPatterns: {              // Weekend vs weekday usage
    weekday: number
    weekend: number
  }
}
\`\`\`

**Implementation Strategy:**

**Phase 4.4.1: Basic Tracking**
- [ ] Add event tracking to `StylistTab.tsx`
- [ ] Track outfit view duration
- [ ] Track regeneration patterns
- [ ] Store in localStorage (`aura_implicit_signals`)

**Phase 4.4.2: Analysis**
- [ ] Create `ImplicitSignalAnalyzer` in `lib/implicitAnalyzer.ts`
- [ ] Identify preference patterns from behavior
- [ ] Update user profile based on implicit signals

**Phase 4.4.3: Integration**
- [ ] Feed implicit signals to outfit generation
- [ ] Weight behavioral signals vs explicit signals (70/30 split)
- [ ] Adjust recommendations based on learned preferences

**Privacy Considerations:**
- ✅ All data stored locally (no server tracking)
- ✅ User can clear data anytime
- ✅ Transparent about what's being tracked

---

### 4.5 Progressive Profiling System 🎓

**Problem:** Collecting all signals upfront creates friction

**Research Finding:** 3-5 initial questions optimal, then progressive disclosure

**Current State:**
- OnboardingModal: 3 signals (vibes, occasion, color energy)
- ProfileModal: 8 categories all at once

**Optimal Flow:**

\`\`\`
┌─────────────────────────────────────────────┐
│ SESSION 1: First-Time User (30 seconds)    │
├─────────────────────────────────────────────┤
│ 1. Primary style vibe (single select)      │
│ 2. Today's occasion (single select)        │
│ 3. Color preference (visual select)        │
│ ────────────────────────────────────────    │
│ RESULT: Basic personalization immediately  │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ SESSION 2-5: Progressive Questions         │
├─────────────────────────────────────────────┤
│ After 2nd outfit: "What's your go-to fit?" │
│   → Collect silhouette preference          │
│                                             │
│ After 5th outfit: "Any colors to avoid?"   │
│   → Collect color dislikes                 │
│                                             │
│ After using for 1 week: "Your style vibe?" │
│   → Refine to multi-vibe selection         │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ CONTINUOUS: Implicit Learning               │
├─────────────────────────────────────────────┤
│ - Track outfit preferences from behavior   │
│ - Learn from regeneration patterns         │
│ - Adjust without asking questions          │
└─────────────────────────────────────────────┘
\`\`\`

**Progressive Question Strategy:**

\`\`\`typescript
interface ProgressiveQuestion {
  id: string
  question: string
  trigger: {
    sessionCount?: number      // After N outfit generations
    daysSinceFirstUse?: number // After N days
    confidenceThreshold?: number // When confidence < threshold
  }
  signal: keyof UserProfile
  skipIfHas?: keyof UserProfile // Don't ask if already collected
}

const PROGRESSIVE_QUESTIONS: ProgressiveQuestion[] = [
  {
    id: "silhouette_top",
    question: "How do you prefer your tops to fit?",
    trigger: { sessionCount: 2 },
    signal: "silhouette.topPreference",
    skipIfHas: "silhouette.topPreference"
  },
  {
    id: "color_avoid",
    question: "Any colors you avoid?",
    trigger: { sessionCount: 5 },
    signal: "colorProfile.avoid"
  },
  {
    id: "primary_persona",
    question: "How would you describe your style?",
    trigger: { daysSinceFirstUse: 7 },
    signal: "primaryPersona"
  },
  // ... more questions
]
\`\`\`

**Implementation Tasks:**
- [ ] Create `ProgressiveProfiler` in `lib/progressiveProfiler.ts`
- [ ] Track session count and usage metrics
- [ ] Design question UI components
- [ ] Implement trigger logic
- [ ] Add skip/dismiss option for all questions
- [ ] Store progressive profile state

**Impact:**
- ✅ Reduced initial friction (3 questions vs 8+)
- ✅ Higher completion rate
- ✅ Contextual questions feel natural
- ✅ Better data quality (questions asked when relevant)

---

### 4.6 Style Archetype Validation & Refinement 🎨

**Problem:** Current personas not validated against industry frameworks

**Research Finding:** Industry uses 6-12 core archetypes with clear definitions

**Proposed Core Archetypes (Research-Based):**

Based on analysis of Flourish Method, BU Style Six, and fashion psychology:

\`\`\`typescript
interface StyleArchetype {
  id: string
  name: string
  description: string
  visualKeywords: string[]
  colorPalettes: string[]
  silhouetteTendencies: string[]
  occasionAlignment: string[]
  exampleBrands: string[]
}

const CORE_ARCHETYPES: StyleArchetype[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Timeless elegance, tailored silhouettes, quality over trends",
    visualKeywords: ["tailored", "refined", "timeless", "sophisticated"],
    colorPalettes: ["navy", "white", "camel", "black", "gray"],
    silhouetteTendencies: ["Fitted", "Structured"],
    occasionAlignment: ["work", "dinner", "formal"],
    exampleBrands: ["Ralph Lauren", "Brooks Brothers", "J.Crew"]
  },
  {
    id: "minimalist",
    name: "Minimalist",
    description: "Clean lines, neutral palette, essential pieces, quiet luxury",
    visualKeywords: ["clean", "simple", "monochrome", "essential"],
    colorPalettes: ["black", "white", "gray", "beige", "navy"],
    silhouetteTendencies: ["Fitted", "Structured", "Relaxed"],
    occasionAlignment: ["work", "hangout", "errands"],
    exampleBrands: ["Everlane", "COS", "Uniqlo", "The Row"]
  },
  {
    id: "bohemian",
    name: "Bohemian",
    description: "Free-spirited, layered, eclectic mix, artistic expression",
    visualKeywords: ["flowing", "layered", "eclectic", "artistic"],
    colorPalettes: ["earth tones", "rust", "olive", "burgundy"],
    silhouetteTendencies: ["Flowing", "Oversized", "Relaxed"],
    occasionAlignment: ["hangout", "creative", "weekend"],
    exampleBrands: ["Free People", "Anthropologie", "Madewell"]
  },
  {
    id: "edgy",
    name: "Edgy/Urban",
    description: "Bold, modern, street-influenced, confident statements",
    visualKeywords: ["bold", "urban", "leather", "asymmetric"],
    colorPalettes: ["black", "charcoal", "metallics", "red accents"],
    silhouetteTendencies: ["Fitted", "Oversized", "Structured"],
    occasionAlignment: ["hangout", "night out", "creative"],
    exampleBrands: ["AllSaints", "Zara", "Urban Outfitters"]
  },
  {
    id: "romantic",
    name: "Romantic",
    description: "Feminine, soft details, flowing fabrics, delicate touches",
    visualKeywords: ["soft", "flowing", "feminine", "delicate"],
    colorPalettes: ["blush", "cream", "soft blue", "lavender"],
    silhouetteTendencies: ["Flowing", "Fitted at waist"],
    occasionAlignment: ["date", "dinner", "garden party"],
    exampleBrands: ["Reformation", "& Other Stories"]
  },
  {
    id: "athletic",
    name: "Athletic/Active",
    description: "Performance-focused, comfortable, sporty aesthetics",
    visualKeywords: ["sporty", "comfortable", "functional", "modern"],
    colorPalettes: ["black", "navy", "gray", "bright accents"],
    silhouetteTendencies: ["Fitted", "Relaxed", "Stretchy"],
    occasionAlignment: ["active", "errands", "casual weekend"],
    exampleBrands: ["Lululemon", "Outdoor Voices", "Nike"]
  }
]
\`\`\`

**Implementation Tasks:**
- [ ] Validate archetypes with fashion professionals
- [ ] User testing: Can users identify their archetype?
- [ ] Create archetype quiz with visual examples
- [ ] Map current personas to new archetypes
- [ ] Migration strategy for existing users
- [ ] Update all documentation

---

### 4.7 Enhanced Feedback Loop Mechanism 🔄

**Problem:** No way for users to rate recommendations or provide feedback

**Research Finding:** Stitch Fix's Style Shuffle generates millions of data points

**Proposed Feedback System:**

**Swipe-Based Style Discovery (Style Shuffle Clone):**

\`\`\`typescript
interface StyleShuffleCard {
  outfitImage: string
  items: OutfitItem[]
  styleSignals: {
    persona: string
    vibes: string[]
    colors: string[]
    silhouettes: string[]
  }
}

interface StyleShuffleFeedback {
  cardId: string
  action: "like" | "dislike" | "love" | "skip"
  timestamp: Date
  signals: StyleSignals
}
\`\`\`

**UI Flow:**
- Show outfit cards one at a time
- User swipes right (like) or left (dislike)
- Optional: Heart for "love"
- Build preference profile from swipe patterns

**Multi-Dimensional Rating (After Generation):**

\`\`\`typescript
interface OutfitRating {
  overall: 1 | 2 | 3 | 4 | 5
  dimensions: {
    styleMatch: 1 | 2 | 3 | 4 | 5      // Matches my style?
    occasionFit: 1 | 2 | 3 | 4 | 5     // Right for the occasion?
    colorPalette: 1 | 2 | 3 | 4 | 5    // Like the colors?
    silhouetteFit: 1 | 2 | 3 | 4 | 5   // Right fit for me?
    weatherApp: 1 | 2 | 3 | 4 | 5      // Appropriate for weather?
  }
  freeformFeedback?: string
}
\`\`\`

**Implementation Tasks:**
- [ ] Build StyleShuffle component
- [ ] Create outfit card generator
- [ ] Add swipe gesture handlers
- [ ] Store feedback in localStorage
- [ ] Build rating modal UI
- [ ] Analyze feedback patterns
- [ ] Update profile based on feedback

---

## Phase 4 Implementation Timeline

### Week 1: Foundation ✅
- **4.1 Signal Taxonomy Cleanup** ✅ COMPLETE (Jan 10, 2026)

### Week 2-3: Intelligence & Rules
- **4.2 Signal Hierarchy Rules** (precedence algorithm)
- **4.6 Archetype Validation** (research & user testing)

### Week 3-4: Intelligence
- **4.3 Confidence Scoring** (build scoring system)
- **4.4 Implicit Signal Tracking** (basic tracking)

### Week 5-6: Advanced Features
- **4.5 Progressive Profiling** (smart onboarding)
- **4.7 Feedback Loop** (Style Shuffle)

### Week 7-8: Testing & Refinement
- Comprehensive testing of all components
- User acceptance testing
- Performance optimization
- Documentation completion

---

## Success Metrics for Phase 4

### User Experience Metrics
- **Onboarding Completion**: >85% (currently unknown)
- **First Outfit Satisfaction**: >70% rated 4+ stars
- **Return Usage**: >50% return within 7 days
- **Session Length**: Average 3+ outfit generations per session

### Technical Metrics
- **Signal Consistency**: <10% conflicting signal combinations
- **Confidence Accuracy**: Confidence score correlates >0.7 with satisfaction
- **Implicit Signal Value**: Behavioral signals improve recommendations >15%
- **Progressive Profiling**: Profile completeness reaches 80% by day 30

### Business Metrics
- **User Retention**: 30-day retention >40%
- **Recommendation Acceptance**: >60% users don't regenerate
- **Profile Completion**: >70% users complete progressive questions

---

## Research Citations

This phase is informed by comprehensive research including:

### Leading Fashion Apps
- Stitch Fix (90 data points, Style Shuffle, human+AI hybrid)
- Wishi (virtual wardrobe, AI + stylist feedback)
- Thread (behavioral learning, progressive profiling)

### Academic Research
- Fashion Psychology (identity vs situational dressing)
- Dress as Person Perception (clothing serves psychological functions)
- Styling the Self (personality correlates with clothing choices)

### Professional Frameworks
- Flourish Method (8 style archetypes)
- BU Style Six (6 style personalities)
- Jungian Fashion Archetypes (12 psychological archetypes)

### UX Best Practices
- 3-5 initial questions optimal (30% reduction in bounce with fewer questions)
- Progressive profiling increases completion rates
- Visual quizzes outperform text-only
- Implicit signals (dwell time, clicks) more revealing than explicit

---

## Post-Phase 4: Maintenance Mode

After Phase 4 completion, the signal system will be **feature-complete** and move into maintenance mode:

### Ongoing Activities
- Monitor signal quality metrics
- Refine confidence scoring based on data
- Update style archetypes as trends evolve
- A/B test signal hierarchy tweaks
- Expand implicit signal tracking
- Continuous user feedback integration

### Future Enhancements (Beyond Roadmap)
- Regional style profiles (NYC vs LA vs international)
- Seasonal trend integration (2026 fall colors, silhouettes)
- Brand aesthetic mapping (user says "I like Everlane" → infer minimal)
- Wardrobe integration (coordinate with existing clothes)
- Social signals (what are friends wearing?)
- Budget-aware recommendations
- Sustainability preferences

---

## Conclusion

Phase 4 represents the culmination of signal architecture work, transforming AURA from a basic styling app to an industry-leading personalization engine. By addressing taxonomy clarity, implementing intelligent precedence, tracking implicit behavior, and enabling progressive profiling, we align with best practices from Stitch Fix and academic research.

**Phase 4 delivers:**
- ✅ Clear, unambiguous signal taxonomy
- ✅ Intelligent conflict resolution
- ✅ Behavioral learning beyond explicit input
- ✅ Frictionless onboarding with progressive disclosure
- ✅ Confidence-aware recommendations
- ✅ Rich feedback mechanisms

**Result:** Maximum personalization quality with minimal user effort.

---

**Next Step:** Begin Phase 4.2 - Signal Hierarchy & Precedence Rules

**Completed:**
- ✅ Phase 4.1 - Signal Taxonomy Cleanup (Jan 10, 2026)
