# Wisdom Well — working notes for coding agents

A family-wisdom archive: family tree, entries bound to release rules, a
stewardship line of succession, and a voice-interview capture flow. Built in
four phases (see `README.md`). Next.js App Router + TypeScript + Postgres/Prisma
+ Tailwind v4.

## Sandbox and release workflow (read first, every session)

Three people (Ben, Jared, Gabe) change this site, usually through Claude Code.
Follow this for every change.

**How it's wired**
- The live site deploys from `main` on Netlify. A merge to `main` goes live
  within minutes, and its build runs `prisma migrate deploy` against the
  **live** database.
- Every pull request gets a Netlify Deploy Preview
  (`https://deploy-preview-<PR#>--<site>.netlify.app`) that runs against a
  separate **sandbox** database, R2 bucket and keys. Previews can't touch live
  data. Each push to the branch rebuilds the preview.
- `main` is protected: no direct pushes, every change needs a pull request with
  1 approval from someone other than the author.
- Only Ben merges into `main`. He batches merges because Netlify's free plan
  allows about 20 live deploys a month, and running out pauses the live site.

**Per change**
1. Branch from the latest `main`, one feature or fix per branch. Never commit
   or push to `main`.
2. Before pushing: `npm test` and `npx tsc --noEmit`. Fix failures; never skip,
   disable or loosen a test to get green.
3. Ask the user before opening the pull request into `main`.
4. In the PR description, include a **Changes** section in plain language
   (family members read it), using only the headings that apply: **Added**,
   **Changed**, **Fixed**, **Removed**, **Behind the scenes**. Ben copies it into
   the revision history.
5. Give the user the Deploy Preview link (Netlify posts it on the PR) and say
   exactly what to click through to test the change.
6. A different person reviews and approves. Ben merges.

**Testing on a preview**
- Sign up with email + password and use made-up data; the sandbox only holds
  fake families. Sandbox email only reaches Ben, so don't depend on email links.
- AI cleanup and transcription may be off in the sandbox. That's expected.

**Never**
- Push to `main`, merge a PR, force-push, or rewrite someone else's branch.
- Put API keys, passwords, connection strings or other secrets in code,
  commits or PR text. Secrets live only in Netlify, which Ben manages.
- Add real family names, photos or personal details. The repo is public.

**Database migrations (`prisma/migrations/`)**
- Say so plainly to the user and at the top of the PR description.
- Only one open PR with a migration at a time across all three people. Ask the
  user to check with the others first.
- Never edit a migration after its preview has built (the sandbox already
  applied it); add a new migration instead. A "modified after applied" build
  error means Ben needs to reset the sandbox; stop and tell the user.
- On merge it runs on the live database and can't be undone with a click, so
  keep migrations small and additive.

## Conventions

- **Pure core, thin DB wrapper.** The hard logic lives in framework-free,
  heavily-tested modules: `lib/relationships/graph.ts`, `lib/release/engine.ts`
  + `visibility.ts`, `lib/succession/logic.ts`. Their `index.ts` siblings load a
  snapshot, call the pure function, and persist the result. Keep it that way —
  don't put rule logic in route handlers or server actions.
- **Lineage rules** (spec §10): `Relationship.parentKind` — BIOLOGICAL +
  ADOPTIVE are always lineage, STEP is opt-out per rule
  (`ReleaseRule.includeStepDescendants`), GUARDIAN is never lineage.
  `Member.status = DEPARTED` and `Relationship.endedAt` (divorce) are handled in
  `buildGraph` / `candidateRecipientIds`. `Family.successionPolicy` drives the
  eldest-descendant fallback in `lib/succession/index.ts`.
- **Storage** (`lib/storage.ts`): local disk by default; set `S3_BUCKET` (+ R2
  creds) to switch to S3-compatible. Files are always served through
  `/api/media/<key>`, which re-checks visibility — never expose the bucket
  publicly.
- **Every entry read goes through `visibleEntriesFor` / `visibleEntry`**
  (`lib/release/index.ts`). No page or route queries the `Entry` table
  directly. A gated entry must be *absent*, not hidden-with-a-placeholder.
- **`lib/*` modules imported by `scripts/` and `prisma/seed.ts` must not
  `import "server-only"`** — it throws under plain Node. Auth is the exception
  (never imported by scripts). Use a comment noting the module is server-only in
  practice.
- **Prompt library** (`lib/prompts.ts`): buckets → subtopics → questions, the
  reviewed source is `docs/specs/prompt-library-draft.md`. `gentle` buckets
  (Loss) and `optional` ones (Politics) are never suggested unprompted. Wisdom
  records `promptBucket` / `promptSubtopic` / `promptId`; resolve them through
  `resolvePromptContext` in `lib/wisdom.ts` for written and recorded wisdom alike.
- **Auth** is email + password (`lib/password.ts`, scrypt), with emailed links
  kept as a fallback. `MagicLinkToken.purpose` decides where a link lands.
  `requireMember` sends invitees to `/welcome` until `detailsConfirmedAt`.
- **Tree edits are steward-only** (`requireStewardMember` in
  `app/family/actions.ts`). `CUSTOM` relationships are labels only — never
  lineage; `buildGraph` ignores them.
- **Recordings**: `rawAudioUrl` holds the voice *or* video recording
  (`raw-audio/` vs `raw-video/` keys); `mediaUrl` is an attachment rendered by
  file type. With S3 set, uploads are direct (signed PUT) and `/api/media`
  redirects to a signed GET after the visibility check.
- The dashboard must never reveal that someone added wisdom the viewer can't
  see — family news is people, dates, and family prompts only.
- Tests: `npm test` is pure and needs no DB. `npm run e2e` drives the real
  engines against a throwaway Postgres (`embedded-postgres`).
- Secrets (`ASSEMBLYAI_API_KEY`, `ANTHROPIC_API_KEY`, SMTP, S3) are proxied
  through server routes and never reach the browser.

## AssemblyAI

Before writing or changing AssemblyAI code, fetch
`https://www.assemblyai.com/docs/llms.txt` (narrow with `?lang=typescript`) —
the API has changed; do not rely on memorized parameter names. Current usage
lives in `lib/transcription/assemblyai.ts`: the `assemblyai` Node SDK,
`transcripts.submit()` (non-blocking) + `transcripts.get()` (poll),
`speech_models: ["universal-3-5-pro", "universal-2"]`, `speaker_labels: true`,
raw key in the `Authorization` header (no `Bearer`). `submitTranscription`
takes bytes or an https URL (signed R2 link) — the SDK sends a URL string as
`audio_url`.

## Anthropic

Reconciliation (`lib/transcription/reconcile.ts`) uses `@anthropic-ai/sdk`,
`new Anthropic()` (resolves the key from the environment), model
`claude-opus-5`, adaptive thinking. It degrades to a mechanical cleanup when no
credential is present. Question generation (`lib/prompt-generation.ts`) uses
`claude-opus-5-5` at low effort with structured output and server-side
refusal fallbacks (`fallbacks: "default"`), and falls back to the sample list.
See the `claude-api` skill before changing either.
