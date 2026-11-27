import "dotenv/config";
import pino from "pino";

// Logging reads its two settings straight from the environment instead of
// importing ./config, so modules that only log can be loaded without the API
// keys config requires (e.g. by the Phase 0 fixture runner). Defaults match
// ./config; entry points still validate the full environment via config.
const nodeEnv = process.env.NODE_ENV ?? "development";
const logLevel = process.env.LOG_LEVEL ?? "info";

// Create pino logger instance
export const logger = pino({
  level: logLevel,
  transport: nodeEnv === "development"
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  base: {
    service: "aura-pipeline",
    env: nodeEnv,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
});

// Create child loggers for different components
export const createLogger = (component: string) => {
  return logger.child({ component });
};

// Pre-configured loggers for main components
export const pipelineLogger = createLogger("pipeline");
export const apiLogger = createLogger("api");
export const redisLogger = createLogger("redis");
export const weatherLogger = createLogger("weather");
export const geminiLogger = createLogger("gemini");

// Utility for timing operations
export const withTiming = async <T>(
  operation: string,
  fn: () => Promise<T>,
  log = logger
): Promise<T> => {
  const start = Date.now();
  log.info({ operation }, `Starting ${operation}`);

  try {
    const result = await fn();
    const duration = Date.now() - start;
    log.info({ operation, durationMs: duration }, `Completed ${operation}`);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    log.error(
      { operation, durationMs: duration, error },
      `Failed ${operation}`
    );
    throw error;
  }
};

export default logger;
