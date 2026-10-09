/**
 * Pipeline API Routes
 *
 * Endpoints for triggering and monitoring the pipeline.
 */

import { createHash, timingSafeEqual } from "crypto";
import { Router, type RequestHandler } from "express";

import { runPipeline } from "../../pipeline/orchestrator";
import { getPipelineStatus } from "../../services/redis";
import { config } from "../../utils/config";
import { apiLogger as logger } from "../../utils/logger";

export const pipelineRouter = Router();

// Track if pipeline is currently running
let isPipelineRunning = false;

// =============================================================================
// Trigger authentication
// =============================================================================

// Hash both sides first so timingSafeEqual gets equal-length inputs and the
// comparison doesn't leak the expected token's length.
function tokensMatch(provided: string, expected: string): boolean {
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

// Each run makes thousands of Gemini calls, so the trigger requires
// "Authorization: Bearer <PIPELINE_TRIGGER_TOKEN>". Without a configured token
// the route is disabled in production and left open for local development.
const requireTriggerToken: RequestHandler = (req, res, next) => {
  const expectedToken = config.pipeline.triggerToken;

  if (!expectedToken) {
    if (config.isProduction) {
      logger.warn("Pipeline trigger rejected: PIPELINE_TRIGGER_TOKEN is not set");
      return res.status(404).json({
        error: "Not Found",
        message: "The requested endpoint does not exist",
      });
    }
    return next();
  }

  const match = /^Bearer\s+(.+)$/i.exec(req.get("authorization") ?? "");
  const providedToken = match?.[1];

  if (!providedToken || !tokensMatch(providedToken, expectedToken)) {
    logger.warn("Pipeline trigger rejected: missing or invalid bearer token");
    res.set("WWW-Authenticate", 'Bearer realm="pipeline"');
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
    });
  }

  return next();
};

// =============================================================================
// POST /pipeline/trigger
// =============================================================================

pipelineRouter.post("/trigger", requireTriggerToken, async (_req, res) => {
  if (isPipelineRunning) {
    return res.status(409).json({
      success: false,
      error: "Pipeline is already running",
      message: "Please wait for the current run to complete",
    });
  }

  try {
    isPipelineRunning = true;
    logger.info("Pipeline triggered via API");

    // Run pipeline in background
    runPipeline()
      .then((result) => {
        logger.info({ result }, "Pipeline completed");
        isPipelineRunning = false;
      })
      .catch((error) => {
        logger.error({ error: error.message }, "Pipeline failed");
        isPipelineRunning = false;
      });

    return res.json({
      success: true,
      message: "Pipeline started",
      note: "Check /pipeline/status for progress",
    });
  } catch (error) {
    isPipelineRunning = false;
    logger.error({ error }, "Failed to start pipeline");

    return res.status(500).json({
      success: false,
      error: "Failed to start pipeline",
    });
  }
});

// =============================================================================
// GET /pipeline/status
// =============================================================================

pipelineRouter.get("/status", async (_req, res) => {
  try {
    const status = await getPipelineStatus();

    return res.json({
      success: true,
      isRunning: isPipelineRunning,
      status: status || { message: "No pipeline runs recorded yet" },
    });
  } catch (error) {
    logger.error({ error }, "Failed to get pipeline status");

    return res.status(500).json({
      success: false,
      error: "Failed to get pipeline status",
    });
  }
});
