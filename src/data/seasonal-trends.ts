/**
 * Seasonal Trends Data Module
 *
 * Provides curated seasonal fashion intelligence including:
 * - Trending colors and themes
 * - Key silhouettes for the season
 * - Recommended and avoid materials
 *
 * This data is HARDCODED and should be updated quarterly based on:
 * - Fashion industry trend reports (Vogue, Harper's Bazaar)
 * - Runway analysis from Fashion Weeks
 * - Style forecasting services
 *
 * Update Schedule:
 * - Spring: Late February
 * - Summer: Late May
 * - Fall: Late August
 * - Winter: Late November
 */

// =============================================================================
// Type Definitions
// =============================================================================

export type Season = "spring" | "summer" | "fall" | "winter";

export interface TrendingColor {
  name: string;
  hex: string;
  popularity: number; // 0-1 scale
  pairedWith?: string[]; // Complementary colors
}

export interface SeasonalTrend {
  season: Season;
  year: string;
  dateRange: {
    start: string; // YYYY-MM-DD
    end: string;
  };
  themes: string[];
  trendingColors: TrendingColor[];
  keySilhouettes: string[];
  keyPieces: string[];
  inSeasonMaterials: string[];
  avoidMaterials: string[];
  stylingTips: string[];
}

export interface SeasonalContext {
  season: string; // Formatted: "Winter 2025-2026"
  themes: string[];
  trendingColors: Array<{ name: string; hex: string }>;
  keySilhouettes: string[];
  inSeasonMaterials: string[];
  avoidMaterials?: string[];
}

// =============================================================================
// Winter 2025-2026
// =============================================================================

const WINTER_2025_2026: SeasonalTrend = {
  season: "winter",
  year: "2025-2026",
  dateRange: {
    start: "2025-12-01",
    end: "2026-02-28",
  },
  themes: [
    "Quiet luxury continues",
    "Cozy maximalism",
    "Old money aesthetic",
    "Elevated basics",
    "Dopamine dressing",
  ],
  trendingColors: [
    {
      name: "Chocolate Brown",
      hex: "#8B4513",
      popularity: 0.95,
      pairedWith: ["cream", "camel", "burgundy"],
    },
    {
      name: "Deep Teal",
      hex: "#2F4F4F",
      popularity: 0.88,
      pairedWith: ["gold", "cream", "charcoal"],
    },
    {
      name: "Burgundy",
      hex: "#800020",
      popularity: 0.85,
      pairedWith: ["navy", "cream", "black"],
    },
    {
      name: "Camel",
      hex: "#C19A6B",
      popularity: 0.82,
      pairedWith: ["white", "black", "navy"],
    },
    {
      name: "Forest Green",
      hex: "#228B22",
      popularity: 0.78,
      pairedWith: ["cream", "tan", "burgundy"],
    },
    {
      name: "Slate Gray",
      hex: "#708090",
      popularity: 0.75,
      pairedWith: ["white", "black", "burgundy"],
    },
    {
      name: "Butter Yellow",
      hex: "#FFFACD",
      popularity: 0.70,
      pairedWith: ["navy", "gray", "black"],
    },
    {
      name: "Cherry Red",
      hex: "#DE3163",
      popularity: 0.68,
      pairedWith: ["black", "cream", "navy"],
    },
  ],
  keySilhouettes: [
    "Oversized coats and blazers",
    "Wide-leg trousers",
    "Chunky knit sweaters",
    "Layered looks",
    "Maxi skirts and dresses",
    "Tailored suiting",
  ],
  keyPieces: [
    "Cashmere turtleneck",
    "Wool overcoat",
    "Wide-leg wool trousers",
    "Leather boots (knee-high or ankle)",
    "Structured blazer",
    "Chunky cardigan",
    "Silk scarf",
    "Leather gloves",
  ],
  inSeasonMaterials: [
    "Cashmere",
    "Wool (heavyweight)",
    "Corduroy",
    "Velvet",
    "Leather",
    "Suede",
    "Shearling",
    "Merino wool",
    "Fleece",
    "Tweed",
  ],
  avoidMaterials: [
    "Linen",
    "Seersucker",
    "Lightweight cotton",
    "Rayon (unlined)",
    "Thin jersey",
  ],
  stylingTips: [
    "Layer strategically with thin base layers",
    "Invest in quality outerwear as the statement piece",
    "Mix textures: cashmere with leather, velvet with wool",
    "Chocolate brown is the new black this season",
    "Add color through accessories if wearing neutrals",
  ],
};

// =============================================================================
// Spring 2026 (Preview)
// =============================================================================

const SPRING_2026: SeasonalTrend = {
  season: "spring",
  year: "2026",
  dateRange: {
    start: "2026-03-01",
    end: "2026-05-31",
  },
  themes: [
    "Soft minimalism",
    "Garden party elegance",
    "Relaxed tailoring",
    "Sustainable fashion forward",
  ],
  trendingColors: [
    {
      name: "Lavender",
      hex: "#E6E6FA",
      popularity: 0.90,
      pairedWith: ["white", "soft gray", "cream"],
    },
    {
      name: "Soft Sage",
      hex: "#9DC183",
      popularity: 0.85,
      pairedWith: ["white", "cream", "tan"],
    },
    {
      name: "Butter Cream",
      hex: "#FFFDD0",
      popularity: 0.82,
      pairedWith: ["navy", "brown", "sage"],
    },
    {
      name: "Sky Blue",
      hex: "#87CEEB",
      popularity: 0.78,
      pairedWith: ["white", "cream", "tan"],
    },
    {
      name: "Soft Coral",
      hex: "#F88379",
      popularity: 0.75,
      pairedWith: ["white", "cream", "navy"],
    },
  ],
  keySilhouettes: [
    "Relaxed blazers",
    "Wide-leg linen pants",
    "Midi dresses",
    "Cropped trousers",
    "Flowy blouses",
  ],
  keyPieces: [
    "Lightweight trench coat",
    "Cotton button-down",
    "Wide-leg pants",
    "Midi skirt",
    "Light knit cardigan",
    "Ballet flats",
  ],
  inSeasonMaterials: [
    "Linen",
    "Cotton",
    "Silk",
    "Light wool",
    "Chambray",
    "Poplin",
  ],
  avoidMaterials: [
    "Heavy wool",
    "Shearling",
    "Velvet",
    "Heavy corduroy",
  ],
  stylingTips: [
    "Embrace soft, washed-out colors",
    "Layer light pieces for unpredictable weather",
    "Mix textures: cotton with silk, linen with light knits",
  ],
};

// =============================================================================
// Summer 2026 (Placeholder)
// =============================================================================

const SUMMER_2026: SeasonalTrend = {
  season: "summer",
  year: "2026",
  dateRange: {
    start: "2026-06-01",
    end: "2026-08-31",
  },
  themes: [
    "Coastal elegance",
    "Effortless sophistication",
    "Vacation mode",
  ],
  trendingColors: [
    { name: "Ocean Blue", hex: "#0077BE", popularity: 0.88 },
    { name: "Sand", hex: "#C2B280", popularity: 0.85 },
    { name: "Coral", hex: "#FF7F50", popularity: 0.80 },
    { name: "White", hex: "#FFFFFF", popularity: 0.95 },
    { name: "Navy", hex: "#000080", popularity: 0.82 },
  ],
  keySilhouettes: [
    "Relaxed linen suits",
    "Flowing maxi dresses",
    "Wide-leg shorts",
    "Breezy blouses",
  ],
  keyPieces: [
    "Linen shirt",
    "White jeans",
    "Maxi dress",
    "Espadrilles",
    "Straw hat",
  ],
  inSeasonMaterials: [
    "Linen",
    "Cotton",
    "Silk",
    "Seersucker",
    "Chambray",
  ],
  avoidMaterials: [
    "Wool",
    "Velvet",
    "Leather",
    "Heavy denim",
  ],
  stylingTips: [
    "Keep it light and breathable",
    "Embrace natural fabrics",
    "Accessorize with straw and raffia",
  ],
};

// =============================================================================
// Fall 2026 (Placeholder)
// =============================================================================

const FALL_2026: SeasonalTrend = {
  season: "fall",
  year: "2026",
  dateRange: {
    start: "2026-09-01",
    end: "2026-11-30",
  },
  themes: [
    "Rich textures",
    "Layered sophistication",
    "Warm earth tones",
  ],
  trendingColors: [
    { name: "Burnt Orange", hex: "#CC5500", popularity: 0.88 },
    { name: "Deep Olive", hex: "#556B2F", popularity: 0.85 },
    { name: "Maroon", hex: "#800000", popularity: 0.82 },
    { name: "Mustard", hex: "#FFDB58", popularity: 0.78 },
    { name: "Charcoal", hex: "#36454F", popularity: 0.90 },
  ],
  keySilhouettes: [
    "Structured blazers",
    "Layered looks",
    "Midi skirts",
    "Tailored trousers",
  ],
  keyPieces: [
    "Trench coat",
    "Wool blazer",
    "Cashmere sweater",
    "Ankle boots",
    "Structured bag",
  ],
  inSeasonMaterials: [
    "Wool",
    "Cashmere",
    "Corduroy",
    "Tweed",
    "Suede",
    "Leather",
  ],
  avoidMaterials: [
    "Thin linen",
    "Seersucker",
    "Lightweight cotton only",
  ],
  stylingTips: [
    "Layer with intention",
    "Mix warm and cool tones",
    "Invest in transitional pieces",
  ],
};

// =============================================================================
// Season Registry
// =============================================================================

const SEASONAL_TRENDS: Record<string, SeasonalTrend> = {
  "winter-2025-2026": WINTER_2025_2026,
  "spring-2026": SPRING_2026,
  "summer-2026": SUMMER_2026,
  "fall-2026": FALL_2026,
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Determine the current season based on date
 */
function getSeasonFromDate(date: Date): { season: Season; year: string } {
  const month = date.getMonth() + 1; // 1-12
  const year = date.getFullYear();

  if (month >= 3 && month <= 5) {
    return { season: "spring", year: String(year) };
  } else if (month >= 6 && month <= 8) {
    return { season: "summer", year: String(year) };
  } else if (month >= 9 && month <= 11) {
    return { season: "fall", year: String(year) };
  } else {
    // Winter spans two years (Dec-Feb)
    const winterYear =
      month === 12 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
    return { season: "winter", year: winterYear };
  }
}

/**
 * Get the current season's trend data
 */
export function getCurrentSeason(): SeasonalTrend {
  const now = new Date();
  const { season, year } = getSeasonFromDate(now);
  const key = `${season}-${year}`;

  // Return matching season or fall back to winter 2025-2026
  return SEASONAL_TRENDS[key] || WINTER_2025_2026;
}

/**
 * Get seasonal context formatted for API response
 */
export function getSeasonalContext(): SeasonalContext {
  const current = getCurrentSeason();

  // Format season name nicely
  const seasonName =
    current.season.charAt(0).toUpperCase() + current.season.slice(1);
  const formattedSeason = `${seasonName} ${current.year}`;

  return {
    season: formattedSeason,
    themes: current.themes,
    trendingColors: current.trendingColors.map((c) => ({
      name: c.name,
      hex: c.hex,
    })),
    keySilhouettes: current.keySilhouettes,
    inSeasonMaterials: current.inSeasonMaterials,
    avoidMaterials: current.avoidMaterials,
  };
}

/**
 * Get a specific season's data
 */
export function getSeasonData(
  season: Season,
  year: string
): SeasonalTrend | null {
  const key = `${season}-${year}`;
  return SEASONAL_TRENDS[key] || null;
}

/**
 * Get upcoming season preview
 */
export function getUpcomingSeason(): {
  season: string;
  year: string;
  previewAvailable: boolean;
} {
  const current = getCurrentSeason();
  const seasonOrder: Season[] = ["winter", "spring", "summer", "fall"];
  const currentIndex = seasonOrder.indexOf(current.season);
  const nextSeasonIndex = (currentIndex + 1) % 4;
  const nextSeason: Season = seasonOrder[nextSeasonIndex] ?? "spring";

  // Calculate next year
  let nextYear: string;
  if (current.season === "fall") {
    // Next is winter, spans two years
    const baseYear = parseInt(current.year);
    nextYear = `${baseYear}-${baseYear + 1}`;
  } else if (current.season === "winter") {
    // Next is spring of the ending year
    const endYear = current.year.split("-")[1] || current.year;
    nextYear = endYear;
  } else {
    nextYear = current.year;
  }

  const key = `${nextSeason}-${nextYear}`;
  const previewAvailable = !!SEASONAL_TRENDS[key];

  return {
    season: nextSeason.charAt(0).toUpperCase() + nextSeason.slice(1),
    year: nextYear,
    previewAvailable,
  };
}

/**
 * Get all available seasons
 */
export function getAvailableSeasons(): string[] {
  return Object.keys(SEASONAL_TRENDS);
}

/**
 * Check if materials are appropriate for current season
 */
export function validateMaterials(materials: string[]): {
  appropriate: string[];
  inappropriate: string[];
} {
  const current = getCurrentSeason();
  const inSeason = current.inSeasonMaterials.map((m) => m.toLowerCase());
  const avoid = current.avoidMaterials.map((m) => m.toLowerCase());

  const appropriate: string[] = [];
  const inappropriate: string[] = [];

  for (const material of materials) {
    const lowerMaterial = material.toLowerCase();
    if (avoid.some((a) => lowerMaterial.includes(a))) {
      inappropriate.push(material);
    } else if (inSeason.some((s) => lowerMaterial.includes(s))) {
      appropriate.push(material);
    } else {
      // Neutral - not explicitly in or out
      appropriate.push(material);
    }
  }

  return { appropriate, inappropriate };
}

/**
 * Get styling tips for current season
 */
export function getStylingTips(): string[] {
  return getCurrentSeason().stylingTips;
}

/**
 * Get key pieces for current season
 */
export function getKeyPieces(): string[] {
  return getCurrentSeason().keyPieces;
}
