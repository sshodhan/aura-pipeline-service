# AURA Pipeline Service - Deployment Guide

## Quick Start (Local Development)

### Prerequisites
- Node.js 18+
- Docker Desktop
- API Keys:
  - [Gemini API Key](https://aistudio.google.com/apikey)
  - [OpenWeatherMap API Key](https://openweathermap.org/api)

### Local Setup

```bash
# 1. Clone and install
cd ~/projects/aura-pipeline-service
npm install

# 2. Create environment file
cp .env.example .env
# Edit .env with your API keys

# 3. Start Redis
docker-compose up -d redis

# 4. Start development server
npm run dev

# 5. Test endpoints
curl http://localhost:3000/health
curl http://localhost:3000/cities
curl -X POST http://localhost:3000/pipeline/trigger
curl http://localhost:3000/pipeline/status
```

---

## GCP Deployment with Pulumi

### Prerequisites

1. **Google Cloud Account** with billing enabled
2. **GCP Project** created
3. **gcloud CLI** installed and authenticated
4. **Pulumi CLI** installed
5. **Docker** for building images

### Step 1: Install Tools

```bash
# Install gcloud CLI (macOS)
brew install google-cloud-sdk

# Install Pulumi
brew install pulumi

# Authenticate
gcloud auth login
gcloud auth application-default login
```

### Step 2: Configure GCP Project

```bash
# Set your project ID
export GCP_PROJECT_ID="your-project-id"

# Create project (if needed)
gcloud projects create $GCP_PROJECT_ID --name="AURA Pipeline"

# Set default project
gcloud config set project $GCP_PROJECT_ID

# Enable billing (required for APIs)
# Go to: https://console.cloud.google.com/billing

# Enable required APIs
gcloud services enable \
  run.googleapis.com \
  redis.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com \
  vpcaccess.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com
```

### Step 3: Set Up Pulumi

```bash
cd infra

# Install dependencies
npm install

# Login to Pulumi (use local backend for simplicity)
pulumi login --local

# Create dev stack
pulumi stack init dev

# Configure the stack
pulumi config set gcp:project $GCP_PROJECT_ID
pulumi config set gcp:region us-central1
pulumi config set environment dev

# Set secrets
pulumi config set --secret geminiApiKey "your-gemini-api-key"
pulumi config set --secret weatherApiKey "your-openweather-api-key"
```

### Step 4: Build and Push Docker Image

```bash
# Go back to project root
cd ..

# Configure Docker for GCP Artifact Registry
gcloud auth configure-docker us-central1-docker.pkg.dev

# Create Artifact Registry repository
gcloud artifacts repositories create aura-pipeline \
  --repository-format=docker \
  --location=us-central1 \
  --description="AURA Pipeline Service images"

# Build and tag image
docker build -t us-central1-docker.pkg.dev/$GCP_PROJECT_ID/aura-pipeline/api:latest .

# Push image
docker push us-central1-docker.pkg.dev/$GCP_PROJECT_ID/aura-pipeline/api:latest
```

### Step 5: Deploy with Pulumi

```bash
cd infra

# Preview changes
pulumi preview

# Deploy
pulumi up

# Get outputs
pulumi stack output apiUrl
pulumi stack output pipelineJobName
```

### Step 6: Verify Deployment

```bash
# Get API URL from Pulumi output
API_URL=$(pulumi stack output apiUrl)

# Test health
curl $API_URL/health

# Test cities
curl $API_URL/cities

# Trigger pipeline manually (first run)
curl -X POST $API_URL/pipeline/trigger

# Check status
curl $API_URL/pipeline/status
```

---

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Google Gemini API key | `AIzaSy...` |
| `WEATHER_API_KEY` | OpenWeatherMap API key | `abc123...` |
| `REDIS_HOST` | Redis hostname | `localhost` or GCP IP |
| `REDIS_PORT` | Redis port | `6379` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `development` |
| `PORT` | Server port | `3000` |
| `LOG_LEVEL` | Logging level | `info` |
| `PIPELINE_MODE` | Pipeline mode | `full` |

---

## API Endpoints

### Health & Status

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Basic health check |
| `/health/detailed` | GET | Detailed health with service status |
| `/health/ready` | GET | Kubernetes readiness probe |
| `/health/live` | GET | Kubernetes liveness probe |
| `/status` | GET | Pipeline and cache status |

### Data

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/cities` | GET | List all 12 supported cities |
| `/outfits` | GET | Get cached outfits by signals |

Query params for `/outfits`:
- `cityId` (required): e.g., `new-york-ny`
- `persona` (required): e.g., `casual`, `professional`
- `occasion` (required): e.g., `work`, `dinner`
- `vibe` (required): e.g., `minimal`, `bold`

### Pipeline Control

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/pipeline/trigger` | POST | Manually trigger pipeline run |
| `/pipeline/status` | GET | Get current pipeline status |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     GCP Infrastructure                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐     ┌──────────────────┐             │
│  │ Cloud Scheduler  │────▶│  Cloud Run Job   │             │
│  │  (Daily 2 AM)    │     │   (Pipeline)     │             │
│  └──────────────────┘     └────────┬─────────┘             │
│                                    │                        │
│                                    ▼                        │
│  ┌──────────────────┐     ┌──────────────────┐             │
│  │  Cloud Run API   │────▶│  Memorystore     │             │
│  │  (HTTP Server)   │◀────│    (Redis)       │             │
│  └────────┬─────────┘     └──────────────────┘             │
│           │                                                 │
│           │ VPC Connector                                   │
│           ▼                                                 │
│  ┌──────────────────┐     ┌──────────────────┐             │
│  │  Secret Manager  │     │   Monitoring     │             │
│  │  (API Keys)      │     │  (Alerts/Dash)   │             │
│  └──────────────────┘     └──────────────────┘             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Vercel (Client App)                       │
├─────────────────────────────────────────────────────────────┤
│  AURA Stylist App  ──▶  Pipeline Client  ──▶  Cloud Run API │
└─────────────────────────────────────────────────────────────┘
```

---

## Supported Cities

| City | ID | Tier | Style DNA |
|------|----|------|-----------|
| New York | `new-york-ny` | 1 | classic, edgy, minimalist |
| Los Angeles | `los-angeles-ca` | 1 | natural, bohemian, street |
| Chicago | `chicago-il` | 1 | classic, preppy, natural |
| Miami | `miami-fl` | 2 | romantic, edgy, bohemian |
| San Francisco | `san-francisco-ca` | 2 | minimalist, natural, creative |
| Seattle | `seattle-wa` | 2 | natural, minimalist, street |
| Austin | `austin-tx` | 2 | bohemian, creative, natural |
| Boston | `boston-ma` | 2 | classic, preppy, natural |
| Denver | `denver-co` | 3 | natural, street, bohemian |
| Nashville | `nashville-tn` | 3 | bohemian, romantic, classic |
| Atlanta | `atlanta-ga` | 3 | street, edgy, classic |
| Portland | `portland-or` | 3 | creative, natural, bohemian |

---

## Troubleshooting

### Common Issues

**1. Gemini API "model not found" error**
```bash
# Check available models
curl "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY"

# Update config to use gemini-2.0-flash (not gemini-1.5-flash)
```

**2. Redis connection failed**
```bash
# Check if Redis is running
docker ps | grep redis

# Restart Redis
docker-compose restart redis
```

**3. Pipeline generates 0 bundles**
```bash
# Check health endpoint for service status
curl http://localhost:3000/health/detailed

# Verify both gemini and redis show "up"
```

**4. Port already in use**
```bash
# Kill existing process
lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9
```

### Logs

```bash
# Local development logs
npm run dev  # Logs appear in terminal

# GCP Cloud Run logs
gcloud run services logs read aura-pipeline-api --limit=50

# GCP Cloud Run Job logs
gcloud run jobs executions logs read [JOB_EXECUTION_ID]
```

---

## Cost Estimates (Monthly)

| Service | Dev | Production |
|---------|-----|------------|
| Cloud Run (API) | ~$5 | ~$20 |
| Cloud Run Job | ~$2 | ~$10 |
| Memorystore Redis | ~$35 | ~$70 |
| Secret Manager | <$1 | <$1 |
| Cloud Scheduler | <$1 | <$1 |
| **Total** | **~$45** | **~$100** |

---

## Integration with AURA App

After deployment, configure the Vercel app:

```bash
# In Vercel dashboard, add environment variable:
PIPELINE_API_URL=https://your-cloud-run-url.run.app
```

Or in `.env.local`:
```
NEXT_PUBLIC_PIPELINE_API_URL=https://your-cloud-run-url.run.app
```

The `lib/pipeline-client.ts` in the AURA app will:
1. Check if user's location maps to a supported city
2. Fetch pre-computed outfits from pipeline
3. Fall back to direct Gemini if cache miss

---

## Next Steps

1. [ ] Deploy to GCP with Pulumi
2. [ ] Get Cloud Run API URL
3. [ ] Set `PIPELINE_API_URL` in Vercel
4. [ ] Test end-to-end flow
5. [ ] Monitor pipeline runs in GCP Console
6. [ ] Set up alerting for failures
