import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

import * as config from "./config";
import { createNetworking } from "./components/networking";
import { createSecrets } from "./components/secrets";
import { createRedis } from "./components/redis";
import { createCloudRunApi, createCloudRunPipeline } from "./components/cloud-run";
import { createScheduler } from "./components/scheduler";
import { createMonitoring } from "./components/monitoring";

// =============================================================================
// AURA Pipeline Infrastructure
// =============================================================================

// Enable required APIs
const enabledApis = [
  "run.googleapis.com",
  "cloudscheduler.googleapis.com",
  "secretmanager.googleapis.com",
  "redis.googleapis.com",
  "vpcaccess.googleapis.com",
  "artifactregistry.googleapis.com",
  "cloudbuild.googleapis.com",
  "monitoring.googleapis.com",
  "servicenetworking.googleapis.com",
].map(
  (api) =>
    new gcp.projects.Service(`enable-${api.split(".")[0]}`, {
      service: api,
      disableOnDestroy: false,
    })
);

// Wait for APIs to be enabled
const apisReady = pulumi.all(enabledApis.map((api) => api.service));

// -----------------------------------------------------------------------------
// 1. Networking (VPC for Redis connectivity)
// -----------------------------------------------------------------------------
const networking = createNetworking({
  name: config.appName,
  region: config.gcpRegion,
  dependsOn: enabledApis,
});

// -----------------------------------------------------------------------------
// 2. Secret Manager (API keys, credentials)
// -----------------------------------------------------------------------------
const secrets = createSecrets({
  name: config.appName,
  dependsOn: enabledApis,
});

// -----------------------------------------------------------------------------
// 3. Redis Cache (Memorystore)
// -----------------------------------------------------------------------------
const redis = createRedis({
  name: config.appName,
  region: config.gcpRegion,
  network: networking.network,
  config: config.redisConfig,
  dependsOn: [networking.network, networking.privateConnection, ...enabledApis],
});

// -----------------------------------------------------------------------------
// 4. Artifact Registry (Docker images)
// -----------------------------------------------------------------------------
const artifactRegistry = new gcp.artifactregistry.Repository(
  `${config.appName}-repo`,
  {
    repositoryId: `${config.appName}-images`,
    location: config.gcpRegion,
    format: "DOCKER",
    description: "Docker images for AURA Pipeline Service",
  },
  { dependsOn: enabledApis }
);

// -----------------------------------------------------------------------------
// 5. Cloud Run - API Service (serves cached outfits)
// -----------------------------------------------------------------------------
const apiService = createCloudRunApi({
  name: `${config.appName}-api`,
  region: config.gcpRegion,
  config: config.apiConfig,
  redisHost: redis.host,
  redisPort: redis.port,
  vpcConnector: networking.vpcConnector,
  secrets: secrets,
  repository: artifactRegistry,
  dependsOn: [redis.instance, networking.vpcConnector, ...enabledApis],
});

// -----------------------------------------------------------------------------
// 6. Cloud Run - Pipeline Job (daily batch processing)
// -----------------------------------------------------------------------------
const pipelineJob = createCloudRunPipeline({
  name: `${config.appName}-pipeline`,
  region: config.gcpRegion,
  config: config.pipelineConfig,
  redisHost: redis.host,
  redisPort: redis.port,
  vpcConnector: networking.vpcConnector,
  secrets: secrets,
  repository: artifactRegistry,
  dependsOn: [redis.instance, networking.vpcConnector, ...enabledApis],
});

// -----------------------------------------------------------------------------
// 7. Cloud Scheduler (triggers pipeline daily)
// -----------------------------------------------------------------------------
const scheduler = createScheduler({
  name: `${config.appName}-trigger`,
  region: config.gcpRegion,
  schedule: config.pipelineConfig.schedule,
  pipelineJobName: pipelineJob.name,
  dependsOn: [pipelineJob.job, ...enabledApis],
});

// -----------------------------------------------------------------------------
// 8. Monitoring & Alerting
// -----------------------------------------------------------------------------
const monitoring = createMonitoring({
  name: config.appName,
  apiServiceName: apiService.name,
  pipelineJobName: pipelineJob.name,
  alertConfig: config.alertConfig,
  dependsOn: [apiService.service, pipelineJob.job],
});

// =============================================================================
// Outputs
// =============================================================================

// API Endpoint (for frontend to call)
export const apiUrl = apiService.url;

// Pipeline Job Name (for manual triggers)
export const pipelineJobName = pipelineJob.name;

// Redis Connection (for debugging)
export const redisHost = redis.host;
export const redisPort = redis.port;

// Artifact Registry URL (for Docker pushes)
export const registryUrl = pulumi.interpolate`${config.gcpRegion}-docker.pkg.dev/${config.gcpProject}/${artifactRegistry.repositoryId}`;

// Monitoring Dashboard URL
export const dashboardUrl = monitoring.dashboardUrl;

// Environment Info
export const environment = config.environment;
export const project = config.gcpProject;
export const region = config.gcpRegion;
