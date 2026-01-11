import pino from "pino";
import { config } from "./config";

// Create pino logger instance
export const logger = pino({
  level: config.logging.level,
  transport: config.isDevelopment
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
    env: config.env,
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
