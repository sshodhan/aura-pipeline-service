import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runPipeline } = vi.hoisted(() => ({ runPipeline: vi.fn() }));

vi.mock("../../src/pipeline/orchestrator", () => ({ runPipeline }));
vi.mock("../../src/services/redis", () => ({ getPipelineStatus: vi.fn() }));

const TOKEN = "test-trigger-token-0123456789abcdef";

// src/utils/config.ts parses process.env at import time and calls
// process.exit(1) if required keys are missing, so env is stubbed before each
// fresh import. An empty PIPELINE_TRIGGER_TOKEN means "unset", and it also stops
// dotenv from filling the value in from a developer's local .env.
async function loadApp(env: { NODE_ENV: string; PIPELINE_TRIGGER_TOKEN: string }) {
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
  vi.stubEnv("WEATHER_API_KEY", "test-weather-key");
  vi.stubEnv("LOG_LEVEL", "error");
  vi.stubEnv("NODE_ENV", env.NODE_ENV);
  vi.stubEnv("PIPELINE_TRIGGER_TOKEN", env.PIPELINE_TRIGGER_TOKEN);

  vi.resetModules();
  const { pipelineRouter } = await import("../../src/api/routes/pipeline");

  const app = express();
  app.use("/pipeline", pipelineRouter);
  return app;
}

beforeEach(() => {
  runPipeline.mockReset();
  runPipeline.mockResolvedValue({ status: "success" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /pipeline/trigger with PIPELINE_TRIGGER_TOKEN set", () => {
  const env = { NODE_ENV: "production", PIPELINE_TRIGGER_TOKEN: TOKEN };

  it("rejects a request without an Authorization header", async () => {
    const app = await loadApp(env);

    const res = await request(app).post("/pipeline/trigger");

    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toMatch(/^Bearer/);
    expect(res.body).toEqual({ success: false, error: "Unauthorized" });
    expect(runPipeline).not.toHaveBeenCalled();
  });

  it.each([
    ["a wrong token", `Bearer ${TOKEN.slice(0, -1)}x`],
    ["a token of a different length", `Bearer ${TOKEN}extra`],
    ["the token without the Bearer scheme", TOKEN],
    ["the token under another scheme", `Basic ${TOKEN}`],
  ])("rejects %s", async (_label, authorization) => {
    const app = await loadApp(env);

    const res = await request(app)
      .post("/pipeline/trigger")
      .set("Authorization", authorization);

    expect(res.status).toBe(401);
    expect(runPipeline).not.toHaveBeenCalled();
  });

  it("starts the pipeline for a valid bearer token", async () => {
    const app = await loadApp(env);

    const res = await request(app)
      .post("/pipeline/trigger")
      .set("Authorization", `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, message: "Pipeline started" });
    expect(runPipeline).toHaveBeenCalledTimes(1);
  });
});

describe("POST /pipeline/trigger without PIPELINE_TRIGGER_TOKEN", () => {
  it("is disabled in production", async () => {
    const app = await loadApp({ NODE_ENV: "production", PIPELINE_TRIGGER_TOKEN: "" });

    const res = await request(app)
      .post("/pipeline/trigger")
      .set("Authorization", `Bearer ${TOKEN}`);

    expect(res.status).toBe(404);
    expect(runPipeline).not.toHaveBeenCalled();
  });

  it("stays open outside production for local development", async () => {
    const app = await loadApp({ NODE_ENV: "test", PIPELINE_TRIGGER_TOKEN: "" });

    const res = await request(app).post("/pipeline/trigger");

    expect(res.status).toBe(200);
    expect(runPipeline).toHaveBeenCalledTimes(1);
  });
});

describe("PIPELINE_TRIGGER_TOKEN validation", () => {
  it("refuses to start with a token shorter than 32 characters", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    await expect(
      loadApp({ NODE_ENV: "production", PIPELINE_TRIGGER_TOKEN: "too-short" })
    ).rejects.toThrow("process.exit called");
    expect(exit).toHaveBeenCalledWith(1);
  });
});
