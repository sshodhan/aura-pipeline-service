/**
 * Redis Service
 *
 * Handles all cache operations for the pipeline.
 */

import Redis from "ioredis";
import { config } from "../utils/config";
import { redisLogger as logger } from "../utils/logger";
import type {
  PrecomputedOutfitBundle,
  WeatherContext,
  StyleMatrix,
} from "../models/outfit";
import {
  buildBundleCacheKey,
  buildWeatherCacheKey,
  buildMatrixCacheKey,
} from "../models/outfit";

// =============================================================================
// Redis Client
// =============================================================================

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        logger.warn({ attempt: times, delay }, "Redis connection retry");
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    redisClient.on("connect", () => {
      logger.info("Redis connected");
    });

    redisClient.on("error", (err) => {
      logger.error({ error: err }, "Redis error");
    });

    redisClient.on("close", () => {
      logger.warn("Redis connection closed");
    });
  }

  return redisClient;
}

export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info("Redis connection closed");
  }
}

// =============================================================================
// Outfit Bundle Operations
// =============================================================================

export async function cacheOutfitBundle(
  bundle: PrecomputedOutfitBundle
): Promise<void> {
  const redis = getRedisClient();
  const key = buildBundleCacheKey(bundle.context);

  await redis.setex(
    key,
    config.cache.ttl.outfit,
    JSON.stringify(bundle)
  );

  // Add to city index
  const cityIndexKey = `aura:city:${bundle.context.cityId}:bundles`;
  await redis.sadd(cityIndexKey, key);
  await redis.expire(cityIndexKey, config.cache.ttl.outfit);

  logger.debug({ key, cityId: bundle.context.cityId }, "Cached outfit bundle");
}

export async function getOutfitBundle(
  cityId: string,
  date: string,
  persona: string,
  occasion: string,
  vibe: string,
  temperatureRange: string,
  weatherCondition: string
): Promise<PrecomputedOutfitBundle | null> {
  const redis = getRedisClient();
  const key = [
    "aura:outfit",
    cityId,
    date,
    persona,
    occasion,
    vibe,
    `${temperatureRange}_${weatherCondition}`,
  ].join(":");

  const data = await redis.get(key);
  if (!data) {
    logger.debug({ key }, "Cache miss for outfit bundle");
    return null;
  }

  logger.debug({ key }, "Cache hit for outfit bundle");
  return JSON.parse(data) as PrecomputedOutfitBundle;
}

export async function getOutfitBundleFuzzy(
  cityId: string,
  date: string,
  persona: string,
  occasion: string,
  vibe?: string
): Promise<PrecomputedOutfitBundle | null> {
  const redis = getRedisClient();

  // Try to find any matching bundle with pattern matching
  const pattern = `aura:outfit:${cityId}:${date}:${persona}:${occasion}:${vibe || "*"}:*`;
  const keys = await redis.keys(pattern);

  if (keys.length === 0) {
    logger.debug({ pattern }, "No fuzzy match found");
    return null;
  }

  // Return the first match
  const data = await redis.get(keys[0]!);
  if (!data) return null;

  logger.debug({ key: keys[0] }, "Fuzzy cache hit for outfit bundle");
  return JSON.parse(data) as PrecomputedOutfitBundle;
}

// =============================================================================
// Weather Context Operations
// =============================================================================

export async function cacheWeatherContext(
  weather: WeatherContext
): Promise<void> {
  const redis = getRedisClient();
  const key = buildWeatherCacheKey(weather.cityId, weather.date);

  await redis.setex(
    key,
    config.cache.ttl.weather,
    JSON.stringify(weather)
  );

  logger.debug({ key, cityId: weather.cityId }, "Cached weather context");
}

export async function getWeatherContext(
  cityId: string,
  date: string
): Promise<WeatherContext | null> {
  const redis = getRedisClient();
  const key = buildWeatherCacheKey(cityId, date);

  const data = await redis.get(key);
  if (!data) {
    logger.debug({ key }, "Cache miss for weather context");
    return null;
  }

  logger.debug({ key }, "Cache hit for weather context");
  return JSON.parse(data) as WeatherContext;
}

// =============================================================================
// Style Matrix Operations
// =============================================================================

export async function cacheStyleMatrix(matrix: StyleMatrix): Promise<void> {
  const redis = getRedisClient();
  const key = buildMatrixCacheKey(matrix.cityId, matrix.generatedAt.toISOString().split("T")[0]!);

  await redis.setex(
    key,
    config.cache.ttl.matrix,
    JSON.stringify(matrix)
  );

  logger.debug({ key, cityId: matrix.cityId }, "Cached style matrix");
}

export async function getStyleMatrix(
  cityId: string,
  date: string
): Promise<StyleMatrix | null> {
  const redis = getRedisClient();
  const key = buildMatrixCacheKey(cityId, date);

  const data = await redis.get(key);
  if (!data) {
    logger.debug({ key }, "Cache miss for style matrix");
    return null;
  }

  logger.debug({ key }, "Cache hit for style matrix");
  return JSON.parse(data) as StyleMatrix;
}

// =============================================================================
// Pipeline Status Operations
// =============================================================================

export interface PipelineStatus {
  runId: string;
  status: "running" | "completed" | "failed";
  stage: string;
  startedAt: Date;
  completedAt?: Date;
  citiesProcessed: number;
  bundlesGenerated: number;
  error?: string;
}

export async function setPipelineStatus(status: PipelineStatus): Promise<void> {
  const redis = getRedisClient();

  await redis.set(
    "aura:pipeline:status",
    JSON.stringify(status)
  );

  // Also store in history
  await redis.lpush(
    "aura:pipeline:history",
    JSON.stringify(status)
  );
  await redis.ltrim("aura:pipeline:history", 0, 99); // Keep last 100 runs

  logger.info({ runId: status.runId, status: status.status }, "Pipeline status updated");
}

export async function getPipelineStatus(): Promise<PipelineStatus | null> {
  const redis = getRedisClient();
  const data = await redis.get("aura:pipeline:status");
  return data ? JSON.parse(data) : null;
}

export async function getPipelineHistory(limit = 10): Promise<PipelineStatus[]> {
  const redis = getRedisClient();
  const data = await redis.lrange("aura:pipeline:history", 0, limit - 1);
  return data.map((item) => JSON.parse(item));
}

// =============================================================================
// Metrics Operations
// =============================================================================

export async function incrementCacheHit(): Promise<void> {
  const redis = getRedisClient();
  await redis.incr("aura:metrics:cache:hits");
}

export async function incrementCacheMiss(): Promise<void> {
  const redis = getRedisClient();
  await redis.incr("aura:metrics:cache:misses");
}

export async function getCacheMetrics(): Promise<{
  hits: number;
  misses: number;
  hitRate: number;
}> {
  const redis = getRedisClient();
  const [hits, misses] = await Promise.all([
    redis.get("aura:metrics:cache:hits"),
    redis.get("aura:metrics:cache:misses"),
  ]);

  const hitsNum = parseInt(hits || "0", 10);
  const missesNum = parseInt(misses || "0", 10);
  const total = hitsNum + missesNum;

  return {
    hits: hitsNum,
    misses: missesNum,
    hitRate: total > 0 ? hitsNum / total : 0,
  };
}

// =============================================================================
// Bulk Operations
// =============================================================================

export async function cacheBundlesBatch(
  bundles: PrecomputedOutfitBundle[]
): Promise<void> {
  const redis = getRedisClient();
  const pipeline = redis.pipeline();

  for (const bundle of bundles) {
    const key = buildBundleCacheKey(bundle.context);
    pipeline.setex(key, config.cache.ttl.outfit, JSON.stringify(bundle));

    // Add to city index
    const cityIndexKey = `aura:city:${bundle.context.cityId}:bundles`;
    pipeline.sadd(cityIndexKey, key);
    pipeline.expire(cityIndexKey, config.cache.ttl.outfit);
  }

  await pipeline.exec();
  logger.info({ count: bundles.length }, "Cached bundle batch");
}

export async function getCityBundleCount(cityId: string): Promise<number> {
  const redis = getRedisClient();
  const cityIndexKey = `aura:city:${cityId}:bundles`;
  return redis.scard(cityIndexKey);
}

export async function clearCityCache(cityId: string): Promise<number> {
  const redis = getRedisClient();
  const cityIndexKey = `aura:city:${cityId}:bundles`;

  // Get all bundle keys for this city
  const bundleKeys = await redis.smembers(cityIndexKey);

  if (bundleKeys.length === 0) return 0;

  // Delete all bundles and the index
  const pipeline = redis.pipeline();
  for (const key of bundleKeys) {
    pipeline.del(key);
  }
  pipeline.del(cityIndexKey);

  await pipeline.exec();
  logger.info({ cityId, count: bundleKeys.length }, "Cleared city cache");

  return bundleKeys.length;
}

// =============================================================================
// Health Check
// =============================================================================

export async function checkRedisHealth(): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const pong = await redis.ping();
    return pong === "PONG";
  } catch (error) {
    logger.error({ error }, "Redis health check failed");
    return false;
  }
}
