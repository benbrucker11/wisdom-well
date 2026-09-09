# Deploying the prototype

Recommended free-tier stack: **Vercel** (app) + **Neon** (Postgres) +
**Cloudflare R2** (media) + **Resend** (email). All have real free tiers; an
idle prototype costs nothing.

Single-vendor alternative: **Railway** — one project holds the app, a Postgres
add-on, and a persistent volume, so the local-disk storage driver keeps working
and you can skip the R2 step. ~$5/month once the trial credit runs out.

---

## 1. Postgres — Neon

1. Create a project at [neon.tech](https://neon.tech) (no card).
2. From the dashboard, copy **two** connection strings:
   - the **pooled** string → `DATABASE_URL`
   - the **direct** (unpooled) string → `DATABASE_DIRECT_URL`
   Prisma uses the pooled one at runtime and the direct one for migrations
   (`prisma/schema.prisma` declares both).

## 2. Media — Cloudflare R2

1. In the Cloudflare dashboard → R2 → create a bucket, e.g. `wisdom-well-media`.
   Keep it **private**.
2. R2 → Manage API Tokens → create a token with **Object Read & Write** scoped
   to that bucket.
3. Set:
   ```
   S3_BUCKET=wisdom-well-media
   S3_REGION=auto
   S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   S3_ACCESS_KEY_ID=<token access key id>
   S3_SECRET_ACCESS_KEY=<token secret>
   ```
   `lib/storage.ts` switches to the S3 driver as soon as `S3_BUCKET` is set.
   Files are still served through `/api/media/<key>`, which enforces the same
   visibility gate as the entry — so the bucket stays private.

## 3. Email — Resend

1. Create an account at [resend.com](https://resend.com), verify a sending
   domain (or use their onboarding sandbox domain for testing).
2. Create an API key, then set:
   ```
   SMTP_URL=smtp://resend:<API_KEY>@smtp.resend.com:587
   MAIL_FROM=Wisdom Well <no-reply@yourdomain.com>
   ```
   Without `SMTP_URL`, sign-in links and succession notices only print to the
   server log — fine locally, useless in production.

## 4. Anthropic (voice reconciliation)

1. [console.anthropic.com](https://console.anthropic.com) → create an org →
   **Billing → add credits** (minimum $5, prepaid, no subscription).
2. **API Keys → Create Key.** Copy it once.
3. Set `ANTHROPIC_API_KEY`. `lib/transcription/reconcile.ts` picks it up
   automatically; without it, transcripts get a mechanical cleanup instead.

Cost: reconciling a ~5-minute transcript with `claude-opus-5` is roughly
$0.03–0.05. To cut that ~2.5×, change the model in `reconcile.ts` to
`claude-sonnet-5`.

## 5. AssemblyAI

Key at [assemblyai.com/dashboard/api-keys](https://www.assemblyai.com/dashboard/api-keys).
Set `ASSEMBLYAI_API_KEY`. Free credit covers plenty of testing.

## 6. Deploy on Vercel

1. Push the repo to GitHub, import it in Vercel.
2. **Project → Settings → Environment Variables** — add everything above plus:
   ```
   CRON_SECRET=<a long random string>
   ```
   Vercel sends this automatically as `Authorization: Bearer $CRON_SECRET` to
   the cron route.
3. The default build command is `npm run build`, which runs
   `prisma generate && prisma migrate deploy && next build` — migrations apply
   at deploy time against Neon. (If you'd rather run migrations by hand, set the
   build command to `npm run build:app` and run `npm run db:migrate` yourself.)
4. `vercel.json` already registers the daily job:
   ```json
   { "crons": [{ "path": "/api/cron/evaluate", "schedule": "0 8 * * *" }] }
   ```
   It re-evaluates release rules **and** processes stewardship succession.
5. `app/api/entries/[id]/transcription/route.ts` and
   `app/api/family/export/route.ts` set `maxDuration = 60` so the inline Claude
   call / ZIP build don't hit the default function timeout.

Deploy, then smoke-test: sign in → onboarding → `/family` → `/entries/new` →
`/interview` → publish.

## Local development

```bash
npm install
cp .env.example .env          # set both DATABASE_URL and DATABASE_DIRECT_URL to the same local value
docker compose up -d          # or Postgres.app
npm run db:migrate
npm run dev
```

`npm run e2e` (needs the optional `embedded-postgres` dev dep) spins up a
throwaway Postgres and exercises the real release engine, succession engine, and
export builder. `npm run e2e:phase4` additionally hits the real AssemblyAI API.
