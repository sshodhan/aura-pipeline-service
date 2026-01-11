# AURA Pipeline Service

Server-side pipeline for AURA Stylist that pre-computes and caches outfit recommendations for popular cities. Runs daily to ensure fresh, weather-appropriate, and trend-aware outfit suggestions.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Daily Pipeline (2 AM UTC)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Stage 1: Data Collection                                        │
│    └── Weather API + City Profiles + Trends                     │
│                           ↓                                      │
│  Stage 2: Signal Aggregation                                     │
│    └── Transform data into actionable signals                   │
│                           ↓                                      │
│  Stage 3: Style Matrix Generation                                │
│    └── Create valid signal combinations (~3-5K per city)        │
│                           ↓                                      │
│  Stage 4: Outfit Generation (AI)                                 │
│    └── Gemini API generates outfit recommendations              │
│                           ↓                                      │
│  Stage 5: Quality Scoring                                        │
│    └── Score confidence, filter low-quality                     │
│                           ↓                                      │
│  Stage 6: Cache Population                                       │
│    └── Store in Redis for instant retrieval                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Features

- **12 Priority Cities**: NYC, LA, Chicago, Miami, SF, Seattle, Austin, Boston, Denver, Nashville, Atlanta, Portland
- **Three-Layer Signal Taxonomy**: Identity (Persona) → Context (Occasion) → Aesthetics (Vibe)
- **Weather-Aware**: Real-time weather integrated into recommendations
- **Quality Scoring**: Confidence-based filtering ensures high-quality outputs
- **Cache-First**: Pre-computed outfits served instantly (<20ms latency)

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Gemini API key
- OpenWeatherMap API key

### Local Development

```bash
# Clone the repo
git clone https://github.com/your-org/aura-pipeline-service.git
cd aura-pipeline-service

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your API keys

# Start Redis and API server
docker-compose up -d redis
npm run dev

# In another terminal, run the pipeline
npm run pipeline:manual
```

### Docker

```bash
# Start all services
docker-compose up -d

# Run pipeline manually
docker-compose --profile pipeline up pipeline

# View logs
docker-compose logs -f api
```

## API Endpoints

### Outfits

```bash
# Get outfit for city + signals
GET /outfits/:cityId?persona=professional&occasion=work&vibe=minimal

# Response
{
  "success": true,
  "fromCache": true,
  "outfit": { ... },
  "alternatives": [ ... ],
  "confidence": 82.5
}
```

### Cities

```bash
# List all cities
GET /cities

# Get city details
GET /cities/new-york-ny

# Get city weather
GET /cities/new-york-ny/weather
```

### Health

```bash
# Simple health check
GET /health

# Detailed status
GET /health/detailed

# Pipeline status
GET /status
```

## Project Structure

```
aura-pipeline-service/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── outfits.ts      # Outfit endpoints
│   │   │   ├── cities.ts       # City endpoints
│   │   │   └── health.ts       # Health checks
│   │   └── server.ts           # Express server
│   │
│   ├── pipeline/
│   │   ├── stages/
│   │   │   ├── 1-data-collection.ts
│   │   │   ├── 2-signal-aggregation.ts
│   │   │   ├── 3-style-matrix.ts
│   │   │   ├── 4-outfit-generation.ts
│   │   │   ├── 5-quality-scoring.ts
│   │   │   └── 6-cache-population.ts
│   │   └── orchestrator.ts     # Pipeline runner
│   │
│   ├── services/
│   │   ├── redis.ts            # Cache operations
│   │   ├── weather.ts          # Weather API
│   │   └── gemini.ts           # AI generation
│   │
│   ├── models/
│   │   ├── signals.ts          # Signal taxonomy
│   │   ├── city.ts             # City profiles
│   │   └── outfit.ts           # Outfit types
│   │
│   └── utils/
│       ├── config.ts           # Configuration
│       └── logger.ts           # Logging
│
├── infra/                      # Pulumi infrastructure
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Google Gemini API key | Yes |
| `WEATHER_API_KEY` | OpenWeatherMap API key | Yes |
| `REDIS_HOST` | Redis host | Yes |
| `REDIS_PORT` | Redis port | Yes |
| `REDIS_PASSWORD` | Redis password | No |
| `PIPELINE_MODE` | `full`, `weather-only`, `single-city` | No |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` | No |

### Pipeline Modes

- **full**: Process all 12 cities (default)
- **weather-only**: Only refresh weather data
- **single-city**: Process single city (set `PIPELINE_CITY`)

## Deployment

### GCP Cloud Run

See `infra/` for Pulumi infrastructure:

```bash
cd infra
npm install
pulumi up
```

### Manual Docker Deploy

```bash
# Build image
docker build -t aura-pipeline-service .

# Push to registry
docker tag aura-pipeline-service gcr.io/PROJECT/aura-pipeline-service
docker push gcr.io/PROJECT/aura-pipeline-service

# Deploy to Cloud Run
gcloud run deploy aura-pipeline-api \
  --image gcr.io/PROJECT/aura-pipeline-service \
  --region us-central1 \
  --allow-unauthenticated
```

## Scripts

```bash
npm run dev          # Start dev server with hot reload
npm run build        # Build TypeScript
npm run start        # Start production server
npm run pipeline:daily   # Run full pipeline
npm run pipeline:weather # Weather-only refresh
npm run test         # Run tests
npm run lint         # Lint code
```

## Related Repositories

- [v0-aura-stylist-agent](https://github.com/your-org/v0-aura-stylist-agent) - Frontend application

## License

MIT
