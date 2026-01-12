/**
 * API Server
 *
 * Express server that serves cached outfit recommendations.
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { config } from "../utils/config";
import { apiLogger as logger } from "../utils/logger";
import { closeRedisConnection } from "../services/redis";

// Import routes
import { outfitsRouter } from "./routes/outfits";
import { citiesRouter } from "./routes/cities";
import { healthRouter } from "./routes/health";
import { pipelineRouter } from "./routes/pipeline";

// =============================================================================
// Express App Setup
// =============================================================================

const app = express();

// Security middleware
app.use(helmet());

// CORS
app.use(
  cors({
    origin: config.isProduction
      ? [
          "https://your-frontend-domain.com",
          "https://your-frontend-domain.vercel.app",
        ]
      : "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Request logging
app.use(
  morgan("combined", {
    stream: {
      write: (message: string) => logger.info(message.trim()),
    },
  })
);

// Body parsing
app.use(express.json());

// =============================================================================
// Routes
// =============================================================================

// Health check (root level)
app.use("/", healthRouter);

// API routes
app.use("/outfits", outfitsRouter);
app.use("/cities", citiesRouter);
app.use("/pipeline", pipelineRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: "The requested endpoint does not exist",
  });
});

// Error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    logger.error({ error: err.message, stack: err.stack }, "Unhandled error");

    res.status(500).json({
      error: "Internal Server Error",
      message: config.isProduction ? "An unexpected error occurred" : err.message,
    });
  }
);

// =============================================================================
// Server Startup
// =============================================================================

const server = app.listen(config.server.port, config.server.host, () => {
  logger.info(
    { port: config.server.port, host: config.server.host, env: config.env },
    "API server started"
  );
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info({ signal }, "Shutdown signal received");

  server.close(async () => {
    logger.info("HTTP server closed");

    await closeRedisConnection();

    logger.info("Graceful shutdown complete");
    process.exit(0);
  });

  // Force exit after 30 seconds
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 30000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export { app };
