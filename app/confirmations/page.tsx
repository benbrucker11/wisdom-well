import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  familyReleaseStats,
  pendingEventConfirmations,
  unrunnableRulesForFamily,
} from "@/lib/release";
import { confirmAuthorDeathAction, confirmEventAction } from "./actions";

export default async function ConfirmationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { member } = await requireMember();
  const sp = await searchParams;

  const family = await prisma.family.findUnique({
    where: { id: member.familyId },
    select: { stewardMemberId: true, name: true },
  });
  const isSteward = family?.stewardMemberId === member.id;

  const [pending, stats, unrunnable] = await Promise.all([
    pendingEventConfirmations(member.familyId, member.id),
    isSteward ? familyReleaseStats(member.familyId) : Promise.resolve(null),
    isSteward
      ? unrunnableRulesForFamily(member.familyId, member.id)
      : Promise.resolve([]),
  ]);

  // Non-stewards only act on their own entries; the living-author check for
  // events is enforced again in the server action.
  const actionable = isSteward
    ? pending
    : pending.filter((p) => p.authorMemberId === member.id);

  return (
    <div className="space-y-12">
      <header>
        <h1 className="font-serif text-4xl">Confirmations</h1>
        <p className="mt-2 text-ink-soft">
          Some entries wait on a life event. Nothing here reveals what an entry
          says &mdash; only that one is waiting.
        </p>
      </header>

      {sp.error === "forbidden" ? (
        <p className="rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          Only the steward or the living author can confirm that.
        </p>
      ) : null}

      <section>
        <h2 className="font-serif text-2xl">Waiting on</h2>
        {actionable.length === 0 ? (
          <p className="mt-3 text-ink-soft">Nothing is waiting on you.</p>
        ) : (
          <ul className="mt-4 divide-y divide-rule border-y border-rule">
            {actionable.map((item) => (
              <li key={`${item.ruleId}:${item.kind === "EVENT" ? item.subjectMemberId : item.authorMemberId}`} className="py-4">
                {item.kind === "EVENT" ? (
                  <form action={confirmEventAction} className="flex items-center justify-between gap-4">
                    <input type="hidden" name="ruleId" value={item.ruleId} />
                    <input type="hidden" name="subjectMemberId" value={item.subjectMemberId} />
                    <span>
                      <strong>{item.subjectName}</strong> &mdash; {item.label}
                      <span className="block text-sm text-ink-soft">
                        {item.entryTitle
                          ? `for your entry “${item.entryTitle}”`
                          : `an entry by ${item.authorName}`}
                      </span>
                    </span>
                    <button
                      type="submit"
                      className="shrink-0 rounded bg-accent px-4 py-2 text-white hover:opacity-90"
                    >
                      This happened
                    </button>
                  </form>
                ) : (
                  <form action={confirmAuthorDeathAction} className="flex items-center justify-between gap-4">
                    <input type="hidden" name="authorMemberId" value={item.authorMemberId} />
                    <span>
                      Death of <strong>{item.authorName}</strong>
                      <span className="block text-sm text-ink-soft">
                        {item.entryTitle
                          ? `releases your entry “${item.entryTitle}”`
                          : "releases one or more sealed entries"}
                      </span>
                    </span>
                    {isSteward ? (
                      <button
                        type="submit"
                        className="shrink-0 rounded border border-danger/40 px-4 py-2 text-danger hover:bg-danger/5"
                      >
                        Record date of death
                      </button>
                    ) : (
                      <span className="shrink-0 text-sm text-ink-soft">
                        steward only
                      </span>
                    )}
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isSteward && stats ? (
        <section className="rounded border border-rule bg-parchment-deep p-5">
          <h2 className="font-serif text-2xl">The well at a glance</h2>
          <p className="mt-1 text-sm text-ink-soft">
            For succession. You can see that entries exist; you cannot open ones
            that weren&rsquo;t released to you.
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-4 text-center">
            <div>
              <dt className="text-sm text-ink-soft">Scheduled</dt>
              <dd className="font-serif text-3xl">{stats.scheduled}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-soft">Released</dt>
              <dd className="font-serif text-3xl">{stats.released}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-soft">Total deliveries</dt>
              <dd className="font-serif text-3xl">{stats.recipients}</dd>
            </div>
          </dl>

          {unrunnable.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-sm uppercase tracking-wide text-ink-soft">
                Rules that can&rsquo;t run yet
              </h3>
              <ul className="mt-2 space-y-1 text-sm">
                {unrunnable.map((u) => (
                  <li key={u.ruleId}>
                    {u.entryTitle ? `“${u.entryTitle}”: ` : "An entry: "}
                    {u.reason}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-ink-soft">
                Add the missing date of birth on the{" "}
                <Link href="/family">family</Link> page.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
