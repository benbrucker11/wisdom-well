# Wisdom Well

A place where a family keeps its stories, values, and ideals — structured,
searchable, and released to the right person at the right moment.

This repository is being built in the phases described in the product brief.
**Phase 1 (Foundations) is implemented here.** Nothing from later phases
(entries, the release engine, stewardship succession, the voice interview) is
present yet.

---

## What Phase 1 contains

| Area | Where |
| --- | --- |
| Passwordless auth (email magic link) | `lib/auth.ts`, `lib/mail.ts`, `app/login`, `app/api/auth/*` |
| Family creation / onboarding | `app/onboarding` |
| Member records | `app/family` (add person), `prisma/schema.prisma` |
| Relationship graph (`PARENT_OF` / `SPOUSE_OF` / `SIBLING_OF`) | `prisma/schema.prisma`, `app/family` |
| `resolveRelationship` + `getDescendants` (+ `describeFamilyFrom`) | `lib/relationships/` |
| Relationship-logic tests | `lib/relationships/graph.test.ts` |
| Family tree UI (view, add member, define relationship, "who are X's grandchildren?") | `app/family/page.tsx` |

### Design of the relationship layer

`lib/relationships/graph.ts` is **pure** — it takes a list of asserted edges and
computes everything else. Grandparent, grandchild, aunt, cousin, descendant,
in-law, etc. are **derived by traversal**, never stored. `PARENT_OF` is the only
source of truth for lineage; `SPOUSE_OF` is treated as symmetric; `SIBLING_OF`
is stored as a user-asserted fact but siblings are inferred from shared parents.

`lib/relationships/index.ts` wraps the pure core with the database and exposes
the signatures the rest of the app (and the Phase 2 release engine) will use:

```ts
resolveRelationship(fromMemberId, toMemberId): Promise<string>
getDescendants(memberId, generations): Promise<DescendantMember[]>
```

Because the core is pure, its tests need no database — see
`lib/relationships/graph.test.ts` (five generations, ~30 assertions covering the
Phase 1 "done when" criterion and the full lineal / collateral / in-law matrix).

**Known open question (brief §10):** `getDescendants` follows `PARENT_OF` only,
so adoption and step-relationships are not modelled. Flagged in
`prisma/schema.prisma` and `lib/relationships/graph.ts`.

---

## Running it

> **Note:** this was written on a machine with no Node.js / Postgres toolchain,
> so the commands below have **not been executed here**. They are the standard
> setup; expect to iterate on exact dependency versions on first `npm install`.

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
npx prisma migrate dev --name phase1_foundations   # create + apply the schema
npm run db:seed                                     # optional: 4-generation demo family
```

### 4. Tests (no database required)

```bash
npm test
```

This runs the relationship-logic suite. It is the primary Phase 1 acceptance
check: it proves the app can answer *"who are X's grandchildren?"* and resolves
the full relationship matrix.

### 5. Dev server

```bash
npm run dev
```

Then open <http://localhost:3000>:

1. Enter your email. The sign-in link is printed to the **server console**
   (no SMTP needed locally; set `SMTP_URL` in `.env` for real delivery).
2. Follow the link → create your family (you become the founding Steward).
3. On `/family`: add people, record `parent` / `married to` / `sibling` links,
   then click any person to see the tree from their point of view, including
   their grandchildren.

---

## Phase 1 acceptance

> A user can sign up, create a family, add three generations of members, and the
> app can correctly answer "who are X's grandchildren?"

- Sign up / create family: `app/login` → `app/onboarding`
- Add generations / relationships: `app/family`
- "Who are X's grandchildren?": the **Seen from …** panel on `/family`, and
  `describeFamilyFrom` / `getDescendants` in `lib/relationships`
- Automated proof: `npm test`

## Stack

Next.js (App Router) · TypeScript · Postgres · Prisma · Tailwind CSS v4 ·
Vitest. Auth is a hand-rolled magic-link flow (opaque session token in a
`Session` row + httpOnly cookie) — no third-party auth dependency, no passwords.
