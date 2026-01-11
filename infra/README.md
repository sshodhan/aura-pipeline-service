# AURA Pipeline Infrastructure

Pulumi-based infrastructure as code for deploying the AURA Pipeline Service on Google Cloud Platform.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         GCP Project                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   Cloud      │     │  Cloud Run   │     │  Cloud Run   │    │
│  │  Scheduler   │────▶│    Job       │     │   Service    │◀───│── Client
│  │  (2 AM UTC)  │     │  (Pipeline)  │     │    (API)     │    │   Requests
│  └──────────────┘     └──────┬───────┘     └──────┬───────┘    │
│                              │                    │             │
│                              │    VPC Connector   │             │
│                              └────────┬───────────┘             │
│                                       │                         │
│                              ┌────────▼───────┐                 │
│                              │   Memorystore  │                 │
│                              │    (Redis)     │                 │
│                              └────────────────┘                 │
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   Secret     │     │   Artifact   │     │    Cloud     │    │
│  │   Manager    │     │   Registry   │     │  Monitoring  │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. **Pulumi CLI** installed: https://www.pulumi.com/docs/install/
2. **Google Cloud SDK** installed and authenticated
3. **Node.js** 18+ installed

## Quick Start

### 1. Install Dependencies

```bash
cd infra
npm install
```

### 2. Configure GCP Project

```bash
# Login to GCP
gcloud auth login
gcloud auth application-default login

# Set your project
gcloud config set project YOUR_PROJECT_ID
```

### 3. Initialize Pulumi Stack

```bash
# Create a new stack (dev or prod)
pulumi stack init dev

# Set GCP project
pulumi config set gcp:project YOUR_PROJECT_ID
pulumi config set gcp:region us-central1
```

### 4. Set Secrets

```bash
# Gemini API Key
pulumi config set --secret geminiApiKey "YOUR_GEMINI_API_KEY"

# Weather API Key
pulumi config set --secret weatherApiKey "YOUR_WEATHER_API_KEY"

# Alert email (optional)
pulumi config set alertEmail "alerts@your-domain.com"

# Slack webhook (optional)
pulumi config set --secret slackWebhook "https://hooks.slack.com/..."
```

### 5. Deploy

```bash
# Preview changes
pulumi preview

# Deploy
pulumi up
```

## Stacks

| Stack | Purpose | GCP Project |
|-------|---------|-------------|
| `dev` | Development/testing | aura-stylist-dev |
| `prod` | Production | aura-stylist-prod |

### Switch Stacks

```bash
pulumi stack select dev
pulumi stack select prod
```

## Components

### Networking (`components/networking.ts`)
- VPC network for private connectivity
- VPC connector for Cloud Run → Redis communication
- Firewall rules for internal traffic

### Secrets (`components/secrets.ts`)
- Secret Manager for API keys
- Auto-generated Redis password
- IAM bindings for Cloud Run access

### Redis (`components/redis.ts`)
- Memorystore Redis instance
- BASIC tier (dev) or STANDARD_HA (prod)
- LRU eviction policy for cache management

### Cloud Run (`components/cloud-run.ts`)
- **API Service**: Always-on, serves cached outfits
- **Pipeline Job**: Batch job, runs daily

### Scheduler (`components/scheduler.ts`)
- Daily pipeline trigger (2 AM UTC)
- Weather refresh trigger (every 6 hours)

### Monitoring (`components/monitoring.ts`)
- Alert policies for failures and latency
- Custom dashboard for metrics
- Email and Slack notifications

## Outputs

After deployment, Pulumi will output:

```
apiUrl:          https://aura-pipeline-api-xxx-uc.a.run.app
pipelineJobName: aura-pipeline-pipeline
redisHost:       10.x.x.x
registryUrl:     us-central1-docker.pkg.dev/PROJECT/aura-pipeline-images
dashboardUrl:    https://console.cloud.google.com/monitoring/dashboards/...
```

## Common Commands

```bash
# View stack outputs
pulumi stack output

# Get specific output
pulumi stack output apiUrl

# View resources
pulumi stack --show-urns

# Destroy infrastructure
pulumi destroy

# Export stack state
pulumi stack export > stack-backup.json
```

## Manual Pipeline Trigger

```bash
# Get job name
JOB_NAME=$(pulumi stack output pipelineJobName)

# Trigger manually
gcloud run jobs execute $JOB_NAME --region us-central1

# View logs
gcloud run jobs logs $JOB_NAME --region us-central1
```

## Cost Estimates

| Resource | Dev (~monthly) | Prod (~monthly) |
|----------|----------------|-----------------|
| Cloud Run API | $5-20 | $20-100 |
| Cloud Run Job | $10-30 | $50-150 |
| Memorystore Redis | $35 (1GB Basic) | $130 (2GB HA) |
| Cloud Scheduler | $0.10 | $0.10 |
| Networking | $5-10 | $10-30 |
| **Total** | **~$55-95** | **~$210-410** |

## Updating Secrets

```bash
# Update Gemini API key
gcloud secrets versions add aura-pipeline-gemini-api-key \
  --data-file=- <<< "NEW_API_KEY"

# Update Weather API key
gcloud secrets versions add aura-pipeline-weather-api-key \
  --data-file=- <<< "NEW_API_KEY"
```

## Troubleshooting

### Pipeline Job Fails

```bash
# Check logs
gcloud run jobs logs aura-pipeline-pipeline --region us-central1

# Check Redis connectivity
gcloud redis instances describe aura-pipeline-cache --region us-central1
```

### API High Latency

1. Check cache hit rate in monitoring dashboard
2. Verify Redis memory usage
3. Check Cloud Run instance scaling

### VPC Connector Issues

```bash
# List connectors
gcloud compute networks vpc-access connectors list --region us-central1

# Check connector status
gcloud compute networks vpc-access connectors describe aura-pipeline-connector \
  --region us-central1
```

## CI/CD Integration

See `.github/workflows/deploy-infra.yml` for GitHub Actions deployment.

```yaml
# Example workflow trigger
on:
  push:
    branches: [main]
    paths: ['infra/**']
```

## Security Notes

1. **Secrets**: All sensitive values stored in Secret Manager
2. **Network**: Redis only accessible via VPC connector
3. **IAM**: Minimal permissions using dedicated service accounts
4. **API**: Public access to API service (authentication can be added)

## Contributing

1. Create a feature branch
2. Make changes to infrastructure code
3. Run `pulumi preview` to verify
4. Submit PR with preview output
