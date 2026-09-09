# Wisdom Well

A place where a family keeps its stories, values, and ideals — structured,
searchable, and released to the right person at the right moment.

Built in the phases described in the product brief.

- **Phase 1 — Foundations:** done.
- **Phase 2 — Entries & the release engine:** done.
- **Phase 3 — Stewardship & succession:** done.
- **Phase 4 — Voice interview:** done.

---

## Phase 1 — Foundations

| Area | Where |
| --- | --- |
| Passwordless auth (email magic link) | `lib/auth.ts`, `lib/mail.ts`, `app/login`, `app/api/auth/*` |
| Family creation / onboarding | `app/onboarding` |
| Member records, dates of birth/death | `app/family`, `prisma/schema.prisma` |
| Relationship graph (`PARENT_OF` / `SPOUSE_OF` / `SIBLING_OF`) | `prisma/schema.prisma`, `app/family` |
| `resolveRelationship` + `getDescendants` (+ `describeFamilyFrom`) | `lib/relationships/` |
| Family tree UI (view, add member, define relationship, "who are X's grandchildren?") | `app/family/page.tsx` |

`lib/relationships/graph.ts` is **pure** — it takes asserted edges and derives
grandparent / grandchild / aunt / cousin / descendant / in-law by traversal,
never storing them. `PARENT_OF` is the only source of truth for lineage;
`SPOUSE_OF` is symmetric (and dropped once `endedAt` is set); siblings are
inferred from shared parents. `PARENT_OF` edges carry a `parentKind` — see
"Open issues from §10" below.

## Phase 2 — Entries & the release engine

| Area | Where |
| --- | --- |
| Entry CRUD (text / image / uploaded video) | `app/entries/`, `app/entries/actions.ts` |
| Media upload + access-gated serving | `app/api/uploads`, `app/api/media/[...key]`, `lib/storage.ts` |
| Release-rule builder UI | `app/entries/_components/rule-builder.tsx` |
| The evaluation engine (pure) | `lib/release/engine.ts` |
| Visibility / `visibleEntriesFor` (pure + DB) | `lib/release/visibility.ts`, `lib/release/index.ts` |
| Daily job | `app/api/cron/evaluate` |
| Event confirmation queue + steward aggregate view | `app/confirmations/` |
| Engine + visibility tests | `lib/release/*.test.ts` |
| End-to-end check against real Postgres | `scripts/e2e-phase2.ts` (`npm run e2e`) |

### How the release engine is built (brief §4)

`lib/release/engine.ts` is an **isolated, pure module** — no database, no
framework. `evaluateReleases(snapshot)` takes members, lineage edges, published
entries, their rules and the recorded event confirmations, and returns the
`(entry, recipient)` pairs that should now have a `Release` row. It is
deterministic and idempotent, and re-run from scratch on every relevant change:

- **entry publish** — fires `IMMEDIATE` rules at once (`publishEntry`);
- **any tree change** — member added, date of birth set, relationship created
  (`app/family/actions.ts`). This is what makes a `ROLE(GRANDCHILD)` rule
  written today fire in thirty years for a grandchild not yet born;
- **event confirmation** — `confirmEvent` in `lib/release/index.ts`;
- **once a day** — `GET/POST /api/cron/evaluate` (protect with `CRON_SECRET`),
  as a backstop for `AGE` and `DATE` triggers crossing their threshold.

`Release` rows are **irreversible** — the engine only ever adds them. There is
no unrelease.

### The visibility boundary (brief §5)

Every read of entries goes through `visibleEntriesFor(memberId)` /
`visibleEntry(memberId, entryId)` in `lib/release/index.ts`. **No page or route
queries the `Entry` table directly.** A gated entry is absent from that list
entirely — no title, no thumbnail, no count. The author always sees their own
drafts and scheduled entries; being the Steward grants nothing here (they get a
content-free aggregate count for succession, and the event queue by label).

### Event triggers

Life events can't be detected automatically, so `EVENT` rules are pending
confirmations. `/confirmations` shows "waiting on: Michael's wedding" to the
Steward (and the living author); confirming records an `EventConfirmation` and
re-evaluates. `DEATH_OF_AUTHOR` is confirmed by recording the author's date of
death.

### Storage

`lib/storage.ts` writes media to local disk by default (`./storage`) so the
prototype runs with no cloud credentials. Setting `S3_BUCKET` switches to
presigned S3 uploads — that path is a single marked seam, not yet implemented.
Raw interview audio, once Phase 4 adds it, is retained permanently (brief §6).

## Phase 3 — Stewardship & succession

| Area | Where |
| --- | --- |
| Succession decision logic (pure) | `lib/succession/logic.ts` |
| Successor list, inactivity detection, transfer flow (DB) | `lib/succession/index.ts` |
| Steward dashboard + successor management UI | `app/steward/` |
| Inactivity processing in the daily job | `app/api/cron/evaluate` |
| Activity tracking + instant "steward came back" | `lib/auth.ts` (`recordActivity`) |
| Logic tests + end-to-end check | `lib/succession/logic.test.ts`, `scripts/e2e-phase3.ts` |

`Family` has an ordered `Successor[]` line (each successor must have a login).
`decideSuccession(state)` is pure and returns exactly one action:

- **INITIATE** — the steward's account has not been seen for
  `inactivityThresholdDays` (default 365) and a successor exists: open a
  `StewardTransfer` and email the steward and the first successor;
- **NONE** — grace period (`successionGraceDays`, default 30) still running;
- **CANCEL** — the steward signed in again (`STEWARD_RETURNED`), declined
  (`STEWARD_DECLINED`), or the line changed under it (`SUPERSEDED`);
- **COMPLETE** — grace elapsed: move `Family.stewardMemberId` to the successor
  and drop them from the line.

The daily job runs this for every family; a steward loading any page cancels a
pending handover immediately; a successor can `assumeStewardship` once the
grace period elapses.

**Completing a handover only changes `Family.stewardMemberId` and the successor
list.** It creates no `Release` rows and does not touch `visibleEntriesFor`, so
the incoming steward gains no access to sealed entries — only the content-free
aggregate view. `scripts/e2e-phase3.ts` asserts the new steward's visible
entries are byte-for-byte unchanged by the transfer.

**Succession beyond the first hop (brief §10):** a named successor must have a
login **and accept** the role (`Successor.acceptedAt`) before the engine will
promote them. When the accepted line is empty, `Family.successionPolicy`
decides: `NAMED_ONLY` stops there; `NAMED_THEN_ELDEST_DESCENDANT` (the default)
falls back to the eldest living descendant of the founder with an account.
Because it is recomputed from scratch every run, it recurses naturally down the
generations. Branch-level stewardship (a member who stewards only their
subtree) is still a v2 model change.

## Open issues from §10 — now addressed

| §10 item | What's built |
| --- | --- |
| Succession beyond the first hop | Successor acceptance + `SuccessionPolicy` eldest-descendant fallback (above) |
| Family splits: divorce, estrangement, half-siblings | Half-siblings already worked (shared parent). `Relationship.endedAt` marks a marriage ended — lineage unaffected, former in-laws drop. `Member.status = DEPARTED` removes someone from future ROLE / IMMEDIATE / ALL_FAMILY releases and the aggregate; an author can still reach them with `SPECIFIC_MEMBER`. Multi-family membership is still deferred. |
| Adoption & step-relationships | `Relationship.parentKind` (`BIOLOGICAL` / `ADOPTIVE` / `STEP` / `GUARDIAN`). Biological and adoptive count as full lineage always; STEP is included by default and can be turned off per rule (`ReleaseRule.includeStepDescendants`); GUARDIAN is never followed for descent. |
| Data durability / export | `GET /api/family/export` — a ZIP of the tree, the line of succession, and every entry the requester can see (via `visibleEntriesFor`) with the original media and audio. Plain JSON + files, no proprietary format. `lib/export/index.ts`. |

## Phase 4 — Voice interview

| Area | Where |
| --- | --- |
| Guided prompt library (7 themes, one open question at a time) | `lib/prompts.ts` |
| In-browser recording (MediaRecorder → upload) | `app/interview/_components/recorder.tsx` |
| AssemblyAI transcription (submit / poll, speaker diarization) | `lib/transcription/assemblyai.ts` |
| Claude reconciliation (raw transcript → entry in the speaker's voice) | `lib/transcription/reconcile.ts` |
| Pipeline orchestration | `lib/transcription/index.ts` |
| Interview UI + draft-and-approve | `app/interview/`, `app/entries/[id]/page.tsx` |
| Routes | `app/api/interview`, `app/api/entries/[id]/transcription` |
| Tests | `lib/prompts.test.ts`, `lib/transcription/reconcile.test.ts`, `scripts/e2e-phase4.ts` |

The flow (spec §6):

1. Record in the browser; the raw audio uploads to storage and is **kept
   permanently** — the recording in the person's own voice is the artifact, the
   transcript is a convenience layer over it, and both are always shown together.
2. An `AUDIO` entry is created as a `DRAFT` with `transcriptStatus = PROCESSING`,
   and the audio is submitted to AssemblyAI (`universal-3-5-pro` →
   `universal-2`, `speaker_labels` on — a second person often chimes in).
3. The interview page polls `/api/entries/[id]/transcription`; the first request
   to see a completed job stores `transcriptRaw`, then asks Claude
   (`claude-opus-5`) to reorganise the rambling account into a readable entry
   **in the speaker's own voice** — explicitly told not to smooth them into
   generic prose and not to add anything they didn't say. `transcriptStatus`
   becomes `DRAFT`.
4. The author sees the cleaned draft beside the raw transcript, edits, and
   **approves**. Nothing is auto-published; `publishEntry` refuses to leave
   `DRAFT` until `transcriptStatus` is `APPROVED`.

Both API keys are server-only (`ASSEMBLYAI_API_KEY`, `ANTHROPIC_API_KEY`),
proxied through server routes. Without `ASSEMBLYAI_API_KEY` the page still
records but doesn't transcribe; without an Anthropic credential reconciliation
falls back to a mechanical cleanup and the author still gets an editable draft.

**Guided prompts (spec §7):** themes are Origins / Hard Times / Work and Craft /
Love and Marriage / What I Believe / Advice I'd Give / Things I Got Wrong. One
concrete open question at a time ("What did your mother do when money was
tight?"), free to skip, free to wander off topic, no progress bar.

---

## Running it

> **Deploying the prototype** (Vercel + Neon + Cloudflare R2 + Resend, all
> free-tier): see [docs/DEPLOY.md](docs/DEPLOY.md).

### 1. Prerequisites

- Node.js 22 (`.nvmrc`)
- A Postgres database. Easiest: `docker compose up -d` (uses `docker-compose.yml`).

### 2. Install & configure

```bash
npm install
cp .env.example .env   # already contains a localhost DATABASE_URL
```

### 3. Database

```bash
npm run db:migrate     # prisma migrate deploy — applies prisma/migrations
npm run db:seed        # optional: a 4-generation demo family
```

(For iterative schema work use `npm run db:migrate:dev`; `npm run db:push` skips
migration files entirely.)

### 4. Tests

```bash
npm test            # pure unit suites — no database needed
npm run e2e         # phases 2 + 3 against a throwaway Postgres (needs the
                    # optional embedded-postgres dev dependency)
npm run e2e:phase3  # just the succession end-to-end check
npm run e2e:phase4  # voice pipeline vs the real AssemblyAI API — needs
                    # ASSEMBLYAI_API_KEY and macOS `say` for the test clip
```

### 5. Dev server

```bash
npm run dev
```

Then open <http://localhost:3000>:

1. Enter your email — the sign-in link is printed to the **server console**
   (set `SMTP_URL` in `.env` for real delivery).
2. Follow the link → create your family (you become the founding Steward).
3. `/family` — add people and relationships; click anyone to see the tree from
   their point of view.
4. `/entries/new` — write an entry, then add release rules and publish it.
5. `/interview` — pick a theme, record against a question, get a draft to edit
   and approve (needs `ASSEMBLYAI_API_KEY`).
6. `/confirmations` — confirm life events.
7. `/steward` — name successors; see the content-free aggregate view.

---

## Acceptance

### Phase 1

> A user can sign up, create a family, add three generations, and the app can
> answer "who are X's grandchildren?"

`app/login` → `app/onboarding` → `app/family`; the **Seen from …** panel and
`getDescendants`. Proof: `npm test` (`lib/relationships/graph.test.ts`).

### Phase 2

> All six rule shapes in §3 work end to end, the hidden-until-release rule holds
> under direct query, and the unborn-grandchild test passes.

Proof: `npm run e2e` drives all six shapes, the unborn-grandchild scenario, the
hidden-under-direct-query check and irreversibility against a real Postgres;
`lib/release/engine.test.ts` and `lib/release/visibility.test.ts` cover the same
logic as fast pure tests.

### Phase 3

> Simulating steward inactivity correctly promotes the first successor without
> exposing any sealed entry content.

Proof: `npm run e2e:phase3` sets the steward's `lastSeenAt` 400 days back, runs
the succession engine through INITIATE → grace → COMPLETE, and asserts the
promoted successor's `visibleEntriesFor` output is unchanged and no `Release`
rows were created. `lib/succession/logic.test.ts` covers every decision branch.

### Phase 4

> A user can speak for five minutes against a guided prompt and end up with an
> editable, approved entry with the original audio attached and playable.

Proof: `npm run e2e:phase4` generates a spoken clip, runs it through the real
AssemblyAI pipeline, and asserts the result is an approvable `DRAFT` whose body
is editable, whose raw transcript recognised the speech, and whose original
audio is byte-for-byte retrievable — with nothing auto-published.

## Verification status

Everything below has been run on this codebase:

- `npm test` — 78 pure unit tests (relationship graph incl. parent-kinds /
  divorce, release engine incl. adoption / step / departed members, visibility,
  succession logic, prompt library, reconciliation fallback)
- `npm run e2e` — release engine (17) + succession incl. acceptance & the
  eldest-descendant policy fallback (25) + data export (11) against real
  Postgres; `npm run e2e:phase4` — voice pipeline (12) against the real
  AssemblyAI API
- `npx tsc --noEmit` and `npx next build` — clean
- manual click-through of every phase, including: record against "What did your
  mother do when money was tight?" → transcript appears beside the draft →
  approve → add rule → publish → **Released** / **Received by**, original audio
  still attached

## Stack

Next.js (App Router) · TypeScript · Postgres · Prisma · Tailwind CSS v4 ·
Vitest · AssemblyAI (`universal-3-5-pro`) · Anthropic (`claude-opus-5`). Auth is
a hand-rolled magic-link flow (opaque session token + httpOnly cookie) — no
third-party auth dependency, no passwords.
