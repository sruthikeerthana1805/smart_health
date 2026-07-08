# Smart Health — NTR District MVP

Real-time closed-loop backend + demo console for public health facilities (PHC/CHC) in NTR District, Vijayawada. Built for the "Build with AI: Code for Communities" Hackathon (Track 3: Smart Health).

Digitizes the patient journey end-to-end to solve 5 operational problems: medicine stock-outs, unmanaged patient footfall, bed unavailability, unpredictable doctor attendance, and zero district-level visibility.

## Stack

- **Backend**: Node.js, Express, TypeScript
- **REST**: patient loop, staff attendance, beds, inventory, queue pull
- **GraphQL**: district admin dashboard (`/api/graphql`)
- **WebSocket** (Socket.IO): live inventory/queue/bed/staff push updates
- **PostgreSQL** (via Prisma): facilities, inventory, expiry batches, beds, staff
- **MongoDB** (via Mongoose): patients, visits (clinical/unstructured data)
- **Redis**: live doctor/pharmacy queues, geofence attendance tracking
- **n8n**: mock cron automation for low-stock reorder alerts
- **Frontend**: single-page demo console (`public/index.html`) — WhatsApp/Messenger-style UI, no build step, served directly by Express

## Quickstart

```bash
cp .env.example .env      # fill in DATABASE_URL, MONGO_URI, REDIS_URL
npm install
npx prisma generate
npx prisma migrate reset  # creates tables + auto-seeds demo data
npm run dev                # http://localhost:4000
```

Open **http://localhost:4000** — that's the full demo console (Nurse / Doctor / Admin / Pharmacy Inventory), no separate frontend to deploy.

## Deployment (Render) — current production setup

Live URL: your Render backend URL (visible on your Render service dashboard)

Services on Render:

| Service | Type |
|---|---|
| smart-health-backend | Docker web service (Express + GraphQL + Socket.io) |
| smart-health-db | PostgreSQL (Prisma) |
| smart-health-redis | Redis — queues, geofence |
| MongoDB | External (MongoDB Atlas) |

Required environment variables on the `smart-health-backend` service (set actual values in Render dashboard → Environment, never commit them to git):

| Variable | Purpose |
|---|---|
| DATABASE_URL | PostgreSQL connection string (Prisma) |
| MONGO_URI | MongoDB Atlas connection string |
| REDIS_URL | Redis connection string |
| GEMINI_API_KEY | (optional) enables live AI forecasts |
| PORT | 8080 (set automatically via Dockerfile) |

After changing any env var, redeploy manually from the Render dashboard (Manual Deploy → Deploy latest commit).

Run migrations/seed once against the same `DATABASE_URL`:

```bash
npx prisma migrate deploy
npx prisma db seed
```

Verify:

```bash
curl https://<your-render-url>/health
# {"status":"ok"}
```

Frontend (Vercel) talks to this backend via `VITE_API_BASE_URL` / `VITE_GRAPHQL_URL` / `VITE_WS_URL` — see the frontend repo's README for those values.

## Demo data (seeded)

| Thing                          | ID                                     |
| ------------------------------ | -------------------------------------- |
| Facility (PHC)                 | `PHC-GOVERNORPET`                      |
| Facility (CHC)                 | `CHC-VIJAYAWADA`                       |
| Doctor (checked out)           | `DOC-001`                              |
| Doctor (present)               | `DOC-002`                              |
| Doctor (CHC)                   | `DOC-003`                              |
| Drug — normal stock            | `dolo_650`                             |
| Drug — low stock + near-expiry | `amoxyclav_625`                        |
| Drug — near-expiry only        | `pantop_40`                            |
| Bed — free                     | `BED-QR-001`                           |
| Bed — occupied                 | `BED-QR-003`                           |
| Pre-seeded patient             | Lakshmi Devi (already in doctor queue) |

Seed script is safe to re-run (`npx prisma db seed`) — uses upsert, won't crash on duplicates.

## The patient loop — Aadhaar-driven, not Visit-ID driven

Nobody in the flow needs to know or type a Visit ID. Every step resolves the patient's **current active visit** automatically from their Aadhaar number (SHA-256 hashed before storage — raw Aadhaar numbers are never persisted).

1. **Nurse registers** — `POST /api/visits/register` — checks `GET /api/visits/status/:aadhaar_number` first to avoid duplicate registration, then creates the visit and pushes it onto the Redis doctor queue.
2. **Doctor calls next patient** — `GET /api/queue/doctor/:facilityId/next` (FIFO pop) — then diagnoses via `PUT /api/visits/by-aadhaar/:aadhaar_number/diagnose`, which decrements a rapid-test kit from Postgres immediately if ordered, and pushes to the pharmacy queue.
3. **Pharmacy dispenses** — `GET /api/queue/pharmacy/:facilityId/next`, then `POST /api/visits/by-aadhaar/:aadhaar_number/dispense` — runs a single Postgres transaction (all drugs decrement, or none do), marks the visit COMPLETED, and emits a WebSocket inventory update.
4. **Admin sees everything live** — `POST /api/graphql` `facilityDashboard` query aggregates Postgres (stock, beds, staff) + Redis (live queue lengths) in one response; WebSocket events (`inventory_update`, `queue_update`, `bed_update`, `staff_update`, `staff_absent_alert`) push changes to the dashboard as they happen.

Legacy Visit-ID routes (`PUT /:id/diagnose`, `POST /:id/dispense`) still work underneath for compatibility, but the UI only uses the Aadhaar-based ones.

## Doctor attendance & geofencing

- `POST /api/staff/:id/login` / `logout` — QR-scan check-in/out
- `POST /api/staff/:id/geofence-ping` — mobile app pings periodically with lat/lng; if a doctor drifts outside the facility's geofence radius for **30+ continuous minutes**, they're auto-marked absent and a `staff_absent_alert` WebSocket event fires to the dashboard. Uses Haversine distance + a Redis timer key, no polling cron needed.

## Beds

- `POST /api/beds/:qrCodeHash/assign` (body: `{ aadhaar_number }`) / `release` — QR-scan bed assignment, now linked to the occupying patient's hashed Aadhaar
- `GET /api/beds/by-aadhaar/:aadhaar_number` — find which bed a patient currently occupies

## Inventory & expiry tracking

- `GET /api/inventory/:facilityId` — every drug at a facility with current stock, low-stock flag, nearest batch expiry date, and an expiry alert if a batch expires within 30 days
- `GET /api/inventory/drug/:drugId/batches` — all expiry batches for one drug
- `POST /api/inventory/drug/:drugId/batches` — receive a new stock batch (also bumps total stock)
- Same `daysToExpiry` / `expiryAlert` fields are exposed in the GraphQL dashboard

## Role-based views (hierarchy)

Data exposure is scoped to what each role actually needs:

- **Nurse** — `GET /api/summary/:facilityId` returns **counts only**: patients in process, beds available/total, doctors present/total, low-stock alert count. No drug names, no expiry detail — that's a deliberate hierarchy boundary, not an oversight.
- **Doctor** — sees their own attendance state and whoever the queue hands them next; no district-wide visibility.
- **Admin** — full drill-down: `GET /api/inventory/:facilityId` (every drug, stock, expiry batches), `GET /api/forecast/:facilityId/:drugId` (AI demand forecast), the full GraphQL dashboard, and the live WebSocket event feed.

## AI demand forecasting (Gemini)

`GET /api/forecast/:facilityId/:drugId` — aggregates the last 14 days of dispense history (`DispenseLog`, written automatically every time a prescription is dispensed) into daily usage counts, then asks Gemini for a 2-sentence forecast + reorder recommendation.

- Set a real `GEMINI_API_KEY` in `.env` (locally) or in Render's Environment settings (production) to get live AI-generated insights.
- If the key is missing/placeholder, or the Gemini call fails, it **automatically falls back** to a simple moving-average estimate ("stock lasts ~N more days") — the feature degrades gracefully instead of breaking the demo.
- Exposed in the Admin tab of the console under "AI demand forecast."

## n8n automation

Import `docker/n8n-reorder-alert-workflow.json` into n8n (`http://localhost:5678`) — polls the GraphQL dashboard every 15 minutes and flags any drug below its buffer for a reorder alert.

## Deployment (Google Cloud Run — free tier, alternative)

Compute runs on Cloud Run; all three data stores are external free-tier services, so there's no VPC/Cloud SQL Proxy setup needed.

**1. Provision the free-tier data stores:**

- **Neon** (neon.tech) — free serverless Postgres → copy the connection string as `DATABASE_URL`
- **MongoDB Atlas** (mongodb.com/atlas) — free M0 cluster → allow access from `0.0.0.0/0` under Network Access → copy connection string as `MONGO_URI`
- **Upstash** (upstash.com) — free Redis → copy the `rediss://` URL as `REDIS_URL`

**2. Set up GCP:**

```bash
gcloud init                                  # log in, select/create a project
gcloud auth application-default login
```

**3. Edit `deploy-gcp.sh`** — fill in `PROJECT_ID`, `DATABASE_URL`, `MONGO_URI`, `REDIS_URL` at the top of the file (this file is local only — don't commit real secrets to git).

**4. Deploy:**

```bash
chmod +x deploy-gcp.sh
./deploy-gcp.sh
```

This builds the Docker image via Cloud Build and deploys to Cloud Run, printing a public HTTPS URL when done.

**5. Run migrations once, against the same `DATABASE_URL`, from your machine:**

```bash
npx prisma migrate deploy
npx prisma db seed
```

**6. Verify:**

```bash
curl https://<your-cloud-run-url>/health
# {"status":"ok"}
```

The full demo console is served at the same URL — no separate frontend deploy step.

**Cost:** $0 within each free tier (Neon 0.5GB, Atlas 512MB, Upstash 10k commands/day, Cloud Run 2M requests/month) — comfortable for a hackathon demo's traffic.

## Scope notes

- **OTP session tokens** — the original spec calls for Redis-backed OTP verification. The Redis key helper (`otpKey`) exists but the actual send/verify flow was **deliberately deferred** for this build; identity is currently confirmed via Aadhaar number only. Straightforward to add on top of the existing Redis layer.

## Project structure
