/**
 * Data Module Barrel Export
 *
 * Central export for all data modules used by V2 API.
 * These modules provide static data that enriches API responses.
 */

// =============================================================================
// Signal Guidance
// =============================================================================

export {
  // Types
  type PersonaGuidance,
  type OccasionGuidance,
  type VibeGuidance,
  type ColorEnergyGuidance,
  type SilhouetteGuidance,
  // Data
  PERSONA_GUIDANCE,
  OCCASION_GUIDANCE,
  VIBE_GUIDANCE,
  COLOR_ENERGY_GUIDANCE,
  SILHOUETTE_GUIDANCE,
  // Functions
  getSignalGuidance,
  getAllSignals,
  getCompatibilityRules,
  validateSignalGuidance,
} from "./signal-guidance";

// =============================================================================
// Seasonal Trends
// =============================================================================

export {
  // Types
  type Season,
  type TrendingColor,
  type SeasonalTrend,
  type SeasonalContext,
  // Functions
  getCurrentSeason,
  getSeasonalContext,
  getSeasonData,
  getUpcomingSeason,
  getAvailableSeasons,
  validateMaterials,
  getStylingTips,
  getKeyPieces,
} from "./seasonal-trends";

// =============================================================================
// Hero Images
// =============================================================================

export {
  // Types
  type HeroImage,
  type HeroImageMapping,
  // Functions
  getHeroImageUrl,
  getHeroImageByArchetype,
  generateAllImageMappings,
  getHeroImageCount,
  generateImagePrompt,
  validateHeroImageUrl,
  getHeroImageBaseUrl,
} from "./hero-images";
