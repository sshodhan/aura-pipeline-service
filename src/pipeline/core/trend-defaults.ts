/**
 * Seasonal Trend Defaults (pipeline core)
 *
 * The hard-coded seasonal "trend signals" stage 1 uses in place of trend
 * research. Moved unchanged from stages/1-data-collection.ts so they can be
 * computed without API keys. Northern-hemisphere seasons by calendar month.
 */

import type { TrendSignals } from "../stages/1-data-collection";

export function getSeason(month: number): string {
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "fall";
  return "winter";
}

export function getSeasonalTrendDefaults(month: number): { season: string; trends: TrendSignals } {
  const season = getSeason(month);

  const trendsBySeasons: Record<string, TrendSignals> = {
    winter: {
      hotColors: ["burgundy", "forest green", "navy", "cream"],
      emergingStyles: ["quiet luxury", "layered knits", "statement coats"],
      seasonalThemes: ["cozy elegance", "holiday glam", "winter whites"],
    },
    spring: {
      hotColors: ["sage green", "lavender", "butter yellow", "soft pink"],
      emergingStyles: ["light layers", "transitional dressing", "floral prints"],
      seasonalThemes: ["fresh starts", "garden party", "pastel minimalism"],
    },
    summer: {
      hotColors: ["coral", "turquoise", "white", "sunshine yellow"],
      emergingStyles: ["linen everything", "vacation mode", "bold prints"],
      seasonalThemes: ["coastal chic", "effortless summer", "tropical vibes"],
    },
    fall: {
      hotColors: ["rust", "olive", "camel", "chocolate brown"],
      emergingStyles: ["oversized blazers", "leather accents", "rich textures"],
      seasonalThemes: ["cozy layers", "earthy tones", "sophisticated casual"],
    },
  };

  return { season, trends: trendsBySeasons[season] || trendsBySeasons.fall! };
}
