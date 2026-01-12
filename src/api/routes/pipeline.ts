/**
 * Pipeline API Routes
 *
 * Endpoints for triggering and monitoring the pipeline.
 */

import { Router } from "express";

import { runPipeline } from "../../pipeline/orchestrator";
import { getPipelineStatus } from "../../services/redis";
import { apiLogger as logger } from "../../utils/logger";

export const pipelineRouter = Router();

// Track if pipeline is currently running
let isPipelineRunning = false;

// =============================================================================
// POST /pipeline/trigger
// =============================================================================

pipelineRouter.post("/trigger", async (_req, res) => {
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
