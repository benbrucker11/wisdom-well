# Wisdom Well

A place where a family keeps its stories, values, and ideals — structured,
searchable, and released to the right person at the right moment.

Built in the phases described in the product brief.

- **Phase 1 — Foundations:** done.
- **Phase 2 — Entries & the release engine:** done.
- Phase 3 (stewardship & succession) and Phase 4 (voice interview) are not
  started. Schema fields they need (`Family.inactivityThresholdDays`,
  `Entry.rawAudioUrl` / `transcriptRaw` / `transcriptStatus`) already exist.

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
npm test        # pure unit suites — no database needed
npm run e2e     # spins up a throwaway Postgres, drives the real release
                # engine through every rule shape (needs the optional
                # embedded-postgres dev dependency)
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
5. `/confirmations` — confirm life events; steward sees the aggregate view.

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

## Verification status

Everything below has been run on this codebase:

- `npm test` — pure unit suites (relationship graph, release engine, visibility)
- `npm run e2e` — full release engine against real Postgres
- `npx tsc --noEmit` and `npx next build` — clean
- manual click-through: sign in → onboarding → create entry → add rule →
  publish → entry shows **Released** / **Received by**, steward aggregate updates

## Stack

Next.js (App Router) · TypeScript · Postgres · Prisma · Tailwind CSS v4 ·
Vitest. Auth is a hand-rolled magic-link flow (opaque session token +
httpOnly cookie) — no third-party auth dependency, no passwords.
