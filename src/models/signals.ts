/**
 * Signal Models for AURA Pipeline
 *
 * These types should be kept in sync with the frontend (v0-aura-stylist-agent).
 * Source of truth: v0-aura-stylist-agent/types/signals.ts
 *
 * Three-Layer Signal Taxonomy:
 * - Layer 1: Identity (Personas) - WHO you are (stable)
 * - Layer 2: Context (Occasions) - WHAT you're doing (situational)
 * - Layer 3: Aesthetics (Vibes) - HOW you want it styled (dynamic mood)
 */

// =============================================================================
// Layer 1: Identity (Lifestyle Personas)
// =============================================================================

export const PERSONAS = [
  "casual",
  "professional",
  "athletic",
  "business-casual",
  "street-style",
  "elevated-casual",
  "athleisure",
] as const;

export type Persona = (typeof PERSONAS)[number];

export const PERSONA_DESCRIPTIONS: Record<Persona, string> = {
  casual: "Everyday relaxed lifestyle",
  professional: "Office/business context",
  athletic: "Fitness/sports lifestyle",
  "business-casual": "Flexible professional",
  "street-style": "Urban fashion-forward",
  "elevated-casual": "Polished everyday",
  athleisure: "Active comfort lifestyle",
};

// =============================================================================
// Layer 2: Context (Occasions)
// =============================================================================

export const OCCASIONS = [
  "work",
  "hangout",
  "active",
  "dinner",
  "errands",
  "home",
  "date",
  "formal",
] as const;

export type Occasion = (typeof OCCASIONS)[number];

export const OCCASION_DESCRIPTIONS: Record<
  Occasion,
  { formality: string; activities: string; dressCode: string }
> = {
  work: {
    formality: "Professional, polished",
    activities: "Office, meetings, presentations",
    dressCode: "Business or business casual",
  },
  hangout: {
    formality: "Casual, relaxed",
    activities: "Coffee with friends, shopping, casual socializing",
    dressCode: "Smart casual",
  },
  active: {
    formality: "Functional, comfortable",
    activities: "Gym, sports, outdoor activities",
    dressCode: "Athletic wear",
  },
  dinner: {
    formality: "Elevated, put-together",
    activities: "Restaurant dining, evening social",
    dressCode: "Smart casual to dressy",
  },
  errands: {
    formality: "Practical, comfortable",
    activities: "Grocery shopping, appointments, daily tasks",
    dressCode: "Casual comfortable",
  },
  home: {
    formality: "Ultra casual, cozy",
    activities: "Relaxing at home, WFH comfort",
    dressCode: "Loungewear",
  },
  date: {
    formality: "Thoughtful, attractive",
    activities: "Romantic outing, special occasion",
    dressCode: "Dressy casual to dressy",
  },
  formal: {
    formality: "Very formal, elegant",
    activities: "Black tie events, weddings, galas",
    dressCode: "Formal wear",
  },
};

// =============================================================================
// Layer 3: Aesthetics (Style Vibes)
// =============================================================================

export const VIBES = [
  "minimal",
  "polished",
  "laid_back",
  "bold",
  "romantic",
  "creative",
] as const;

export type Vibe = (typeof VIBES)[number];

export const VIBE_DESCRIPTIONS: Record<Vibe, string> = {
  minimal: "Clean lines, monochromatic palette, understated elegance",
  polished: "Refined tailoring, sophisticated silhouettes, put-together",
  laid_back: "Relaxed fits, comfortable fabrics, effortless style",
  bold: "Statement pieces, vibrant colors, confident expression",
  romantic: "Soft, flowing fabrics, feminine details, delicate touches",
  creative: "Artistic, unique combinations, expressive styling",
};

// =============================================================================
// Color Energy
// =============================================================================

export const COLOR_ENERGIES = [
  "dark_moody",
  "light_airy",
  "bold_vibrant",
  "earthy_warm",
  "cool_calm",
  "rich_deep",
] as const;

export type ColorEnergy = (typeof COLOR_ENERGIES)[number];

export const COLOR_ENERGY_PALETTES: Record<ColorEnergy, string[]> = {
  dark_moody: ["#1a1a2e", "#16213e", "#0f3460", "#e94560", "#533483"],
  light_airy: ["#faf0e6", "#fff5ee", "#f5f5dc", "#e6e6fa", "#f0fff0"],
  bold_vibrant: ["#ff6b6b", "#4ecdc4", "#45b7d1", "#f9ca24", "#6c5ce7"],
  earthy_warm: ["#8b4513", "#d2691e", "#cd853f", "#deb887", "#f4a460"],
  cool_calm: ["#87ceeb", "#b0c4de", "#778899", "#708090", "#2f4f4f"],
  rich_deep: ["#800020", "#4a0e4e", "#1a472a", "#002147", "#3d0c02"],
};

// =============================================================================
// Weather Conditions
// =============================================================================

export const WEATHER_CONDITIONS = [
  "clear",
  "partly_cloudy",
  "cloudy",
  "overcast",
  "light_rain",
  "rain",
  "heavy_rain",
  "thunderstorm",
  "snow",
  "sleet",
  "fog",
  "windy",
] as const;

export type WeatherCondition = (typeof WEATHER_CONDITIONS)[number];

export const TEMPERATURE_RANGES = [
  "cold", // < 40°F
  "cool", // 40-55°F
  "mild", // 55-70°F
  "warm", // 70-85°F
  "hot", // > 85°F
] as const;

export type TemperatureRange = (typeof TEMPERATURE_RANGES)[number];

// =============================================================================
// Silhouette Preferences
// =============================================================================

export const SILHOUETTES = [
  "oversized",
  "relaxed",
  "fitted",
  "structured",
  "flowing",
] as const;

export type Silhouette = (typeof SILHOUETTES)[number];

// =============================================================================
// Composite Types
// =============================================================================

export interface SignalCombination {
  persona: Persona;
  occasion: Occasion;
  vibe: Vibe;
  colorEnergy: ColorEnergy;
  weatherCondition: WeatherCondition;
  temperatureRange: TemperatureRange;
}

export interface UserSignals {
  // Identity (stable)
  primaryPersona?: Persona;
  secondaryPersonas?: Persona[];

  // Context (situational)
  currentOccasion?: Occasion;

  // Aesthetics (dynamic)
  selectedVibes?: Vibe[];
  colorEnergy?: ColorEnergy;

  // Preferences
  silhouette?: {
    top?: Silhouette;
    bottom?: Silhouette;
  };
  colorPreferences?: {
    favorites?: string[];
    avoid?: string[];
  };

  // Identity info
  gender?: "male" | "female" | "non-binary" | "prefer-not-to-say";
  ageRange?: string;
}

// =============================================================================
// Signal Compatibility Rules
// =============================================================================

/**
 * Defines which personas are compatible with which occasions
 */
export const PERSONA_OCCASION_COMPATIBILITY: Record<Persona, Occasion[]> = {
  casual: ["hangout", "errands", "home"],
  professional: ["work", "dinner", "formal"],
  athletic: ["active", "errands", "hangout"],
  "business-casual": ["work", "hangout", "dinner"],
  "street-style": ["hangout", "errands", "date"],
  "elevated-casual": ["work", "hangout", "dinner", "date"],
  athleisure: ["active", "errands", "home", "hangout"],
};

/**
 * Defines which vibes are compatible with which occasions
 */
export const OCCASION_VIBE_COMPATIBILITY: Record<Occasion, Vibe[]> = {
  work: ["minimal", "polished"],
  hangout: ["laid_back", "creative", "bold"],
  active: ["laid_back", "bold"],
  dinner: ["polished", "romantic", "bold"],
  errands: ["laid_back", "minimal"],
  home: ["laid_back"],
  date: ["romantic", "polished", "bold"],
  formal: ["polished", "minimal", "bold"],
};

/**
 * Check if a signal combination is valid
 */
export function isValidCombination(combo: SignalCombination): boolean {
  const validOccasions = PERSONA_OCCASION_COMPATIBILITY[combo.persona];
  const validVibes = OCCASION_VIBE_COMPATIBILITY[combo.occasion];

  return (
    validOccasions.includes(combo.occasion) && validVibes.includes(combo.vibe)
  );
}
