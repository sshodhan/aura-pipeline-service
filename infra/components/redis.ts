import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

interface RedisConfig {
  tier: "BASIC" | "STANDARD_HA";
  memorySizeGb: number;
  version: string;
}

interface RedisArgs {
  name: string;
  region: string;
  network: gcp.compute.Network;
  config: RedisConfig;
  dependsOn?: pulumi.Resource[];
}

export function createRedis(args: RedisArgs) {
  // Create Memorystore Redis instance
  const redisInstance = new gcp.redis.Instance(
    `${args.name}-redis`,
    {
      name: `${args.name}-cache`,
      region: args.region,

      // Tier: BASIC (single node) or STANDARD_HA (high availability)
      tier: args.config.tier,
      memorySizeGb: args.config.memorySizeGb,
      redisVersion: args.config.version,

      // Networking
      authorizedNetwork: args.network.id,
      connectMode: "PRIVATE_SERVICE_ACCESS",

      // Redis Configuration
      redisConfigs: {
        // LRU eviction when memory is full
        "maxmemory-policy": "allkeys-lru",

        // Enable keyspace notifications for cache events
        "notify-keyspace-events": "Ex",

        // Connection timeout
        timeout: "300",
      },

      // Maintenance window (Sunday 2-6 AM)
      maintenancePolicy: {
        weeklyMaintenanceWindows: [
          {
            day: "SUNDAY",
            startTime: {
              hours: 2,
              minutes: 0,
            },
          },
        ],
      },

      // Labels
      labels: {
        app: args.name,
        environment: pulumi.getStack(),
        managed_by: "pulumi",
      },

      // Display name
      displayName: `AURA Pipeline Cache (${pulumi.getStack()})`,
    },
    {
      dependsOn: args.dependsOn,
      // Protect production Redis from accidental deletion
      protect: pulumi.getStack() === "prod",
    }
  );

  // Output the connection details
  const host = redisInstance.host;
  const port = redisInstance.port;

  // Create connection string (for application use)
  const connectionString = pulumi.interpolate`redis://${host}:${port}`;

  return {
    instance: redisInstance,
    host,
    port,
    connectionString,

    // Useful outputs for debugging
    info: {
      name: redisInstance.name,
      tier: args.config.tier,
      memorySizeGb: args.config.memorySizeGb,
      version: args.config.version,
    },
  };
}

/**
 * Redis cache key patterns for AURA Pipeline
 *
 * These patterns should match the application code in:
 * src/services/redis.ts
 */
export const cacheKeyPatterns = {
  // Outfit bundles
  outfit: "aura:outfit:{cityId}:{date}:{persona}:{occasion}:{vibe}:{weather}",

  // Weather context
  weather: "aura:weather:{cityId}:{date}",

  // Style matrix
  matrix: "aura:matrix:{cityId}:{date}",

  // City index (all bundles for a city)
  cityIndex: "aura:city:{cityId}:bundles",

  // Pipeline status
  pipelineStatus: "aura:pipeline:status",
  pipelineLastRun: "aura:pipeline:last-run",

  // Metrics
  cacheHits: "aura:metrics:cache:hits",
  cacheMisses: "aura:metrics:cache:misses",
};

/**
 * Redis TTL values (in seconds)
 */
export const cacheTTL = {
  outfit: 24 * 60 * 60, // 24 hours
  weather: 6 * 60 * 60, // 6 hours
  matrix: 24 * 60 * 60, // 24 hours
  trends: 7 * 24 * 60 * 60, // 7 days
};
