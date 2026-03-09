# Soul Verify

Mention-driven content verification. SOUL evaluates origin, metadata, and manipulation signals and generates a public provenance report.

## Local Development

### Prerequisites
- Node.js 20+
- Docker (for Postgres + Redis)
- ffmpeg (optional — `brew install ffmpeg`)

### Setup

```bash
npm install
docker-compose up -d
cp .env.example .env
npm run db:migrate   # enter "init" when prompted
npm run dev:all      # starts Next.js app + worker together
```

App: http://localhost:3000

### Commands

```bash
npm run dev          # Next.js only
npm run worker       # worker only
npm test             # run tests
npm run db:migrate   # create/run migrations
npm run db:generate  # regenerate Prisma client after schema changes
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | Postgres connection string |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis |
| `STORAGE_PROVIDER` | No | `local` | `local` or `s3` |
| `LOCAL_STORAGE_PATH` | No | `./uploads` | Local storage dir |
| `NEXT_PUBLIC_APP_URL` | No | `http://localhost:3000` | Public URL for report links |
| `AWS_ACCESS_KEY_ID` | S3 only | — | |
| `AWS_SECRET_ACCESS_KEY` | S3 only | — | |
| `S3_BUCKET` | S3 only | — | |
| `ANTHROPIC_API_KEY` | No | — | Optional LLM summarization (future) |
| `THREADS_WEBHOOK_SECRET` | No | — | HMAC for Threads webhooks |
| `TWITTER_WEBHOOK_SECRET` | No | — | HMAC for Twitter webhooks |
| `INSTAGRAM_WEBHOOK_SECRET` | No | — | HMAC for Instagram webhooks |

---

## Architecture

```
app/page.tsx                         Home: URL input + file upload
app/status/[id]/page.tsx             Job polling → redirects to report
app/r/[token]/page.tsx               Public report page
app/api/jobs/route.ts                POST: create job
app/api/jobs/[id]/route.ts           GET: job status
app/api/reports/[token]/route.ts     GET: report data
app/api/webhooks/[provider]/route.ts Webhook ingestion

lib/verify/pipeline.ts    Verification orchestrator
lib/scoring/engine.ts     Deterministic verdict scoring
lib/media/hash.ts         SHA-256 + perceptual hashing
lib/media/exif.ts         EXIF extraction
lib/media/video.ts        ffmpeg frame extraction
lib/storage/index.ts      Local/S3 abstraction
lib/providers/            Threads, Twitter, Instagram adapters
lib/provenance/index.ts   Soul signature (V1 placeholder)
lib/queue/index.ts        BullMQ queue
worker/index.ts           Background worker process
```

---

## Verdict Scale

| Verdict | Meaning |
|---|---|
| Signed Original | Valid Soul provenance signature |
| Likely Original | Strong metadata + hash uniqueness |
| Likely Repost | Duplicate or near-duplicate found |
| Manipulated / Edited | Editing software or visual near-match |
| Likely AI-Generated | AI generation software tag |
| Insufficient Evidence | Not enough signals |

SOUL does not claim absolute truth. Confidence scores (0–100) express weight of evidence.

---

## Provider Integration

| Provider | Webhook | Signature | Reply |
|---|---|---|---|
| Threads | POST /api/webhooks/threads | HMAC-SHA256 | Mock |
| Twitter/X | POST /api/webhooks/twitter | HMAC-SHA256 + CRC | Mock |
| Instagram | POST /api/webhooks/instagram | HMAC-SHA256 | Mock |

Set the webhook secret env vars to activate signature verification.

---

## Deployment

**App (Vercel):** Push to GitHub, import in Vercel, set env vars.

**Worker (Railway/Render):** Deploy as a background service running `npm run worker:prod`.

**Database:** `DATABASE_URL=<prod_url> npx prisma migrate deploy`

---

## Next Steps

1. Implement `postReply()` in `lib/providers/threads.ts` with a real Threads access token
2. Set `STORAGE_PROVIDER=s3` for production media storage
3. Plug in an AI detection model via the `aiSuspicionScore` field in `ScoringInput`
4. Implement Soul provenance signatures in `lib/provenance/index.ts` (C2PA or Ed25519)
5. Add Open Graph meta tags to `/r/[token]` for rich social sharing previews
