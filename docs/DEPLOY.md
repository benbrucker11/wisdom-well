# Deploying the prototype

Free-tier stack: **Neon** (Postgres) + **Cloudflare R2** (media) + **Resend**
(email) + a host for the Next.js app — **Vercel** or **Netlify**, both work.

Steps 1–5 are host-independent. Step 6 is Vercel; step 7 is Netlify — do one.

---

## 1. Postgres — Neon

Create a project at [neon.tech](https://neon.tech). Copy **two** connection
strings from the dashboard:

- the **pooled** string → `DATABASE_URL`
- the **direct** (unpooled) string → `DATABASE_DIRECT_URL`

Prisma uses the pooled one at runtime and the direct one for migrations
(`prisma/schema.prisma` declares both).

## 2. Media — Cloudflare R2

1. Cloudflare dashboard → R2 → create a **private** bucket, e.g.
   `wisdom-well-media`.
2. R2 → Manage API Tokens → create an **S3-compatible** token with Object Read
   & Write on that bucket. It gives you an Access Key ID and Secret Access Key.
3. Set:
   ```
   S3_BUCKET=wisdom-well-media
   S3_REGION=auto
   S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com   # account URL, no bucket
   S3_ACCESS_KEY_ID=<...>
   S3_SECRET_ACCESS_KEY=<...>
   ```
   `lib/storage.ts` switches to the S3 driver when `S3_BUCKET` is set. Files are
   still served through `/api/media/<key>`, which re-checks visibility per
   entry — so the bucket stays private.

## 3. Email — Resend

1. [resend.com](https://resend.com) → create an API key → `RESEND_API_KEY`.
2. `MAIL_FROM` defaults to `Wisdom Well <onboarding@resend.dev>`.

   **Sandbox limit:** with the `onboarding@resend.dev` sender, Resend only
   delivers to the email that owns the Resend account. That's fine while you're
   the only tester. Before real family members can sign in, verify a domain in
   Resend and set `MAIL_FROM` to an address on it.

   Either way, every sign-in link and succession notice is also printed to the
   server logs, so you can always retrieve one.

## 4. Anthropic — voice reconciliation

1. [console.anthropic.com](https://console.anthropic.com) → **Billing → add
   credits** ($5 minimum, prepaid).
2. **API Keys → Create Key** → `ANTHROPIC_API_KEY`.

Cost per entry: ~$0.02–0.04. Without the key, transcripts get a mechanical
cleanup and the "Polish with AI" button on the entry does nothing.

## 5. AssemblyAI

Key from
[assemblyai.com/dashboard/api-keys](https://www.assemblyai.com/dashboard/api-keys)
→ `ASSEMBLYAI_API_KEY`.

---

## 6. Host on Vercel

1. Push the repo to GitHub, import it in Vercel.
2. **Project → Settings → Environment Variables** — add everything from
   `.env.production` (there's an "Import .env" button), and set a real
   `CRON_SECRET` (any long random string).
3. Build command stays `npm run build`
   (`prisma generate && prisma migrate deploy && next build` — migrations apply
   at deploy time). Use `npm run build:app` if you'd rather migrate by hand.
4. `vercel.json` already schedules the daily job:
   ```json
   { "crons": [{ "path": "/api/cron/evaluate", "schedule": "0 8 * * *" }] }
   ```
   Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.
5. Deploy.

## 7. Host on Netlify

1. Push the repo to GitHub, "Add new site → Import from Git" in Netlify.
2. **Site configuration → Environment variables** — add everything from
   `.env.production` (or `netlify env:import .env.production` with the CLI), plus
   a real `CRON_SECRET`.
3. `netlify.toml` is committed: build command `npm run build`, the Next.js
   runtime is auto-installed, and Prisma's engine is bundled with the
   functions.
4. The daily job runs as a **Netlify Scheduled Function**,
   `netlify/functions/daily-tasks.mjs` (`schedule = "0 8 * * *"`), which calls
   `/api/cron/evaluate` with `CRON_SECRET`.
5. Deploy.

   **Function timeout:** Netlify's free tier caps serverless functions at 10 s.
   The voice pipeline is built for this — an entry becomes an **editable
   mechanical draft within a couple of seconds**, and the slower Claude polish
   happens best-effort inline, via the "Polish with AI" button, and via the
   daily job (`reconcilePendingDrafts`). So voice entries always work; the
   AI-cleaned version may land a moment (or a day) later. Netlify Pro raises the
   limit to 26 s, enough for the inline polish to usually finish on the spot.

---

## Verify a deploy

1. Open the site → enter your email → follow the link from the log (or your
   inbox) → create your family.
2. `/family` — add people and relationships.
3. `/entries/new` — write, add a rule, publish.
4. `/interview` — record against a prompt, watch it become a draft.
5. Hit the daily job once by hand:
   ```bash
   curl -X POST https://<your-site>/api/cron/evaluate -H "authorization: Bearer $CRON_SECRET"
   ```

## Local development

```bash
npm install
cp .env.example .env          # set DATABASE_URL and DATABASE_DIRECT_URL to the same local value
docker compose up -d          # or Postgres.app
npm run db:migrate
npm run dev
```

`npm run e2e` (needs the optional `embedded-postgres` dev dep) exercises the
release engine, succession engine, and export builder against a throwaway
Postgres. `npm run e2e:phase4` additionally hits the real AssemblyAI (and
Claude, if `ANTHROPIC_API_KEY` is set).
