# Wisdom Well — working notes for coding agents

A family-wisdom archive: family tree, entries bound to release rules, a
stewardship line of succession, and a voice-interview capture flow. Built in
four phases (see `README.md`). Next.js App Router + TypeScript + Postgres/Prisma
+ Tailwind v4.

## Conventions

- **Pure core, thin DB wrapper.** The hard logic lives in framework-free,
  heavily-tested modules: `lib/relationships/graph.ts`, `lib/release/engine.ts`
  + `visibility.ts`, `lib/succession/logic.ts`. Their `index.ts` siblings load a
  snapshot, call the pure function, and persist the result. Keep it that way —
  don't put rule logic in route handlers or server actions.
- **Every entry read goes through `visibleEntriesFor` / `visibleEntry`**
  (`lib/release/index.ts`). No page or route queries the `Entry` table
  directly. A gated entry must be *absent*, not hidden-with-a-placeholder.
- **`lib/*` modules imported by `scripts/` and `prisma/seed.ts` must not
  `import "server-only"`** — it throws under plain Node. Auth is the exception
  (never imported by scripts). Use a comment noting the module is server-only in
  practice.
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
raw key in the `Authorization` header (no `Bearer`).

## Anthropic

Reconciliation (`lib/transcription/reconcile.ts`) uses `@anthropic-ai/sdk`,
`new Anthropic()` (resolves the key from the environment), model
`claude-opus-5`, adaptive thinking. It degrades to a mechanical cleanup when no
credential is present. See the `claude-api` skill before changing it.
