/**
 * Health API Routes
 *
 * Health check endpoints for Cloud Run and monitoring.
 */

import { Router } from "express";

import { checkRedisHealth, getPipelineStatus, getCacheMetrics } from "../../services/redis";
import { testConnection as testGeminiConnection } from "../../services/gemini";

export const healthRouter = Router();

// =============================================================================
// GET /health
// =============================================================================

healthRouter.get("/health", async (_req, res) => {
  const redisHealthy = await checkRedisHealth();

  if (redisHealthy) {
    return res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        redis: "up",
      },
    });
  }

  return res.status(503).json({
    status: "unhealthy",
    timestamp: new Date().toISOString(),
    services: {
      redis: "down",
    },
  });
});

// =============================================================================
// GET /health/ready
// =============================================================================

healthRouter.get("/health/ready", async (_req, res) => {
  const redisHealthy = await checkRedisHealth();

  if (redisHealthy) {
    return res.json({
      status: "ready",
      timestamp: new Date().toISOString(),
    });
  }

  return res.status(503).json({
    status: "not ready",
    timestamp: new Date().toISOString(),
    reason: "Redis not available",
  });
});

// =============================================================================
// GET /health/live
// =============================================================================

healthRouter.get("/health/live", (_req, res) => {
  return res.json({
    status: "alive",
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// GET /health/detailed
// =============================================================================

healthRouter.get("/health/detailed", async (_req, res) => {
  const [redisHealthy, pipelineStatus, cacheMetrics, geminiHealthy] = await Promise.all([
    checkRedisHealth(),
    getPipelineStatus(),
    getCacheMetrics(),
    testGeminiConnection().catch(() => false),
  ]);

  const allHealthy = redisHealthy && geminiHealthy;

  return res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    services: {
      redis: redisHealthy ? "up" : "down",
      gemini: geminiHealthy ? "up" : "down",
    },
    pipeline: pipelineStatus
      ? {
          lastRunId: pipelineStatus.runId,
          lastStatus: pipelineStatus.status,
          lastStage: pipelineStatus.stage,
          citiesProcessed: pipelineStatus.citiesProcessed,
          bundlesGenerated: pipelineStatus.bundlesGenerated,
        }
      : null,
    cache: {
      hits: cacheMetrics.hits,
      misses: cacheMetrics.misses,
      hitRate: `${(cacheMetrics.hitRate * 100).toFixed(1)}%`,
    },
  });
});

// =============================================================================
// GET /status
// =============================================================================

healthRouter.get("/status", async (_req, res) => {
  const [pipelineStatus, cacheMetrics] = await Promise.all([
    getPipelineStatus(),
    getCacheMetrics(),
  ]);

  return res.json({
    service: "aura-pipeline-service",
    version: process.env.npm_package_version || "1.0.0",
    timestamp: new Date().toISOString(),
    pipeline: pipelineStatus,
    cache: cacheMetrics,
  });
});
