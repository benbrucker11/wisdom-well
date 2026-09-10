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
2. **Set the environment variables *before* the first build.** Site
   configuration → Environment variables → add everything from
   `.env.production` (or `netlify env:import .env.production` with the CLI), plus
   a real `CRON_SECRET`. The build runs `prisma migrate deploy`, so it needs
   `DATABASE_URL` and `DATABASE_DIRECT_URL` present — a build without them fails
   with "environment variable not found". (The migration itself is a no-op if
   the schema is already applied.)
3. `netlify.toml` is committed: build command `npm run build`, the Next.js
   runtime auto-installs, the Prisma client + engines are bundled with the
   functions, and `prisma/schema.prisma` lists the Linux `binaryTargets` Netlify
   needs (`debian-openssl-3.0.x` for the build image, `rhel-openssl-3.0.x` for
   the function runtime).
4. The daily job runs as a **Netlify Scheduled Function**,
   `netlify/functions/daily-tasks.mjs` (`schedule = "0 8 * * *"`), which calls
   `/api/cron/evaluate` with `CRON_SECRET`.
5. Trigger a redeploy.

   *If a build fails at `prisma generate` with "Unknown binaryTarget" — that's
   the stale `PRISMA_CLI_BINARY_TARGETS` env var; it must not be set. If a
   function errors at runtime with "Query engine library ... not found", add the
   matching target to `binaryTargets` in the schema and redeploy.*

   **Function timeout:** Netlify's free tier caps serverless functions at 10 s.
   The voice pipeline is built for this — an entry becomes an **editable
   mechanical draft within a couple of seconds**, and the slower Claude polish
   happens best-effort inline, via the "Polish with AI" button, and via the
   daily job (`reconcilePendingDrafts`). So voice entries always work; the
   AI-cleaned version may land a moment (or a day) later. Netlify Pro raises the
   limit to 26 s, enough for the inline polish to usually finish on the spot.

---

## Not getting the sign-in email?

Every sign-in link is also written to the deploy's function logs — grab it from
there to get in immediately (Netlify: **Logs → Functions**; Vercel:
**the deployment → Functions / Runtime Logs**). Look for:

```
✦ Wisdom Well sign-in link for you@example.com
    https://your-site/api/auth/callback?token=...
```

The `[mail] ... delivered=<true|false> via=<resend|smtp|none> — <detail>` line
just above it tells you what happened:

- `via=none` → `RESEND_API_KEY` isn't set on the host. Add it (and `MAIL_FROM`),
  then redeploy.
- `via=resend delivered=false` → Resend rejected it. `restricted_api_key` on a
  *list* call is normal (the key is send-only); a `validation_error` /
  `403` here usually means you're sending to an address that isn't the Resend
  account owner while still on `onboarding@resend.dev` — verify a domain.
- `delivered=true` but nothing in the inbox → check spam. Gmail is aggressive
  about the shared `onboarding@resend.dev` sender; verifying your own domain in
  Resend and pointing `MAIL_FROM` at it fixes deliverability.

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
