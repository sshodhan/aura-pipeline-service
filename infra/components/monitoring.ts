import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

interface AlertConfig {
  notificationEmail: string;
  slackWebhook?: pulumi.Output<string>;
  pipelineFailureThreshold: number;
  cacheHitRateThreshold: number;
  latencyThresholdMs: number;
}

interface MonitoringArgs {
  name: string;
  apiServiceName: pulumi.Output<string>;
  pipelineJobName: pulumi.Output<string>;
  alertConfig: AlertConfig;
  dependsOn?: pulumi.Resource[];
}

export function createMonitoring(args: MonitoringArgs) {
  const project = gcp.organizations.getProjectOutput({});

  // -----------------------------------------------------------------------------
  // Notification Channels
  // -----------------------------------------------------------------------------

  // Email notification channel
  const emailChannel = args.alertConfig.notificationEmail
    ? new gcp.monitoring.NotificationChannel(`${args.name}-email-channel`, {
        displayName: "AURA Pipeline Email Alerts",
        type: "email",
        labels: {
          email_address: args.alertConfig.notificationEmail,
        },
        enabled: true,
      })
    : undefined;

  // Slack notification channel (if webhook provided)
  const slackChannel = args.alertConfig.slackWebhook
    ? new gcp.monitoring.NotificationChannel(`${args.name}-slack-channel`, {
        displayName: "AURA Pipeline Slack Alerts",
        type: "slack",
        labels: {
          channel_name: "#aura-alerts",
        },
        sensitiveLabels: {
          authToken: args.alertConfig.slackWebhook,
        },
        enabled: true,
      })
    : undefined;

  const notificationChannels = [emailChannel, slackChannel]
    .filter(Boolean)
    .map((c) => c!.name);

  // -----------------------------------------------------------------------------
  // Alert Policies
  // -----------------------------------------------------------------------------

  // Alert: Pipeline Job Failure
  const pipelineFailureAlert = new gcp.monitoring.AlertPolicy(
    `${args.name}-pipeline-failure`,
    {
      displayName: "AURA Pipeline Job Failure",
      combiner: "OR",

      conditions: [
        {
          displayName: "Pipeline job failed",
          conditionThreshold: {
            filter: pulumi.interpolate`
              resource.type="cloud_run_job"
              AND resource.labels.job_name="${args.pipelineJobName}"
              AND metric.type="run.googleapis.com/job/completed_execution_count"
              AND metric.labels.result="failed"
            `,
            comparison: "COMPARISON_GT",
            thresholdValue: args.alertConfig.pipelineFailureThreshold - 1,
            duration: "0s",
            aggregations: [
              {
                alignmentPeriod: "300s",
                perSeriesAligner: "ALIGN_SUM",
              },
            ],
          },
        },
      ],

      alertStrategy: {
        autoClose: "604800s", // Auto-close after 7 days
      },

      notificationChannels,

      documentation: {
        content: `
## Pipeline Failure Alert

The AURA daily pipeline job has failed.

### Investigation Steps:
1. Check Cloud Run Job logs: \`gcloud run jobs logs ${args.pipelineJobName}\`
2. Verify external API status (Weather API, Gemini API)
3. Check Redis connectivity
4. Review recent code changes

### Recovery:
- Manual trigger: \`gcloud run jobs execute ${args.pipelineJobName}\`
- Previous cache will be used as fallback (48h max age)
        `,
        mimeType: "text/markdown",
      },

      severity: "CRITICAL",
      enabled: true,
    },
    { dependsOn: args.dependsOn }
  );

  // Alert: API High Latency
  const apiLatencyAlert = new gcp.monitoring.AlertPolicy(
    `${args.name}-api-latency`,
    {
      displayName: "AURA API High Latency",
      combiner: "OR",

      conditions: [
        {
          displayName: "API latency > threshold",
          conditionThreshold: {
            filter: pulumi.interpolate`
              resource.type="cloud_run_revision"
              AND resource.labels.service_name="${args.apiServiceName}"
              AND metric.type="run.googleapis.com/request_latencies"
            `,
            comparison: "COMPARISON_GT",
            thresholdValue: args.alertConfig.latencyThresholdMs,
            duration: "300s", // 5 minutes
            aggregations: [
              {
                alignmentPeriod: "60s",
                perSeriesAligner: "ALIGN_PERCENTILE_95",
              },
            ],
          },
        },
      ],

      notificationChannels,

      documentation: {
        content: `
## High Latency Alert

The AURA API is experiencing high latency (p95 > ${args.alertConfig.latencyThresholdMs}ms).

### Possible Causes:
- Redis cache misses (triggering real-time generation)
- High traffic volume
- Slow Gemini API responses

### Investigation:
1. Check cache hit rate in metrics
2. Review Cloud Run instance scaling
3. Check Redis memory usage
        `,
        mimeType: "text/markdown",
      },

      severity: "WARNING",
      enabled: true,
    },
    { dependsOn: args.dependsOn }
  );

  // Alert: API Error Rate
  const apiErrorAlert = new gcp.monitoring.AlertPolicy(
    `${args.name}-api-errors`,
    {
      displayName: "AURA API High Error Rate",
      combiner: "OR",

      conditions: [
        {
          displayName: "Error rate > 5%",
          conditionThreshold: {
            filter: pulumi.interpolate`
              resource.type="cloud_run_revision"
              AND resource.labels.service_name="${args.apiServiceName}"
              AND metric.type="run.googleapis.com/request_count"
              AND metric.labels.response_code_class!="2xx"
            `,
            comparison: "COMPARISON_GT",
            thresholdValue: 0.05, // 5%
            duration: "300s",
            aggregations: [
              {
                alignmentPeriod: "60s",
                perSeriesAligner: "ALIGN_RATE",
                crossSeriesReducer: "REDUCE_SUM",
              },
            ],
          },
        },
      ],

      notificationChannels,
      severity: "WARNING",
      enabled: true,
    },
    { dependsOn: args.dependsOn }
  );

  // -----------------------------------------------------------------------------
  // Custom Dashboard
  // -----------------------------------------------------------------------------

  const dashboard = new gcp.monitoring.Dashboard(`${args.name}-dashboard`, {
    dashboardJson: pulumi
      .all([args.apiServiceName, args.pipelineJobName, project.projectId])
      .apply(([apiName, pipelineName, projectId]) =>
        JSON.stringify({
          displayName: "AURA Pipeline Dashboard",
          gridLayout: {
            columns: "2",
            widgets: [
              // Row 1: Pipeline Status
              {
                title: "Pipeline Executions",
                xyChart: {
                  dataSets: [
                    {
                      timeSeriesQuery: {
                        timeSeriesFilter: {
                          filter: `resource.type="cloud_run_job" AND resource.labels.job_name="${pipelineName}"`,
                          aggregation: {
                            alignmentPeriod: "3600s",
                            perSeriesAligner: "ALIGN_SUM",
                          },
                        },
                      },
                      plotType: "LINE",
                    },
                  ],
                },
              },
              {
                title: "Pipeline Duration",
                xyChart: {
                  dataSets: [
                    {
                      timeSeriesQuery: {
                        timeSeriesFilter: {
                          filter: `resource.type="cloud_run_job" AND resource.labels.job_name="${pipelineName}" AND metric.type="run.googleapis.com/job/execution_duration"`,
                          aggregation: {
                            alignmentPeriod: "3600s",
                            perSeriesAligner: "ALIGN_MEAN",
                          },
                        },
                      },
                      plotType: "LINE",
                    },
                  ],
                },
              },

              // Row 2: API Metrics
              {
                title: "API Request Count",
                xyChart: {
                  dataSets: [
                    {
                      timeSeriesQuery: {
                        timeSeriesFilter: {
                          filter: `resource.type="cloud_run_revision" AND resource.labels.service_name="${apiName}"`,
                          aggregation: {
                            alignmentPeriod: "60s",
                            perSeriesAligner: "ALIGN_RATE",
                          },
                        },
                      },
                      plotType: "LINE",
                    },
                  ],
                },
              },
              {
                title: "API Latency (p95)",
                xyChart: {
                  dataSets: [
                    {
                      timeSeriesQuery: {
                        timeSeriesFilter: {
                          filter: `resource.type="cloud_run_revision" AND resource.labels.service_name="${apiName}" AND metric.type="run.googleapis.com/request_latencies"`,
                          aggregation: {
                            alignmentPeriod: "60s",
                            perSeriesAligner: "ALIGN_PERCENTILE_95",
                          },
                        },
                      },
                      plotType: "LINE",
                    },
                  ],
                },
              },

              // Row 3: Redis Metrics
              {
                title: "Redis Memory Usage",
                xyChart: {
                  dataSets: [
                    {
                      timeSeriesQuery: {
                        timeSeriesFilter: {
                          filter: `resource.type="redis_instance" AND metric.type="redis.googleapis.com/stats/memory/usage"`,
                          aggregation: {
                            alignmentPeriod: "60s",
                            perSeriesAligner: "ALIGN_MEAN",
                          },
                        },
                      },
                      plotType: "LINE",
                    },
                  ],
                },
              },
              {
                title: "Redis Commands/sec",
                xyChart: {
                  dataSets: [
                    {
                      timeSeriesQuery: {
                        timeSeriesFilter: {
                          filter: `resource.type="redis_instance" AND metric.type="redis.googleapis.com/commands/calls"`,
                          aggregation: {
                            alignmentPeriod: "60s",
                            perSeriesAligner: "ALIGN_RATE",
                          },
                        },
                      },
                      plotType: "LINE",
                    },
                  ],
                },
              },

              // Row 4: Scorecard widgets
              {
                title: "Active Instances",
                scorecard: {
                  timeSeriesQuery: {
                    timeSeriesFilter: {
                      filter: `resource.type="cloud_run_revision" AND resource.labels.service_name="${apiName}" AND metric.type="run.googleapis.com/container/instance_count"`,
                      aggregation: {
                        alignmentPeriod: "60s",
                        perSeriesAligner: "ALIGN_MEAN",
                      },
                    },
                  },
                },
              },
              {
                title: "Redis Cache Size",
                scorecard: {
                  timeSeriesQuery: {
                    timeSeriesFilter: {
                      filter: `resource.type="redis_instance" AND metric.type="redis.googleapis.com/keyspace/keys"`,
                      aggregation: {
                        alignmentPeriod: "60s",
                        perSeriesAligner: "ALIGN_MEAN",
                      },
                    },
                  },
                },
              },
            ],
          },
        })
      ),
  });

  // Dashboard URL
  const dashboardUrl = pulumi.interpolate`https://console.cloud.google.com/monitoring/dashboards/builder/${dashboard.id}?project=${project.projectId}`;

  return {
    alerts: {
      pipelineFailure: pipelineFailureAlert,
      apiLatency: apiLatencyAlert,
      apiErrors: apiErrorAlert,
    },
    dashboard,
    dashboardUrl,
    notificationChannels: {
      email: emailChannel,
      slack: slackChannel,
    },
  };
}
