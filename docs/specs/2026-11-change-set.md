# Wisdom Well — November 2026 change set (spec for review)

Status: **draft — awaiting approval.** Nothing here is built yet. Decisions
already made in conversation are recorded as *Decided*; anything still open is
marked **OPEN** and collected in the last section.

Companion file: [`prompt-library-draft.md`](./prompt-library-draft.md) — the
merged prompt buckets with draft questions.

---

## 1. Brand header + public landing page

### Header
- Replace the 168px horizontal lockup (tagline unreadable) with **symbol +
  wordmark-only** (`09_Wisdom_Well_Wordmark_Only_Transparent.png`) side by side.
  The tagline moves to the landing-page hero where it can be read.
- Use the supplied files as-is — no recoloring or rebuilding from text (logo
  package rules).
- Note: in the package preview sheet, the dark/monochrome versions (05, 06, 07)
  appear to carry boxed, grainy backgrounds. I'll check the actual files before
  using any of them; the current footer keeps the existing reversed logo unless
  the new one is clean.

### Landing page (`/`, public)
Signed-in users go straight to the dashboard (§8). Everyone else sees:

1. **Hero** — stacked logo, tagline "Keep close what matters most.", one line:
   *"Your family's stories, values, and hard-won wisdom — recorded in your own
   voice and passed to the right person at the right moment."*
   Buttons: **Start your family's well** (sign up) · **Sign in**.
2. **How it works** — three steps:
   - **Answer a prompt.** Pick a question — about your parents, your faith,
     money, the hard years — and write it, say it, or film it. Two minutes or
     two hours.
   - **Decide who receives it, and when.** Now, on a grandchild's 18th
     birthday, on their wedding day, or after you're gone. Sealed wisdom stays
     sealed — no one sees it, or even that it exists, until its moment.
   - **Your family's well fills over time.** Every answer joins the family
     archive, and stewardship passes down the line so it outlasts any one of
     us.
3. **A sample prompt** — one card, e.g. *"What did your mother do when money
   was tight?"* with "Answer this →" (goes to sign up).
4. **Invited by a family member?** — "Check your email for your invite, or ask
   to join your family's well" (→ join request, §11).
5. Footer — logo, sign in.

---

## 2. Relationships

*Decided:* add **Child of** (with parent type), add a **custom** relationship
type, show custom relationships on the tree, move the relationship list into
each person's panel.

- **Child of** — UI-only option. "A is a child of B (adoptive)" is saved as
  `B PARENT_OF A, parentKind ADOPTIVE`. Lineage, release rules, and succession
  are unchanged.
- **Custom** — new `RelationshipType.CUSTOM` + `customLabel` (free text, e.g.
  "Godfather", "Like a sister"). Descriptive only: **never** lineage, never a
  release-rule target, never succession. `buildGraph` ignores it.
- **Tree** — a custom relationship draws as a dotted line with its label.
  If the person has no lineage position (e.g. a family friend), they're placed
  beside the person they're linked to, the way a spouse is.
- **Per-person panel** — selecting someone in the tree shows their
  relationships with *End marriage* / *Delete* actions. The standalone
  "Recorded relationships" list at the bottom of the page is removed.

---

## 3. Login — email + password

*Decided:* password sign-in, magic link kept as a secondary option, 10-char
minimum, existing users emailed to set a password.

- `User.passwordHash` (bcrypt or argon2id). Sign-in page: email + password,
  with **"Email me a sign-in link instead"** and **"Forgot password?"** below.
- **Invites** (and approved join requests) → link opens **Set your password**,
  then **Confirm your details** (§11).
- **Forgot password** → emailed single-use reset link (1 hour).
- **Existing users** — one email sent when this ships: "Wisdom Well now uses a
  password — set yours." Link valid 7 days. Nobody is locked out in the
  meantime: the sign-in link option still works.
- Basic brute-force protection: throttle repeated failed attempts per email.

---

## 4. "Entry" → "Wisdom"

*Decided:* **Wisdom**, wording on screen only. Code, routes, and database stay
`Entry`.

Examples: "Add wisdom", "Your wisdom", "Wisdom shared with you", "Edit this
wisdom", "3 pieces of wisdom". The nav tab "Entries" becomes **Wisdom**. URLs
stay `/entries/...` (invisible to most people; renaming routes risks breaking
links in sent emails).

---

## 5. One place to write or record

*Decided:* one screen; voice **and** video; videos transcribed; **no length
limit**; phone-first; custom prompts can be saved for others to answer.

### The flow (`/entries/new`, replaces `/interview`)
1. **Prompt** — shows a suggested prompt with:
   *Ask me something different* · *Choose a topic* · *Write my own question* ·
   *No prompt — just share*. Arriving from a reminder email, the dashboard, or
   a question someone asked you pre-fills it.
2. **Answer** — three tabs on the same screen: **Write · Voice · Video**.
   Big record button, works one-handed on a phone. A photo can be attached in
   any mode.
3. **Review** — title (pre-filled from the prompt), the text or transcript
   draft, then **who receives it and when** (the existing release-rule
   builder). Save as draft or publish.

The header button becomes **Add wisdom**.

### Technical requirement that comes with "no length limit"
Today every upload passes through the app server, and hosted serverless
functions cap request bodies at a few MB (Vercel ≈4.5 MB, Netlify ≈6 MB). A
long phone video will fail. To make "no limit" real:

- Uploads go **directly from the phone to R2** using a short-lived signed URL;
  the server only issues the URL and records the key. Files are still served
  only through `/api/media/<key>` with the visibility check.
- Requires a CORS rule on the R2 bucket (one-time setup; I'll add the steps to
  `docs/DEPLOY.md`).
- Large uploads show progress and survive a brief signal drop (multipart
  upload).

Practical ceiling: R2 single objects go to 5 TB, so the limit is the phone's
storage and patience, not the app. Storage cost is the trade-off — R2 is about
$0.015/GB-month with no download fees [Likely; check current pricing before
launch]; 100 hours of phone video is roughly 100–300 GB.

### Custom prompts
New `Prompt` table (`familyId`, `authorMemberId`, `text`, `askedOfMemberId?`,
`shared`). When you write your own question you choose:
- **Just for me** — used once, kept on your wisdom.
- **Add to our family's prompts** — appears in everyone's "Choose a topic"
  under *From our family*, credited to you.
- **Ask someone** — pick a family member. It shows on their dashboard under
  **Questions for you**, and they get an email. See OPEN-2 for who receives
  the answer.

---

## 6. Prompt buckets + Claude

*Decided:* merged bucket list (see companion file), Spiritual core, Politics &
Current Events optional, release suggestion on sensitive topics, ~250 draft
questions.

- `lib/prompts.ts` becomes **buckets → subtopics → sample questions**. Every
  wisdom records its bucket/subtopic (or custom prompt), which powers the well
  map (§9) and reminder picks (§7).
- **Optional buckets** (Politics & Current Events) sit at the bottom of *Choose
  a topic* under "More topics", labeled optional. Never used in reminders or
  dashboard suggestions unless the person has already answered one.
- **Sensitive subtopics** — *Growing up* (puberty) suggests a release rule
  ("Consider releasing this when they turn 13"). It's a suggestion; the author
  can change it.
- **Ask me something different (Claude)** — Claude writes a fresh question
  inside the chosen bucket/subtopic, using our sample questions as the style
  guide, and *avoiding repeats of what this person has already answered*
  (it reads their own wisdom — approved in 6.2).
  - If no API key is configured, or Claude is slow, it falls back to the next
    sample question. The button always works.
  - The key stays on the server (existing pattern).
  - See OPEN-1 on whether Claude should also tailor follow-ups to what the
    person has written.

---

## 7. Reminders (email)

*Decided:* email only, per person, includes a suggested prompt.

- Options: **Weekly · Every 2 weeks (default) · Monthly · Off**, in a new
  **Settings** page.
- The existing daily job sends reminders to anyone due. Each email: one
  suggested prompt (from a core bucket they've covered least), an **Answer
  this** button that opens §5 with it pre-filled, and any open **Questions for
  you**.
- One-click "Stop these emails" link in every reminder (good practice, and
  mail providers increasingly require it).
- Not sent to members without a login, DEPARTED members, or the deceased.

---

## 8. Dashboard (signed-in home)

*Decided:* never show that someone added something you can't see.

- **Suggested prompts** (2–3), one-tap to answer.
- **Questions for you** — custom prompts family members asked you.
- **New for you** — wisdom recently released to you.
- **Family activity (privacy-safe only)** — joined, accepted an invite,
  upcoming birthdays, a new family prompt was added. Never "X added wisdom".
- **Your well** — §9.
- **Quick links** — Add wisdom · Family tree · Invite someone (steward) ·
  Settings.

---

## 9. Your well + the family well

*Decided:* try the bucket map; fill counts everything.

- **Your well** (dashboard) — a well illustration that fills with each piece of
  wisdom you save (drafts included). It fills in levels (e.g. every 10 pieces
  raises the water a band) so it keeps moving for heavy contributors.
- **Areas to explore** — the 14 core buckets as tiles; ones you've answered are
  filled in, the rest read "Not explored yet". Framed as an invitation, no
  percentages, no "complete".
- **The family well** (`/entries`, renamed **Wisdom**) — everything released to
  you plus your own, filterable by bucket and by person. Same visibility rules
  as today.

---

## 10. Merged prompt buckets
See [`prompt-library-draft.md`](./prompt-library-draft.md).

---

## 11. Family membership + invites

*Decided:* steward-only invites and adding members; confirm details on first
sign-in; in-laws as branches inside one family (option b); join requests
allowed.

- **Adding people / inviting** — steward only. Other members see the tree but
  not the add/invite forms. (Relationship editing: see OPEN-4.)
- **Confirm your details** — after setting a password, the invitee sees their
  name, date of birth, and how they're shown in the tree, and can correct
  spelling/birthday. Changes apply immediately (and re-run release
  evaluation, as edits do today).
- **In-laws** — added as members of the same family with a SPOUSE_OF link;
  their parents/siblings can be added as a branch. Lineage rules are
  unchanged: in-laws are not your descendants. Multi-family membership stays a
  later phase.
- **Join requests** — see OPEN-3 for how a requester finds the right family.
  The steward gets an email + a dashboard item, chooses **Approve** (places
  them in the tree, sends the set-password link) or **Decline** (quiet email).
  Requests never reveal anything about the family to the requester.

---

## Data model changes (summary)

| Change | Why |
| --- | --- |
| `User.passwordHash`, password-reset tokens | §3 |
| `RelationshipType.CUSTOM` + `Relationship.customLabel` | §2 |
| `Prompt` table (custom / shared / asked-of) | §5 |
| `Entry.promptBucket`, `Entry.promptSubtopic`, `Entry.promptId` | §6, §9 |
| `User.reminderFrequency`, `User.lastRemindedAt` | §7 |
| `Member.detailsConfirmedAt` | §11 |
| `JoinRequest` table | §11 |
| `MediaType.VIDEO` recordings + video transcription | §5 (enum exists) |

Pure modules (`graph.ts`, `engine.ts`, `visibility.ts`, `succession/logic.ts`)
only change where noted: `buildGraph` must ignore `CUSTOM` edges, with tests.

---

## Proposed build order

Each phase ships on its own and is testable.

1. **Quick wins** — header + landing page, "Wisdom" wording, relationships.
2. **Accounts** — password login, existing-user email, steward-only invites,
   confirm-details, join requests.
3. **Prompt library** — buckets/subtopics/questions, optional + sensitive
   handling, Claude "something different".
4. **One composer** — write/voice/video, direct-to-R2 uploads, video
   transcription, custom + asked prompts. Retires `/interview`.
5. **Home** — dashboard, your well + areas to explore, family well filters,
   reminders + settings.

---

## OPEN questions

- **OPEN-1 — Claude follow-ups.** 6.1 approved Claude writing new questions
  within a bucket (option a); 6.2 approved it reading the person's own wisdom.
  I've used that to *avoid repeats*. Do you also want it to suggest
  **follow-ups to things they've said** ("You mentioned your grandfather's
  hardware store — what did he teach you there?")? Recommend: yes, as one of
  the 2–3 dashboard suggestions, not every time.
- **OPEN-2 — Who receives an answer to a question you asked?** Recommend: the
  release rule defaults to **the person who asked, right away**, and the
  answerer can change or add rules before publishing (they stay in control).
- **OPEN-3 — How does a join requester find the family?** Recommend: the
  steward gets a **family join link** to share by text or email; the link opens
  a short form (name, email, how you're related). No public family search —
  that would let strangers see that a family exists. Alternative: the
  requester types the steward's email.
- **OPEN-4 — Relationship editing.** With steward-only adding, should
  *relationships* also be steward-only, or can members link themselves (e.g.
  record their own marriage)? Recommend: steward-only for now, matching 11.1.
