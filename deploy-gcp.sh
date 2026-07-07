#!/usr/bin/env bash
# ---- Edit these 3 lines ----
PROJECT_ID="your-gcp-project-id"
REGION="asia-south1"
SERVICE_NAME="health-mvp-backend"

# ---- Paste your free-tier connection strings here ----
DATABASE_URL="postgresql://USER:PASS@ep-xxxx.neon.tech/health_district_db?sslmode=require"
MONGO_URI="mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/health_clinical_db"
REDIS_URL="rediss://default:PASS@xxxx.upstash.io:6379"

set -e
gcloud config set project "$PROJECT_ID"

# 1. Enable required APIs
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com

# 2. Build the container image (Cloud Build — free tier: 120 build-min/day)
gcloud builds submit --tag "gcr.io/$PROJECT_ID/$SERVICE_NAME"

# 3. Deploy to Cloud Run (free tier: 2M requests/month)
gcloud run deploy "$SERVICE_NAME" \
  --image "gcr.io/$PROJECT_ID/$SERVICE_NAME" \
  --platform managed \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars "DATABASE_URL=$DATABASE_URL" \
  --set-env-vars "MONGO_URI=$MONGO_URI" \
  --set-env-vars "REDIS_URL=$REDIS_URL" \
  --set-env-vars "NODE_ENV=production"

echo "Done. Cloud Run printed your live URL above."
