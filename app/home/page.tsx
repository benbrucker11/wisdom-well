import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { daySeed, suggestPrompts } from "@/lib/prompts";
import { visibleEntriesFor } from "@/lib/release";
import { bucketCoverage, wellState } from "@/lib/well";
import { WellGraphic } from "../_components/well-graphic";
import { dismissQuestion } from "../entries/actions";

function fullName(m: { givenName: string; familyName: string }): string {
  return `${m.givenName} ${m.familyName}`.trim();
}

function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Next birthday on or after `today` (UTC dates), and the age they'll turn. */
function nextBirthday(dob: Date, today: Date): { date: Date; age: number } {
  const y = today.getUTCFullYear();
  let date = new Date(Date.UTC(y, dob.getUTCMonth(), dob.getUTCDate()));
  const todayUtc = Date.UTC(y, today.getUTCMonth(), today.getUTCDate());
  if (date.getTime() < todayUtc) date = new Date(Date.UTC(y + 1, dob.getUTCMonth(), dob.getUTCDate()));
  return { date, age: date.getUTCFullYear() - dob.getUTCFullYear() };
}

const DAY = 86_400_000;

/**
 * The signed-in home (Nov 2026): suggested prompts, questions family members
 * asked you, wisdom newly released to you, your well, and privacy-safe family
 * news. Never shows that anyone added wisdom you can't see.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ asked?: string }>;
}) {
  const { member } = await requireMember();
  const sp = await searchParams;
  const now = new Date();
  const isSteward = member.family.stewardMemberId === member.id;

  const [visible, asked, members, familyPrompts, pendingJoins] = await Promise.all([
    visibleEntriesFor(member.id),
    prisma.prompt.findMany({
      where: { askedOfMemberId: member.id, dismissedAt: null },
      include: { author: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.member.findMany({ where: { familyId: member.familyId } }),
    prisma.prompt.findMany({
      where: {
        familyId: member.familyId,
        visibility: "FAMILY",
        createdAt: { gte: new Date(now.getTime() - 30 * DAY) },
      },
      include: { author: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    isSteward
      ? prisma.joinRequest.count({ where: { familyId: member.familyId, status: "PENDING" } })
      : Promise.resolve(0),
  ]);

  const own = visible.filter((v) => v.reason === "author").map((v) => v.entry);
  const answeredPromptIds = new Set(own.map((e) => e.promptId).filter(Boolean));
  const openQuestions = asked.filter((p) => !answeredPromptIds.has(p.id));

  const releasedToMe = visible.filter((v) => v.reason === "released");
  const releaseRows = releasedToMe.length
    ? await prisma.release.findMany({
        where: { recipientMemberId: member.id, entryId: { in: releasedToMe.map((v) => v.entry.id) } },
        orderBy: { releasedAt: "desc" },
        take: 5,
      })
    : [];
  const entryById = new Map(releasedToMe.map((v) => [v.entry.id, v.entry]));
  const newForYou = releaseRows
    .map((r) => ({ entry: entryById.get(r.entryId), releasedAt: r.releasedAt }))
    .filter((x): x is { entry: NonNullable<typeof x.entry>; releasedAt: Date } => Boolean(x.entry));

  // --- Suggestions ------------------------------------------------------------
  const bucketCounts: Record<string, number> = {};
  for (const e of own) if (e.promptBucket) bucketCounts[e.promptBucket] = (bucketCounts[e.promptBucket] ?? 0) + 1;
  const answered = new Set(own.map((e) => e.interviewPrompt).filter((t): t is string => Boolean(t)));
  const suggestions = suggestPrompts({
    bucketCounts,
    answered,
    seed: daySeed(now, member.id),
    count: own.length > 0 ? 2 : 3,
  });

  // --- Your well ----------------------------------------------------------------
  const well = wellState(own.length);
  const coverage = bucketCoverage(own.map((e) => e.promptBucket));
  const explored = coverage.filter((c) => c.count > 0).length;

  // --- Family news (privacy-safe: people and dates, never wisdom) ---------------
  type News = { at: Date; text: string; href?: string };
  const news: News[] = [];
  for (const m of members) {
    if (m.id === member.id) continue;
    if (m.detailsConfirmedAt && m.userId && now.getTime() - m.detailsConfirmedAt.getTime() < 30 * DAY) {
      news.push({ at: m.detailsConfirmedAt, text: `${fullName(m)} joined the family's well`, href: `/family?focus=${m.id}` });
    } else if (now.getTime() - m.createdAt.getTime() < 30 * DAY) {
      news.push({ at: m.createdAt, text: `${fullName(m)} was added to the family tree`, href: `/family?focus=${m.id}` });
    }
  }
  for (const p of familyPrompts) {
    news.push({
      at: p.createdAt,
      text: `${p.author.givenName} added a family question: “${p.text}”`,
      href: `/entries/new?prompt=${p.id}`,
    });
  }
  news.sort((a, b) => b.at.getTime() - a.at.getTime());
  const birthdays = members
    .filter((m) => m.dateOfBirth && !m.dateOfDeath && m.status === "ACTIVE")
    .map((m) => ({ m, ...nextBirthday(m.dateOfBirth!, now) }))
    .filter((b) => b.date.getTime() - now.getTime() < 30 * DAY)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <div className="space-y-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{member.family.name}</p>
          <h1 className="mt-1 font-serif text-h2 text-ink sm:text-h1">Welcome, {member.givenName}</h1>
        </div>
        <Link href="/entries/new" className="btn btn-primary no-underline">
          Add wisdom
        </Link>
      </header>

      {sp.asked === "1" ? (
        <p className="rounded-field border border-success/40 bg-success/10 p-3 text-sm text-success">
          Question sent. They&rsquo;ll see it on their home page and get an email.
        </p>
      ) : null}
      {isSteward && pendingJoins > 0 ? (
        <p className="rounded-field border border-sand bg-sand/20 p-3 text-sm text-ink">
          {pendingJoins} {pendingJoins === 1 ? "person is" : "people are"} asking to join.{" "}
          <Link href="/family#join-requests">Review</Link>
        </p>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="space-y-12">
          {/* --- Questions for you -------------------------------------------- */}
          {openQuestions.length > 0 ? (
            <section aria-labelledby="qfy">
              <h2 id="qfy" className="font-serif text-h2 text-ink">Questions for you</h2>
              <ul className="mt-4 space-y-3">
                {openQuestions.map((p) => (
                  <li key={p.id} className="card">
                    <p className="eyebrow">Asked by {fullName(p.author)}</p>
                    <p className="prose-entry mt-1 text-ink">{p.text}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-4">
                      <Link href={`/entries/new?prompt=${p.id}`} className="btn btn-primary btn-sm no-underline">
                        Answer
                      </Link>
                      <form action={dismissQuestion}>
                        <input type="hidden" name="promptId" value={p.id} />
                        <button type="submit" className="btn-text text-sm">
                          Not now
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* --- Suggested prompts --------------------------------------------- */}
          <section aria-labelledby="suggested">
            <h2 id="suggested" className="font-serif text-h2 text-ink">Something to answer</h2>
            <ul className="mt-4 space-y-3">
              {suggestions.map((s) => (
                <li key={s.text} className="card">
                  <p className="eyebrow">
                    {s.bucket.title}
                    {s.subtopic.slug !== "general" ? ` · ${s.subtopic.title}` : ""}
                  </p>
                  <p className="prose-entry mt-1 text-ink">{s.text}</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {(["write", "voice", "video"] as const).map((mode) => (
                      <Link
                        key={mode}
                        href={`/entries/new?${new URLSearchParams({
                          q: s.text,
                          bucket: s.bucket.slug,
                          subtopic: s.subtopic.slug,
                          mode,
                        })}`}
                        className={`btn btn-sm no-underline ${mode === "write" ? "btn-primary" : "btn-secondary"}`}
                      >
                        {mode === "write" ? "Write" : mode === "voice" ? "Say it" : "Film it"}
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
              {own.length > 0 ? (
                <li className="card card-muted">
                  <p className="eyebrow">A follow-up</p>
                  <p className="mt-1 text-ink">
                    Let us pick up on something you&rsquo;ve already shared and ask you more about it.
                  </p>
                  <Link href="/entries/new?followup=1" className="btn btn-secondary btn-sm mt-3 no-underline">
                    Ask me a follow-up
                  </Link>
                </li>
              ) : null}
            </ul>
          </section>

          {/* --- New for you ---------------------------------------------------- */}
          <section aria-labelledby="newforyou">
            <h2 id="newforyou" className="font-serif text-h2 text-ink">New for you</h2>
            {newForYou.length === 0 ? (
              <p className="mt-3 text-ink-soft">Nothing new has been shared with you yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-mist border-y border-mist">
                {newForYou.map(({ entry, releasedAt }) => (
                  <li key={entry.id} className="py-3">
                    <Link href={`/entries/${entry.id}`} className="font-serif text-xl text-ink no-underline">
                      {entry.title}
                    </Link>
                    <p className="text-sm text-ink-soft">
                      {fullName(entry.author)} · {shortDate(releasedAt)}
                      {entry.mediaType === "VIDEO" ? " · video" : entry.mediaType === "AUDIO" ? " · recording" : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* --- Family news ---------------------------------------------------- */}
          <section aria-labelledby="news">
            <h2 id="news" className="font-serif text-h2 text-ink">Around the family</h2>
            {news.length === 0 && birthdays.length === 0 ? (
              <p className="mt-3 text-ink-soft">Quiet lately.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {birthdays.map(({ m, date, age }) => (
                  <li key={`b-${m.id}`} className="text-ink">
                    🎂 {fullName(m)} turns {age} on {shortDate(date)}
                  </li>
                ))}
                {news.slice(0, 8).map((n, i) => (
                  <li key={i} className="text-ink">
                    {n.href ? <Link href={n.href}>{n.text}</Link> : n.text}{" "}
                    <span className="text-sm text-ink-soft">· {shortDate(n.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* --- Sidebar: your well + quick links ------------------------------- */}
        <aside className="space-y-8">
          <section aria-labelledby="yourwell" className="card text-center">
            <h2 id="yourwell" className="font-serif text-xl text-ink">Your well</h2>
            <div className="mt-3 flex justify-center">
              <WellGraphic
                fill={well.fill}
                level={well.level}
                label={`Your well: ${well.total} pieces of wisdom, level ${well.level}`}
              />
            </div>
            <p className="mt-2 text-ink">
              {well.total === 0
                ? "Empty for now — your first answer starts it."
                : `${well.total} ${well.total === 1 ? "piece" : "pieces"} of wisdom`}
            </p>
            {well.total > 0 ? (
              <p className="text-sm text-ink-soft">
                {well.toNextLevel} more to reach level {well.level + 1}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="explore" className="card">
            <h2 id="explore" className="font-serif text-xl text-ink">Areas to explore</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {explored === 0
                ? "Pick any of these to begin."
                : `You've shared about ${explored} of these. The rest are waiting whenever you are.`}
            </p>
            <ul className="mt-4 grid grid-cols-2 gap-2">
              {coverage.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/entries/new?bucket=${c.slug}`}
                    title={c.blurb}
                    className={`block h-full rounded-field border px-3 py-2 text-sm no-underline ${
                      c.count > 0
                        ? "border-well bg-water/40 text-ink"
                        : "border-mist bg-ivory text-ink-soft hover:border-water"
                    }`}
                  >
                    {c.title}
                    <span className="block text-xs">
                      {c.count > 0 ? `${c.count} shared` : "Not explored yet"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <nav aria-label="Quick links" className="card">
            <h2 className="font-serif text-xl text-ink">Quick links</h2>
            <ul className="mt-3 space-y-2">
              <li><Link href="/entries/new">Add wisdom</Link></li>
              <li><Link href="/entries">The family well</Link></li>
              <li><Link href="/family">Family tree</Link></li>
              {isSteward ? <li><Link href="/family#join-requests">Invite someone</Link></li> : null}
              <li><Link href="/settings">Settings &amp; reminders</Link></li>
            </ul>
          </nav>
        </aside>
      </div>
    </div>
  );
}
