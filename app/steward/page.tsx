import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { familyReleaseStats, unrunnableRulesForFamily } from "@/lib/release";
import { getSuccessionView } from "@/lib/succession";
import {
  addSuccessorAction,
  assumeStewardshipAction,
  declineTransferAction,
  moveSuccessorAction,
  removeSuccessorAction,
} from "./actions";

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function activityLine(
  daysSinceSeen: number | null,
  isInactive: boolean,
  thresholdDays: number,
): string {
  if (daysSinceSeen == null) return "no recorded activity";
  if (isInactive) return `inactive — last seen ${daysSinceSeen} days ago (threshold ${thresholdDays})`;
  if (daysSinceSeen <= 1) return "active — seen today";
  return `active — last seen ${daysSinceSeen} days ago`;
}

export default async function StewardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { member } = await requireMember();
  const family = member.family;
  const sp = await searchParams;

  const isSteward = family.stewardMemberId === member.id;

  const [view, members, stats, unrunnable] = await Promise.all([
    getSuccessionView(family.id),
    prisma.member.findMany({
      where: { familyId: family.id },
      orderBy: [{ givenName: "asc" }],
    }),
    isSteward ? familyReleaseStats(family.id) : Promise.resolve(null),
    isSteward
      ? unrunnableRulesForFamily(family.id, member.id)
      : Promise.resolve([]),
  ]);

  const nameById = new Map(
    members.map((m) => [m.id, `${m.givenName} ${m.familyName}`.trim()]),
  );
  const successorMemberIds = new Set(view.successors.map((s) => s.memberId));
  const eligibleToAdd = members.filter(
    (m) =>
      m.userId != null &&
      m.id !== family.stewardMemberId &&
      !successorMemberIds.has(m.id),
  );

  const pending = view.pendingTransfer;
  const viewerIsHeir = pending?.toMemberId === member.id;

  return (
    <div className="space-y-12">
      <header>
        <h1 className="font-serif text-4xl">Stewardship</h1>
        <p className="mt-2 text-ink-soft">
          The steward looks after {family.name} — the family tree, invitations,
          and this line of succession. The steward does not read other people&rsquo;s
          sealed entries.
        </p>
      </header>

      {sp.error ? (
        <p className="rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {sp.error}
        </p>
      ) : null}

      {/* Pending handover */}
      {pending ? (
        <section className="rounded border border-accent/40 bg-parchment-deep p-5">
          <h2 className="font-serif text-2xl">A handover is in progress</h2>
          <p className="mt-2">
            Stewardship passes to <strong>{pending.toName}</strong> on{" "}
            {formatDate(pending.graceEndsAt)}
            {pending.graceElapsed ? " (the grace period has now elapsed)" : ""}.
          </p>

          {isSteward ? (
            <form action={declineTransferAction} className="mt-4">
              <button
                type="submit"
                className="rounded bg-accent px-4 py-2 text-white hover:opacity-90"
              >
                I&rsquo;m still here — cancel the handover
              </button>
            </form>
          ) : null}

          {viewerIsHeir ? (
            <form action={assumeStewardshipAction} className="mt-4">
              <button
                type="submit"
                disabled={!pending.graceElapsed}
                className={`rounded px-4 py-2 text-white ${
                  pending.graceElapsed
                    ? "bg-accent hover:opacity-90"
                    : "cursor-not-allowed bg-ink-soft/40"
                }`}
              >
                {pending.graceElapsed
                  ? "Assume stewardship"
                  : `Available ${formatDate(pending.graceEndsAt)}`}
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {/* Current steward */}
      <section>
        <h2 className="font-serif text-2xl">Current steward</h2>
        <p className="mt-3">
          <strong>{view.assessment.stewardName ?? "—"}</strong>
          <span className="ml-2 text-sm text-ink-soft">
            {activityLine(
              view.assessment.daysSinceSeen,
              view.assessment.isInactive,
              view.assessment.inactivityThresholdDays,
            )}
          </span>
        </p>
      </section>

      {/* Line of succession */}
      <section>
        <h2 className="font-serif text-2xl">Line of succession</h2>
        {view.successors.length === 0 ? (
          <p className="mt-3 text-ink-soft">
            No successors named.
            {isSteward
              ? " Name someone below — if you become inactive for a year, stewardship passes to the first person here."
              : ""}
          </p>
        ) : (
          <ol className="mt-4 divide-y divide-rule border-y border-rule">
            {view.successors.map((s, idx) => (
              <li
                key={s.id}
                className="flex items-baseline justify-between gap-4 py-3"
              >
                <span>
                  <span className="tabular-nums text-ink-soft">{s.position}.</span>{" "}
                  {s.name}
                  {!s.hasLogin ? (
                    <span className="ml-2 text-xs text-danger">
                      no login — cannot take over
                    </span>
                  ) : null}
                </span>
                {isSteward ? (
                  <span className="flex items-center gap-2 text-sm">
                    {idx > 0 ? (
                      <form action={moveSuccessorAction}>
                        <input type="hidden" name="successorId" value={s.id} />
                        <input type="hidden" name="direction" value="up" />
                        <button className="text-ink-soft hover:text-ink">↑</button>
                      </form>
                    ) : null}
                    {idx < view.successors.length - 1 ? (
                      <form action={moveSuccessorAction}>
                        <input type="hidden" name="successorId" value={s.id} />
                        <input type="hidden" name="direction" value="down" />
                        <button className="text-ink-soft hover:text-ink">↓</button>
                      </form>
                    ) : null}
                    <form action={removeSuccessorAction}>
                      <input type="hidden" name="successorId" value={s.id} />
                      <button className="text-ink-soft hover:text-danger">
                        Remove
                      </button>
                    </form>
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        )}

        {isSteward ? (
          eligibleToAdd.length > 0 ? (
            <form action={addSuccessorAction} className="mt-4 flex flex-wrap gap-3">
              <select
                name="memberId"
                required
                defaultValue=""
                className="rounded border border-rule bg-white px-3 py-2"
              >
                <option value="" disabled>
                  Add a successor&hellip;
                </option>
                {eligibleToAdd.map((m) => (
                  <option key={m.id} value={m.id}>
                    {nameById.get(m.id)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded bg-accent px-4 py-2 text-white hover:opacity-90"
              >
                Add
              </button>
            </form>
          ) : (
            <p className="mt-4 text-sm text-ink-soft">
              Everyone with a login is already in the line. People without a
              login can&rsquo;t be named — invite them first.
            </p>
          )
        ) : null}
      </section>

      {/* Steward-only: content-free overview (moved here from Confirmations) */}
      {isSteward && stats ? (
        <section className="rounded border border-rule bg-parchment-deep p-5">
          <h2 className="font-serif text-2xl">The well at a glance</h2>
          <p className="mt-1 text-sm text-ink-soft">
            For succession planning. You can see that entries exist; you cannot
            open ones that weren&rsquo;t released to you.
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

          <p className="mt-4 text-sm text-ink-soft">
            Life events waiting on confirmation are on the{" "}
            <Link href="/confirmations">confirmations</Link> page.
          </p>
        </section>
      ) : null}

      {/* History */}
      {view.history.length > 0 ? (
        <section>
          <h2 className="font-serif text-2xl">Past handovers</h2>
          <ul className="mt-3 divide-y divide-rule border-y border-rule text-sm">
            {view.history.map((h) => (
              <li key={h.id} className="flex justify-between py-2">
                <span>
                  {h.status === "COMPLETED"
                    ? `Passed to ${h.toName}`
                    : `Handover to ${h.toName} cancelled${
                        h.cancelReason
                          ? ` (${h.cancelReason.toLowerCase().replace("_", " ")})`
                          : ""
                      }`}
                </span>
                <span className="text-ink-soft">{formatDate(h.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
