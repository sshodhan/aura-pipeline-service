/**
 * Signal Guidance Data Module
 *
 * Provides rich descriptions and metadata for all signals.
 * Used by V2 API to return UI-ready guidance to clients.
 *
 * This moves signal translation logic from client to server,
 * ensuring single source of truth and reducing client bundle size.
 */

import {
  Persona,
  Occasion,
  Vibe,
  ColorEnergy,
  Silhouette,
  PERSONAS,
  OCCASIONS,
  VIBES,
  COLOR_ENERGIES,
  SILHOUETTES,
  PERSONA_OCCASION_COMPATIBILITY,
  OCCASION_VIBE_COMPATIBILITY,
} from "../models/signals";

// =============================================================================
// Type Definitions
// =============================================================================

export interface PersonaGuidance {
  id: Persona;
  name: string;
  description: string;
  keywords: string[];
  formalityBaseline: "low" | "medium" | "high";
  lifestyleContext: string;
  typicalActivities: string[];
  brandAffinities: string[];
}

export interface OccasionGuidance {
  id: Occasion;
  name: string;
  description: string;
  formality: string;
  formalityLevel: number; // 1-10 scale
  activities: string[];
  dressCode: string;
  timeOfDay: ("morning" | "afternoon" | "evening" | "any")[];
  typicalDuration: string;
}

export interface VibeGuidance {
  id: Vibe;
  name: string;
  description: string;
  keywords: string[];
  aestheticPrinciples: string[];
  colorTendencies: string[];
  silhouetteTendencies: Silhouette[];
  avoidElements: string[];
}

export interface ColorEnergyGuidance {
  id: ColorEnergy;
  name: string;
  description: string;
  mood: string;
  palette: Array<{ name: string; hex: string }>;
  bestFor: string[];
  seasonalAffinity: ("spring" | "summer" | "fall" | "winter")[];
}

export interface SilhouetteGuidance {
  id: Silhouette;
  name: string;
  description: string;
  fitDescription: string;
  bestFor: string[];
  bodyTypes: string[];
}

// =============================================================================
// Persona Guidance
// =============================================================================

export const PERSONA_GUIDANCE: Record<Persona, PersonaGuidance> = {
  casual: {
    id: "casual",
    name: "Casual",
    description: "Everyday relaxed lifestyle prioritizing comfort and ease",
    keywords: ["relaxed", "comfortable", "effortless", "easy-going"],
    formalityBaseline: "low",
    lifestyleContext: "Weekend vibes every day",
    typicalActivities: ["coffee runs", "casual meetups", "neighborhood walks"],
    brandAffinities: ["Uniqlo", "Gap", "H&M", "Target"],
  },
  professional: {
    id: "professional",
    name: "Professional",
    description: "Office/business context requiring polished presentation",
    keywords: ["polished", "refined", "business-ready", "executive"],
    formalityBaseline: "high",
    lifestyleContext: "Corporate environment with client-facing responsibilities",
    typicalActivities: ["meetings", "presentations", "client calls", "networking"],
    brandAffinities: ["Brooks Brothers", "J.Crew", "Banana Republic", "Theory"],
  },
  athletic: {
    id: "athletic",
    name: "Athletic",
    description: "Fitness/sports lifestyle with performance focus",
    keywords: ["sporty", "active", "performance", "functional"],
    formalityBaseline: "low",
    lifestyleContext: "Active lifestyle with regular workouts",
    typicalActivities: ["gym", "running", "yoga", "sports"],
    brandAffinities: ["Nike", "Lululemon", "Adidas", "Under Armour"],
  },
  "business-casual": {
    id: "business-casual",
    name: "Business Casual",
    description: "Flexible professional style balancing polish with comfort",
    keywords: ["versatile", "smart", "approachable", "put-together"],
    formalityBaseline: "medium",
    lifestyleContext: "Modern workplace with relaxed dress code",
    typicalActivities: ["team meetings", "collaborative work", "casual Fridays"],
    brandAffinities: ["Everlane", "COS", "Club Monaco", "Massimo Dutti"],
  },
  "street-style": {
    id: "street-style",
    name: "Street Style",
    description: "Urban fashion-forward aesthetic with trend awareness",
    keywords: ["urban", "trendy", "fashion-forward", "expressive"],
    formalityBaseline: "low",
    lifestyleContext: "City life with strong personal style",
    typicalActivities: ["exploring the city", "creative events", "social media"],
    brandAffinities: ["Supreme", "Off-White", "Stüssy", "A.P.C."],
  },
  "elevated-casual": {
    id: "elevated-casual",
    name: "Elevated Casual",
    description: "Polished everyday style that's refined yet approachable",
    keywords: ["refined", "polished-casual", "quality", "understated"],
    formalityBaseline: "medium",
    lifestyleContext: "Quality-conscious with attention to detail",
    typicalActivities: ["brunch", "art galleries", "nice dinners", "travel"],
    brandAffinities: ["Aritzia", "Reiss", "Sandro", "AllSaints"],
  },
  athleisure: {
    id: "athleisure",
    name: "Athleisure",
    description: "Active comfort lifestyle blending sporty and casual",
    keywords: ["comfortable", "sporty-casual", "versatile", "modern"],
    formalityBaseline: "low",
    lifestyleContext: "On-the-go lifestyle valuing versatility",
    typicalActivities: ["errands after gym", "casual work", "weekend activities"],
    brandAffinities: ["Lululemon", "Alo Yoga", "Outdoor Voices", "Vuori"],
  },
};

// =============================================================================
// Occasion Guidance
// =============================================================================

export const OCCASION_GUIDANCE: Record<Occasion, OccasionGuidance> = {
  work: {
    id: "work",
    name: "Work",
    description: "Professional office environment requiring appropriate attire",
    formality: "Business professional to business casual",
    formalityLevel: 7,
    activities: ["meetings", "presentations", "client calls", "desk work"],
    dressCode: "Smart, polished, and appropriate for your industry",
    timeOfDay: ["morning", "afternoon"],
    typicalDuration: "8-10 hours",
  },
  hangout: {
    id: "hangout",
    name: "Hangout",
    description: "Casual social time with friends or acquaintances",
    formality: "Casual to smart casual",
    formalityLevel: 3,
    activities: ["coffee with friends", "casual lunch", "shopping together", "movies"],
    dressCode: "Relaxed but put-together, showing personality",
    timeOfDay: ["any"],
    typicalDuration: "2-4 hours",
  },
  active: {
    id: "active",
    name: "Active",
    description: "Physical activities requiring functional, comfortable clothing",
    formality: "Athletic/functional",
    formalityLevel: 1,
    activities: ["gym workout", "running", "yoga", "hiking", "sports"],
    dressCode: "Performance wear appropriate for the activity",
    timeOfDay: ["morning", "afternoon", "evening"],
    typicalDuration: "1-2 hours",
  },
  dinner: {
    id: "dinner",
    name: "Dinner",
    description: "Evening dining occasion at restaurants",
    formality: "Smart casual to dressy",
    formalityLevel: 6,
    activities: ["restaurant dining", "special dinner", "celebration meal"],
    dressCode: "Elevated and appropriate for the venue",
    timeOfDay: ["evening"],
    typicalDuration: "2-3 hours",
  },
  errands: {
    id: "errands",
    name: "Errands",
    description: "Running daily tasks and quick appointments",
    formality: "Casual comfortable",
    formalityLevel: 2,
    activities: ["grocery shopping", "appointments", "picking up orders", "quick stops"],
    dressCode: "Practical and comfortable, easy to move in",
    timeOfDay: ["morning", "afternoon"],
    typicalDuration: "1-3 hours",
  },
  home: {
    id: "home",
    name: "Home",
    description: "Staying in, working from home, or relaxing",
    formality: "Ultra casual/loungewear",
    formalityLevel: 1,
    activities: ["relaxing", "WFH", "Netflix", "cooking", "reading"],
    dressCode: "Maximum comfort, cozy layers",
    timeOfDay: ["any"],
    typicalDuration: "All day",
  },
  date: {
    id: "date",
    name: "Date",
    description: "Romantic outing designed to make an impression",
    formality: "Dressy casual to dressy",
    formalityLevel: 7,
    activities: ["romantic dinner", "drinks", "show/concert", "special outing"],
    dressCode: "Thoughtful, attractive, and confidence-boosting",
    timeOfDay: ["afternoon", "evening"],
    typicalDuration: "3-5 hours",
  },
  formal: {
    id: "formal",
    name: "Formal",
    description: "Black tie events, weddings, and special occasions",
    formality: "Formal/black tie",
    formalityLevel: 10,
    activities: ["weddings", "galas", "award ceremonies", "formal dinners"],
    dressCode: "Elegant formal wear appropriate to the event",
    timeOfDay: ["evening"],
    typicalDuration: "4-6 hours",
  },
};

// =============================================================================
// Vibe Guidance
// =============================================================================

export const VIBE_GUIDANCE: Record<Vibe, VibeGuidance> = {
  minimal: {
    id: "minimal",
    name: "Minimal",
    description: "Clean lines and monochromatic palette with understated elegance",
    keywords: ["clean", "simple", "refined", "no-clutter", "essential"],
    aestheticPrinciples: [
      "Less is more",
      "Quality over quantity",
      "Neutral palette focus",
      "Clean silhouettes",
    ],
    colorTendencies: ["black", "white", "gray", "navy", "beige"],
    silhouetteTendencies: ["fitted", "structured"],
    avoidElements: ["busy patterns", "loud colors", "excessive accessories", "logos"],
  },
  polished: {
    id: "polished",
    name: "Polished",
    description: "Refined tailoring with sophisticated silhouettes",
    keywords: ["refined", "tailored", "sophisticated", "put-together", "elegant"],
    aestheticPrinciples: [
      "Attention to fit",
      "Classic proportions",
      "Quality fabrics",
      "Cohesive styling",
    ],
    colorTendencies: ["navy", "charcoal", "cream", "burgundy", "forest green"],
    silhouetteTendencies: ["structured", "fitted"],
    avoidElements: ["casual basics", "athletic wear", "distressed items", "oversized fits"],
  },
  laid_back: {
    id: "laid_back",
    name: "Laid Back",
    description: "Relaxed fits with comfortable fabrics and effortless style",
    keywords: ["relaxed", "comfortable", "easy", "effortless", "casual-cool"],
    aestheticPrinciples: [
      "Comfort first",
      "Easy-going proportions",
      "Soft fabrics",
      "Unstudied look",
    ],
    colorTendencies: ["denim blue", "earth tones", "soft neutrals", "washed colors"],
    silhouetteTendencies: ["relaxed", "oversized"],
    avoidElements: ["stiff fabrics", "formal pieces", "tight fits", "heavy structure"],
  },
  bold: {
    id: "bold",
    name: "Bold",
    description: "Statement pieces with vibrant colors and confident expression",
    keywords: ["statement", "vibrant", "confident", "eye-catching", "daring"],
    aestheticPrinciples: [
      "Make a statement",
      "Color confidence",
      "Mix unexpected elements",
      "Own the room",
    ],
    colorTendencies: ["red", "cobalt blue", "emerald", "hot pink", "orange"],
    silhouetteTendencies: ["structured", "fitted", "oversized"],
    avoidElements: ["playing it safe", "all neutrals", "basic combinations"],
  },
  romantic: {
    id: "romantic",
    name: "Romantic",
    description: "Soft flowing fabrics with feminine and delicate touches",
    keywords: ["soft", "flowing", "feminine", "delicate", "dreamy"],
    aestheticPrinciples: [
      "Soft textures",
      "Flowing movement",
      "Delicate details",
      "Gentle colors",
    ],
    colorTendencies: ["blush", "lavender", "soft blue", "cream", "rose"],
    silhouetteTendencies: ["flowing", "relaxed"],
    avoidElements: ["harsh lines", "heavy structure", "dark colors only", "masculine cuts"],
  },
  creative: {
    id: "creative",
    name: "Creative",
    description: "Artistic and unique combinations with expressive styling",
    keywords: ["artistic", "unique", "eclectic", "expressive", "individual"],
    aestheticPrinciples: [
      "Self-expression first",
      "Mix patterns and textures",
      "Unexpected combinations",
      "Personal flair",
    ],
    colorTendencies: ["mixed palette", "unexpected combos", "artistic prints"],
    silhouetteTendencies: ["oversized", "flowing", "structured"],
    avoidElements: ["cookie-cutter looks", "playing too safe", "basic combinations"],
  },
};

// =============================================================================
// Color Energy Guidance
// =============================================================================

export const COLOR_ENERGY_GUIDANCE: Record<ColorEnergy, ColorEnergyGuidance> = {
  dark_moody: {
    id: "dark_moody",
    name: "Dark & Moody",
    description: "Deep blacks, charcoal, navy, and jewel tones for dramatic effect",
    mood: "Sophisticated, mysterious, powerful",
    palette: [
      { name: "Charcoal", hex: "#36454F" },
      { name: "Deep Navy", hex: "#1a1a2e" },
      { name: "Burgundy", hex: "#800020" },
      { name: "Forest", hex: "#0f3460" },
      { name: "Plum", hex: "#533483" },
    ],
    bestFor: ["evening events", "professional settings", "winter months"],
    seasonalAffinity: ["fall", "winter"],
  },
  light_airy: {
    id: "light_airy",
    name: "Light & Airy",
    description: "Soft whites, creams, and pastels for a fresh, open feel",
    mood: "Fresh, optimistic, approachable",
    palette: [
      { name: "Cream", hex: "#faf0e6" },
      { name: "Soft White", hex: "#fff5ee" },
      { name: "Pale Blue", hex: "#e6e6fa" },
      { name: "Mint", hex: "#f0fff0" },
      { name: "Blush", hex: "#ffe4e1" },
    ],
    bestFor: ["daytime events", "spring/summer", "casual occasions"],
    seasonalAffinity: ["spring", "summer"],
  },
  bold_vibrant: {
    id: "bold_vibrant",
    name: "Bold & Vibrant",
    description: "Bright reds, electric blues, and vivid hues that command attention",
    mood: "Energetic, confident, playful",
    palette: [
      { name: "Coral Red", hex: "#ff6b6b" },
      { name: "Electric Teal", hex: "#4ecdc4" },
      { name: "Sky Blue", hex: "#45b7d1" },
      { name: "Sunny Yellow", hex: "#f9ca24" },
      { name: "Purple Pop", hex: "#6c5ce7" },
    ],
    bestFor: ["making a statement", "creative environments", "social events"],
    seasonalAffinity: ["spring", "summer"],
  },
  earthy_warm: {
    id: "earthy_warm",
    name: "Earthy & Warm",
    description: "Browns, terracotta, olive, and rust tones grounded in nature",
    mood: "Grounded, natural, cozy",
    palette: [
      { name: "Saddle Brown", hex: "#8b4513" },
      { name: "Terracotta", hex: "#d2691e" },
      { name: "Camel", hex: "#cd853f" },
      { name: "Sand", hex: "#deb887" },
      { name: "Rust", hex: "#f4a460" },
    ],
    bestFor: ["fall season", "outdoor activities", "casual settings"],
    seasonalAffinity: ["fall", "winter"],
  },
  cool_calm: {
    id: "cool_calm",
    name: "Cool & Calm",
    description: "Cool blues, soft grays, and sage for a serene, collected presence",
    mood: "Serene, trustworthy, balanced",
    palette: [
      { name: "Sky Blue", hex: "#87ceeb" },
      { name: "Steel Blue", hex: "#b0c4de" },
      { name: "Slate", hex: "#778899" },
      { name: "Cool Gray", hex: "#708090" },
      { name: "Deep Teal", hex: "#2f4f4f" },
    ],
    bestFor: ["professional settings", "interviews", "calming environments"],
    seasonalAffinity: ["summer", "winter"],
  },
  rich_deep: {
    id: "rich_deep",
    name: "Rich & Deep",
    description: "Burgundy, emerald, and deep purple for luxurious sophistication",
    mood: "Luxurious, sophisticated, regal",
    palette: [
      { name: "Wine", hex: "#800020" },
      { name: "Deep Purple", hex: "#4a0e4e" },
      { name: "Hunter Green", hex: "#1a472a" },
      { name: "Oxford Blue", hex: "#002147" },
      { name: "Mahogany", hex: "#3d0c02" },
    ],
    bestFor: ["formal events", "holiday season", "evening occasions"],
    seasonalAffinity: ["fall", "winter"],
  },
};

// =============================================================================
// Silhouette Guidance
// =============================================================================

export const SILHOUETTE_GUIDANCE: Record<Silhouette, SilhouetteGuidance> = {
  oversized: {
    id: "oversized",
    name: "Oversized",
    description: "Generously sized pieces that drape away from the body",
    fitDescription: "Relaxed, roomy fit with extra fabric for comfort and style",
    bestFor: ["casual occasions", "layering", "street style", "comfort-focused looks"],
    bodyTypes: ["all body types - creates relaxed silhouette"],
  },
  relaxed: {
    id: "relaxed",
    name: "Relaxed",
    description: "Easy fit with comfortable room to move",
    fitDescription: "Not tight, not loose - comfortable ease throughout",
    bestFor: ["everyday wear", "casual settings", "laid-back occasions"],
    bodyTypes: ["all body types - universally flattering"],
  },
  fitted: {
    id: "fitted",
    name: "Fitted",
    description: "Close to the body following natural contours",
    fitDescription: "Tailored to follow body shape without being tight",
    bestFor: ["professional settings", "polished looks", "evening wear"],
    bodyTypes: ["those wanting to show shape definition"],
  },
  structured: {
    id: "structured",
    name: "Structured",
    description: "Architectural pieces with defined shape and form",
    fitDescription: "Built-in structure that holds its shape",
    bestFor: ["professional environments", "formal occasions", "polished aesthetics"],
    bodyTypes: ["creates defined shape for any body type"],
  },
  flowing: {
    id: "flowing",
    name: "Flowing",
    description: "Soft, drapey pieces that move with the body",
    fitDescription: "Liquid-like fabrics that skim and drape gracefully",
    bestFor: ["romantic occasions", "warm weather", "feminine aesthetics"],
    bodyTypes: ["flattering movement for all body types"],
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get complete guidance for a signal combination
 */
export function getSignalGuidance(signals: {
  persona: Persona;
  occasion: Occasion;
  vibe: Vibe;
  colorEnergy?: ColorEnergy;
}): {
  persona: PersonaGuidance;
  occasion: OccasionGuidance;
  vibe: VibeGuidance;
  colorEnergy?: ColorEnergyGuidance;
} {
  return {
    persona: PERSONA_GUIDANCE[signals.persona],
    occasion: OCCASION_GUIDANCE[signals.occasion],
    vibe: VIBE_GUIDANCE[signals.vibe],
    colorEnergy: signals.colorEnergy
      ? COLOR_ENERGY_GUIDANCE[signals.colorEnergy]
      : undefined,
  };
}

/**
 * Get all available signals with their guidance
 */
export function getAllSignals() {
  return {
    personas: PERSONAS.map((id) => PERSONA_GUIDANCE[id]),
    occasions: OCCASIONS.map((id) => OCCASION_GUIDANCE[id]),
    vibes: VIBES.map((id) => VIBE_GUIDANCE[id]),
    colorEnergies: COLOR_ENERGIES.map((id) => COLOR_ENERGY_GUIDANCE[id]),
    silhouettes: SILHOUETTES.map((id) => SILHOUETTE_GUIDANCE[id]),
  };
}

/**
 * Get compatibility rules
 */
export function getCompatibilityRules() {
  return {
    personaToOccasion: PERSONA_OCCASION_COMPATIBILITY,
    occasionToVibe: OCCASION_VIBE_COMPATIBILITY,
  };
}

/**
 * Validate that all signals are properly defined
 */
export function validateSignalGuidance(): boolean {
  const missingPersonas = PERSONAS.filter((p) => !PERSONA_GUIDANCE[p]);
  const missingOccasions = OCCASIONS.filter((o) => !OCCASION_GUIDANCE[o]);
  const missingVibes = VIBES.filter((v) => !VIBE_GUIDANCE[v]);
  const missingColorEnergies = COLOR_ENERGIES.filter(
    (c) => !COLOR_ENERGY_GUIDANCE[c]
  );
  const missingSilhouettes = SILHOUETTES.filter((s) => !SILHOUETTE_GUIDANCE[s]);

  if (
    missingPersonas.length ||
    missingOccasions.length ||
    missingVibes.length ||
    missingColorEnergies.length ||
    missingSilhouettes.length
  ) {
    console.error("Missing signal guidance:", {
      missingPersonas,
      missingOccasions,
      missingVibes,
      missingColorEnergies,
      missingSilhouettes,
    });
    return false;
  }

  return true;
}
