# Wisdom Well

A place where a family keeps its stories, values, and ideals — structured,
searchable, and released to the right person at the right moment.

Built in the phases described in the product brief.

- **Phase 1 — Foundations:** done.
- **Phase 2 — Entries & the release engine:** done.
- **Phase 3 — Stewardship & succession:** done.
- Phase 4 (voice interview) is not started. Schema fields it needs
  (`Entry.rawAudioUrl` / `transcriptRaw` / `transcriptStatus`) already exist.

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
`SPOUSE_OF` is symmetric; siblings are inferred from shared parents.

**Known open question (brief §10):** `getDescendants` follows `PARENT_OF` only,
so adoption and step-relationships are not modelled. Flagged in the schema and
`graph.ts`.

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

**Known open question (brief §10):** this handles one clean transfer.
Succession several generations out with branching families is unresolved;
single-family is assumed.

---

## Running it

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
5. `/confirmations` — confirm life events.
6. `/steward` — name successors; see the content-free aggregate view.

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

## Verification status

Everything below has been run on this codebase:

- `npm test` — 57 pure unit tests (relationship graph, release engine,
  visibility, succession logic)
- `npm run e2e` — release engine (17) + succession (21) against real Postgres
- `npx tsc --noEmit` and `npx next build` — clean
- manual click-through: sign in → onboarding → create entry → add rule →
  publish (**Released** / **Received by**); name a successor → simulate
  inactivity → daily job opens a handover → heir sees the pending banner →
  `assumeStewardship` promotes them; steward loading a page auto-cancels a
  pending handover

## Stack

Next.js (App Router) · TypeScript · Postgres · Prisma · Tailwind CSS v4 ·
Vitest. Auth is a hand-rolled magic-link flow (opaque session token +
httpOnly cookie) — no third-party auth dependency, no passwords.
