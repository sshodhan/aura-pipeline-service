import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import { SecretsOutput } from "./secrets";

// =============================================================================
// Cloud Run API Service (serves cached outfits)
// =============================================================================

interface ApiConfig {
  cpu: string;
  memory: string;
  minInstances: number;
  maxInstances: number;
  concurrency: number;
}

interface CloudRunApiArgs {
  name: string;
  region: string;
  config: ApiConfig;
  redisHost: pulumi.Output<string>;
  redisPort: pulumi.Output<number>;
  vpcConnector: gcp.vpcaccess.Connector;
  secrets: SecretsOutput;
  repository: gcp.artifactregistry.Repository;
  dependsOn?: pulumi.Resource[];
}

export function createCloudRunApi(args: CloudRunApiArgs) {
  const project = gcp.organizations.getProjectOutput({});

  // Image URL (will be built and pushed separately via CI/CD)
  const imageUrl = pulumi.interpolate`${args.region}-docker.pkg.dev/${project.projectId}/${args.repository.repositoryId}/api:latest`;

  // Create Cloud Run Service
  const service = new gcp.cloudrunv2.Service(
    args.name,
    {
      name: args.name,
      location: args.region,
      ingress: "INGRESS_TRAFFIC_ALL", // Allow public access

      template: {
        // Scaling configuration
        scaling: {
          minInstanceCount: args.config.minInstances,
          maxInstanceCount: args.config.maxInstances,
        },

        // VPC connector for Redis access
        vpcAccess: {
          connector: args.vpcConnector.id,
          egress: "PRIVATE_RANGES_ONLY",
        },

        containers: [
          {
            image: imageUrl,
            name: "api",

            // Resource limits
            resources: {
              limits: {
                cpu: args.config.cpu,
                memory: args.config.memory,
              },
              cpuIdle: true, // Allow CPU throttling when idle
            },

            // Environment variables and secrets
            envs: [
              { name: "NODE_ENV", value: "production" },
              { name: "PORT", value: "8080" },
              { name: "REDIS_HOST", value: args.redisHost },
              {
                name: "REDIS_PORT",
                value: pulumi.interpolate`${args.redisPort}`,
              },
              { name: "LOG_LEVEL", value: "info" },
              {
                name: "GEMINI_API_KEY",
                valueSource: {
                  secretKeyRef: {
                    secret: args.secrets.geminiApiKey.secretId,
                    version: "latest",
                  },
                },
              },
            ],

            // Health check
            startupProbe: {
              httpGet: {
                path: "/health",
                port: 8080,
              },
              initialDelaySeconds: 5,
              periodSeconds: 10,
              failureThreshold: 3,
            },

            livenessProbe: {
              httpGet: {
                path: "/health",
                port: 8080,
              },
              periodSeconds: 30,
            },

            // Ports
            ports: [{ containerPort: 8080 }],
          },
        ],

        // Request timeout
        timeout: "60s",

        // Max concurrent requests per instance
        maxInstanceRequestConcurrency: args.config.concurrency,

        // Service account (uses default compute SA)
        serviceAccount: pulumi.interpolate`${project.number}-compute@developer.gserviceaccount.com`,
      },

      // Traffic routing (100% to latest)
      traffics: [
        {
          type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST",
          percent: 100,
        },
      ],
    },
    { dependsOn: args.dependsOn }
  );

  // Allow unauthenticated access (public API)
  const iamBinding = new gcp.cloudrunv2.ServiceIamBinding(
    `${args.name}-invoker`,
    {
      name: service.name,
      location: args.region,
      role: "roles/run.invoker",
      members: ["allUsers"],
    }
  );

  return {
    service,
    name: service.name,
    url: service.uri,
  };
}

// =============================================================================
// Cloud Run Pipeline Job (daily batch processing)
// =============================================================================

interface PipelineConfig {
  schedule: string;
  timeout: number;
  cpu: string;
  memory: string;
  maxInstances: number;
}

interface CloudRunPipelineArgs {
  name: string;
  region: string;
  config: PipelineConfig;
  redisHost: pulumi.Output<string>;
  redisPort: pulumi.Output<number>;
  vpcConnector: gcp.vpcaccess.Connector;
  secrets: SecretsOutput;
  repository: gcp.artifactregistry.Repository;
  dependsOn?: pulumi.Resource[];
}

export function createCloudRunPipeline(args: CloudRunPipelineArgs) {
  const project = gcp.organizations.getProjectOutput({});

  // Image URL
  const imageUrl = pulumi.interpolate`${args.region}-docker.pkg.dev/${project.projectId}/${args.repository.repositoryId}/pipeline:latest`;

  // Create Cloud Run Job (not Service - for batch processing)
  const job = new gcp.cloudrunv2.Job(
    args.name,
    {
      name: args.name,
      location: args.region,

      template: {
        // Parallelism: how many tasks run simultaneously
        parallelism: 1, // Run stages sequentially
        taskCount: 1, // Single task per execution

        template: {
          // VPC connector for Redis access
          vpcAccess: {
            connector: args.vpcConnector.id,
            egress: "PRIVATE_RANGES_ONLY",
          },

          containers: [
            {
              image: imageUrl,
              name: "pipeline",

              // More resources for batch processing
              resources: {
                limits: {
                  cpu: args.config.cpu,
                  memory: args.config.memory,
                },
              },

              // Environment variables and secrets
              envs: [
                { name: "NODE_ENV", value: "production" },
                { name: "REDIS_HOST", value: args.redisHost },
                {
                  name: "REDIS_PORT",
                  value: pulumi.interpolate`${args.redisPort}`,
                },
                { name: "LOG_LEVEL", value: "info" },
                { name: "PIPELINE_MODE", value: "full" },
                {
                  name: "CITIES_CONFIG",
                  value: JSON.stringify([
                    { id: "new-york-ny", tier: 1 },
                    { id: "los-angeles-ca", tier: 1 },
                    { id: "chicago-il", tier: 1 },
                    { id: "miami-fl", tier: 2 },
                    { id: "san-francisco-ca", tier: 2 },
                    { id: "seattle-wa", tier: 2 },
                    { id: "austin-tx", tier: 2 },
                    { id: "boston-ma", tier: 2 },
                    { id: "denver-co", tier: 3 },
                    { id: "nashville-tn", tier: 3 },
                    { id: "atlanta-ga", tier: 3 },
                    { id: "portland-or", tier: 3 },
                  ]),
                },
                {
                  name: "GEMINI_API_KEY",
                  valueSource: {
                    secretKeyRef: {
                      secret: args.secrets.geminiApiKey.secretId,
                      version: "latest",
                    },
                  },
                },
                {
                  name: "WEATHER_API_KEY",
                  valueSource: {
                    secretKeyRef: {
                      secret: args.secrets.weatherApiKey.secretId,
                      version: "latest",
                    },
                  },
                },
              ],

              // Command to run
              commands: ["npm", "run", "pipeline:daily"],
            },
          ],

          // Job timeout (4 hours for full pipeline)
          timeout: `${args.config.timeout}s`,

          // Max retries on failure
          maxRetries: 2,

          // Service account
          serviceAccount: pulumi.interpolate`${project.number}-compute@developer.gserviceaccount.com`,
        },
      },

      labels: {
        app: "aura-pipeline",
        environment: pulumi.getStack(),
      },
    },
    { dependsOn: args.dependsOn }
  );

  return {
    job,
    name: job.name,
  };
}
