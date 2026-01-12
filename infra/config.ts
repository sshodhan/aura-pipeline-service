import * as pulumi from "@pulumi/pulumi";

// Load stack-specific configuration
const config = new pulumi.Config();
const gcpConfig = new pulumi.Config("gcp");

// Environment
export const environment = pulumi.getStack(); // "dev" | "staging" | "prod"
export const isProduction = environment === "prod";

// GCP Settings
export const gcpProject = gcpConfig.require("project");
export const gcpRegion = gcpConfig.get("region") || "us-central1";

// Application Settings
export const appName = "aura-pipeline";

// Pipeline Settings
export const pipelineConfig = {
  // Schedule: Daily at 2 AM UTC
  schedule: config.get("pipelineSchedule") || "0 2 * * *",

  // Timeout: 4 hours max
  timeout: config.getNumber("pipelineTimeout") || 14400,

  // Resources
  cpu: config.get("pipelineCpu") || (isProduction ? "2" : "1"),
  memory: config.get("pipelineMemory") || (isProduction ? "4Gi" : "2Gi"),

  // Concurrency
  maxInstances: config.getNumber("maxInstances") || (isProduction ? 10 : 2),
};

// API Server Settings
export const apiConfig = {
  cpu: config.get("apiCpu") || "1",
  memory: config.get("apiMemory") || "512Mi",
  minInstances: isProduction ? 1 : 0, // Keep warm in prod
  maxInstances: config.getNumber("apiMaxInstances") || (isProduction ? 10 : 2),
  concurrency: 80,
};

// Redis Settings
export const redisConfig = {
  tier: (isProduction ? "STANDARD_HA" : "BASIC") as "BASIC" | "STANDARD_HA",
  memorySizeGb: config.getNumber("redisMemory") || (isProduction ? 2 : 1),
  version: "REDIS_7_0",
};

// City Configuration
export const cities = [
  { id: "new-york-ny", tier: 1, combinations: 500 },
  { id: "los-angeles-ca", tier: 1, combinations: 500 },
  { id: "chicago-il", tier: 1, combinations: 400 },
  { id: "miami-fl", tier: 2, combinations: 350 },
  { id: "san-francisco-ca", tier: 2, combinations: 350 },
  { id: "seattle-wa", tier: 2, combinations: 300 },
  { id: "austin-tx", tier: 2, combinations: 300 },
  { id: "boston-ma", tier: 2, combinations: 300 },
  { id: "denver-co", tier: 3, combinations: 250 },
  { id: "nashville-tn", tier: 3, combinations: 250 },
  { id: "atlanta-ga", tier: 3, combinations: 250 },
  { id: "portland-or", tier: 3, combinations: 200 },
];

// Monitoring Settings
export const alertConfig = {
  notificationEmail: config.get("alertEmail") || "",
  slackWebhook: config.getSecret("slackWebhook"),

  // Thresholds
  pipelineFailureThreshold: 1,
  cacheHitRateThreshold: 0.7,
  latencyThresholdMs: 500,
};
