import { z } from "zod";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Environment schema validation
const envSchema = z.object({
  // Node environment
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Server
  PORT: z.string().default("8080"),
  HOST: z.string().default("0.0.0.0"),

  // Redis
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.string().default("6379"),
  REDIS_PASSWORD: z.string().optional(),

  // External APIs
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  WEATHER_API_KEY: z.string().min(1, "WEATHER_API_KEY is required"),

  // Pipeline
  PIPELINE_MODE: z
    .enum(["full", "weather-only", "single-city"])
    .default("full"),
  PIPELINE_CITY: z.string().optional(), // For single-city mode

  // Logging
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Cities configuration (JSON string)
  CITIES_CONFIG: z.string().optional(),
});

// Parse and validate environment
const parseEnv = () => {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("❌ Invalid environment variables:");
    console.error(parsed.error.format());
    process.exit(1);
  }

  return parsed.data;
};

const env = parseEnv();

// Export typed configuration
export const config = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  isDevelopment: env.NODE_ENV === "development",

  server: {
    port: parseInt(env.PORT, 10),
    host: env.HOST,
  },

  redis: {
    host: env.REDIS_HOST,
    port: parseInt(env.REDIS_PORT, 10),
    password: env.REDIS_PASSWORD,
    url: env.REDIS_PASSWORD
      ? `redis://:${env.REDIS_PASSWORD}@${env.REDIS_HOST}:${env.REDIS_PORT}`
      : `redis://${env.REDIS_HOST}:${env.REDIS_PORT}`,
  },

  gemini: {
    apiKey: env.GEMINI_API_KEY,
    model: "gemini-1.5-flash",
  },

  weather: {
    apiKey: env.WEATHER_API_KEY,
    baseUrl: "https://api.openweathermap.org/data/2.5",
  },

  pipeline: {
    mode: env.PIPELINE_MODE,
    singleCity: env.PIPELINE_CITY,
    batchSize: 10, // Process 10 combinations at a time
    maxRetries: 3,
    retryDelay: 1000, // 1 second
    timeoutPerStage: {
      dataCollection: 5 * 60 * 1000, // 5 minutes
      signalAggregation: 10 * 60 * 1000, // 10 minutes
      styleMatrix: 30 * 60 * 1000, // 30 minutes
      outfitGeneration: 3 * 60 * 60 * 1000, // 3 hours
      qualityScoring: 15 * 60 * 1000, // 15 minutes
      cachePopulation: 10 * 60 * 1000, // 10 minutes
    },
  },

  cache: {
    ttl: {
      outfit: 24 * 60 * 60, // 24 hours
      weather: 6 * 60 * 60, // 6 hours
      matrix: 24 * 60 * 60, // 24 hours
      trends: 7 * 24 * 60 * 60, // 7 days
    },
    keyPrefix: "aura",
  },

  logging: {
    level: env.LOG_LEVEL,
  },

  // Parse cities config if provided
  cities: env.CITIES_CONFIG ? JSON.parse(env.CITIES_CONFIG) : null,
} as const;

export type Config = typeof config;
