import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

const gcpConfig = new pulumi.Config("gcp");
const gcpProject = gcpConfig.require("project");

interface SchedulerArgs {
  name: string;
  region: string;
  schedule: string;
  pipelineJobName: pulumi.Output<string>;
  dependsOn?: pulumi.Resource[];
}

export function createScheduler(args: SchedulerArgs) {

  // Create service account for scheduler
  const schedulerServiceAccount = new gcp.serviceaccount.Account(
    `${args.name}-sa`,
    {
      accountId: `${args.name}-scheduler`,
      displayName: "AURA Pipeline Scheduler Service Account",
    }
  );

  // Grant permission to invoke Cloud Run Jobs
  const invokerRole = new gcp.projects.IAMMember(
    `${args.name}-invoker-role`,
    {
      project: gcpProject,
      role: "roles/run.invoker",
      member: pulumi.interpolate`serviceAccount:${schedulerServiceAccount.email}`,
    }
  );

  // Also need run.jobs.run permission
  const jobRunRole = new gcp.projects.IAMMember(
    `${args.name}-job-run-role`,
    {
      project: gcpProject,
      role: "roles/run.developer",
      member: pulumi.interpolate`serviceAccount:${schedulerServiceAccount.email}`,
    }
  );

  // Create Cloud Scheduler job to trigger pipeline daily
  const schedulerJob = new gcp.cloudscheduler.Job(
    args.name,
    {
      name: args.name,
      region: args.region,
      description: "Triggers AURA daily pipeline for outfit pre-computation",

      // Cron schedule (default: daily at 2 AM UTC)
      schedule: args.schedule,
      timeZone: "UTC",

      // HTTP target to trigger Cloud Run Job
      httpTarget: {
        uri: pulumi.interpolate`https://${args.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${gcpProject}/jobs/${args.pipelineJobName}:run`,
        httpMethod: "POST",
        oauthToken: {
          serviceAccountEmail: schedulerServiceAccount.email,
          scope: "https://www.googleapis.com/auth/cloud-platform",
        },
      },

      // Retry configuration
      retryConfig: {
        retryCount: 3,
        minBackoffDuration: "30s",
        maxBackoffDuration: "3600s",
        maxDoublings: 5,
      },

      // Attempt deadline
      attemptDeadline: "320s",
    },
    { dependsOn: [...(args.dependsOn || []), invokerRole, jobRunRole] }
  );

  // Create additional manual trigger jobs for specific scenarios
  const weatherRefreshJob = new gcp.cloudscheduler.Job(
    `${args.name}-weather-refresh`,
    {
      name: `${args.name}-weather-refresh`,
      region: args.region,
      description: "Refreshes weather data every 6 hours",

      // Every 6 hours
      schedule: "0 */6 * * *",
      timeZone: "UTC",

      httpTarget: {
        uri: pulumi.interpolate`https://${args.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${gcpProject}/jobs/${args.pipelineJobName}:run`,
        httpMethod: "POST",
        body: Buffer.from(
          JSON.stringify({
            overrides: {
              containerOverrides: [
                {
                  env: [
                    { name: "PIPELINE_MODE", value: "weather-only" },
                  ],
                },
              ],
            },
          })
        ).toString("base64"),
        headers: {
          "Content-Type": "application/json",
        },
        oauthToken: {
          serviceAccountEmail: schedulerServiceAccount.email,
          scope: "https://www.googleapis.com/auth/cloud-platform",
        },
      },

      retryConfig: {
        retryCount: 2,
        minBackoffDuration: "60s",
        maxBackoffDuration: "600s",
      },
    },
    { dependsOn: [schedulerJob] }
  );

  return {
    mainJob: schedulerJob,
    weatherRefreshJob,
    serviceAccount: schedulerServiceAccount,

    // Useful info
    info: {
      schedule: args.schedule,
      timezone: "UTC",
      nextRun: "Determined by Cloud Scheduler",
    },
  };
}

/**
 * Utility: Parse cron expression for display
 */
export function describeCron(cron: string): string {
  const descriptions: Record<string, string> = {
    "0 2 * * *": "Daily at 2:00 AM UTC",
    "0 */6 * * *": "Every 6 hours",
    "0 3 * * 0": "Sundays at 3:00 AM UTC",
    "0 0 * * *": "Daily at midnight UTC",
  };
  return descriptions[cron] || cron;
}
