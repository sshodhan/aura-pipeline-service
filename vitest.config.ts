import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    env: {
      // Keep pino quiet; tests assert on return values, not log lines.
      LOG_LEVEL: "silent",
    },
  },
});
