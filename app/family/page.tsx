import Link from "next/link";
import type { Member } from "@prisma/client";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { describeFamilyFrom } from "@/lib/relationships";
import {
  addMember,
  addRelationship,
  deleteRelationship,
  updateMember,
} from "./actions";

function isoDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

const RELATIONSHIP_VERB: Record<string, string> = {
  PARENT_OF: "is a parent of",
  SPOUSE_OF: "is married to",
  SIBLING_OF: "is a sibling of",
};

function fullName(m: Member): string {
  return `${m.givenName} ${m.familyName}`.trim();
}

function lifespan(m: Member): string | null {
  const birth = m.dateOfBirth?.getUTCFullYear();
  const death = m.dateOfDeath?.getUTCFullYear();
  if (birth && death) return `${birth}–${death}`;
  if (birth) return `b. ${birth}`;
  if (death) return `d. ${death}`;
  return null;
}

export default async function FamilyPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const { user, member } = await requireMember();
  const family = member.family;
  const sp = await searchParams;

  const members = await prisma.member.findMany({
    where: { familyId: family.id },
    orderBy: [{ dateOfBirth: "asc" }, { createdAt: "asc" }],
  });

  const focusId =
    sp.focus && members.some((m) => m.id === sp.focus) ? sp.focus : member.id;

  const [view, relationships] = await Promise.all([
    describeFamilyFrom(focusId),
    prisma.relationship.findMany({
      where: { familyId: family.id },
      orderBy: { createdAt: "asc" },
      include: { fromMember: true, toMember: true },
    }),
  ]);

  const stewardId = family.stewardMemberId;
  const missingDob = members.filter((m) => !m.dateOfBirth);

  return (
    <div className="space-y-14">
      <header>
        <h1 className="font-serif text-4xl">{family.name}</h1>
        <p className="mt-2 text-ink-soft">
          {members.length} {members.length === 1 ? "person" : "people"} in the
          tree
          {view.focus && stewardId ? (
            <>
              {" "}
              &middot; steward:{" "}
              {fullName(members.find((m) => m.id === stewardId) ?? member)}
            </>
          ) : null}
        </p>
      </header>

      {/* --- The people ------------------------------------------------- */}
      <section>
        <h2 className="font-serif text-2xl">The people</h2>
        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {members.map((m) => {
            const span = lifespan(m);
            return (
              <li key={m.id} className="px-1 py-3">
                <div className="flex items-baseline justify-between">
                  <span>
                    <Link
                      href={`/family?focus=${m.id}`}
                      className={`no-underline ${
                        m.id === focusId ? "font-semibold text-ink" : "text-ink"
                      }`}
                    >
                      {fullName(m)}
                    </Link>
                    {m.id === user.member?.id ? (
                      <span className="ml-2 text-xs text-accent">you</span>
                    ) : null}
                    {m.id === stewardId ? (
                      <span className="ml-2 text-xs text-ink-soft">steward</span>
                    ) : null}
                    {!m.userId ? (
                      <span className="ml-2 text-xs text-ink-soft/70">
                        no login
                      </span>
                    ) : null}
                  </span>
                  <span className="text-sm tabular-nums text-ink-soft">{span}</span>
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-ink-soft">
                    Edit dates
                  </summary>
                  <form
                    action={updateMember}
                    className="mt-2 flex flex-wrap items-end gap-3"
                  >
                    <input type="hidden" name="id" value={m.id} />
                    <label className="text-xs text-ink-soft">
                      Born
                      <input
                        type="date"
                        name="dateOfBirth"
                        defaultValue={isoDate(m.dateOfBirth)}
                        className="mt-1 block rounded border border-rule bg-white px-2 py-1"
                      />
                    </label>
                    <label className="text-xs text-ink-soft">
                      Died
                      <input
                        type="date"
                        name="dateOfDeath"
                        defaultValue={isoDate(m.dateOfDeath)}
                        className="mt-1 block rounded border border-rule bg-white px-2 py-1"
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded bg-accent px-3 py-1 text-sm text-white hover:opacity-90"
                    >
                      Save
                    </button>
                  </form>
                </details>
              </li>
            );
          })}
        </ul>
      </section>

      {/* --- Seen from the focused member ----------------------------- */}
      <section>
        <h2 className="font-serif text-2xl">
          Seen from {fullName(view.focus)}
        </h2>

        <div className="mt-4 rounded border border-rule bg-white/60 p-5">
          <h3 className="text-sm uppercase tracking-wide text-ink-soft">
            Grandchildren of {view.focus.givenName}
          </h3>
          {view.grandchildren.length > 0 ? (
            <p className="mt-2 prose-entry">
              {view.grandchildren.map((g) => fullName(g)).join(", ")}
            </p>
          ) : (
            <p className="mt-2 text-ink-soft">None recorded yet.</p>
          )}
        </div>

        {view.relations.length > 0 ? (
          <table className="mt-6 w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-rule text-sm text-ink-soft">
                <th className="py-2 font-normal">Person</th>
                <th className="py-2 font-normal">
                  Relationship to {view.focus.givenName}
                </th>
              </tr>
            </thead>
            <tbody>
              {view.relations.map(({ member: m, relation }) => (
                <tr key={m.id} className="border-b border-rule/60">
                  <td className="py-2">
                    <Link href={`/family?focus=${m.id}`}>{fullName(m)}</Link>
                  </td>
                  <td className="py-2 text-ink-soft">{relation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-6 text-ink-soft">
            No other people in the tree yet.
          </p>
        )}
      </section>

      {missingDob.length > 0 ? (
        <section className="rounded border border-rule bg-parchment-deep p-5">
          <h2 className="font-serif text-xl">Missing dates of birth</h2>
          <p className="mt-1 text-sm text-ink-soft">
            An age-based release rule cannot evaluate against a person with no
            date of birth. Add one under &ldquo;Edit dates&rdquo; above.
          </p>
          <p className="mt-2">
            {missingDob.map((m) => fullName(m)).join(", ")}
          </p>
        </section>
      ) : null}

      {/* --- Editing the tree ---------------------------------------- */}
      <section className="grid gap-10 md:grid-cols-2">
        <div>
          <h2 className="font-serif text-2xl">Add a person</h2>
          <form action={addMember} className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                name="givenName"
                required
                placeholder="Given name"
                className="w-full rounded border border-rule bg-white px-3 py-2"
              />
              <input
                name="surname"
                required
                placeholder="Family name"
                defaultValue={family.name.replace(/^The\s+|\s+Family$/gi, "")}
                className="w-full rounded border border-rule bg-white px-3 py-2"
              />
            </div>
            <label className="block text-sm text-ink-soft">
              Date of birth
              <input
                type="date"
                name="dateOfBirth"
                className="mt-1 w-full rounded border border-rule bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm text-ink-soft">
              Date of death (if applicable)
              <input
                type="date"
                name="dateOfDeath"
                className="mt-1 w-full rounded border border-rule bg-white px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className="rounded bg-accent px-4 py-2 text-white hover:opacity-90"
            >
              Add person
            </button>
          </form>
        </div>

        <div>
          <h2 className="font-serif text-2xl">Record a relationship</h2>
          {members.length < 2 ? (
            <p className="mt-4 text-ink-soft">
              Add another person first.
            </p>
          ) : (
            <form action={addRelationship} className="mt-4 space-y-3">
              <select
                name="fromMemberId"
                required
                defaultValue=""
                className="w-full rounded border border-rule bg-white px-3 py-2"
              >
                <option value="" disabled>
                  Choose a person&hellip;
                </option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {fullName(m)}
                  </option>
                ))}
              </select>
              <select
                name="type"
                required
                defaultValue="PARENT_OF"
                className="w-full rounded border border-rule bg-white px-3 py-2"
              >
                <option value="PARENT_OF">is a parent of</option>
                <option value="SPOUSE_OF">is married to</option>
                <option value="SIBLING_OF">is a sibling of</option>
              </select>
              <select
                name="toMemberId"
                required
                defaultValue=""
                className="w-full rounded border border-rule bg-white px-3 py-2"
              >
                <option value="" disabled>
                  Choose a person&hellip;
                </option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {fullName(m)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded bg-accent px-4 py-2 text-white hover:opacity-90"
              >
                Record
              </button>
              <p className="text-sm text-ink-soft">
                Only record <strong>parent</strong> links for lineage &mdash;
                grandparent, cousin, and descendant are worked out automatically.
              </p>
            </form>
          )}
        </div>
      </section>

      {relationships.length > 0 ? (
        <section>
          <h2 className="font-serif text-2xl">Recorded relationships</h2>
          <ul className="mt-4 divide-y divide-rule border-y border-rule">
            {relationships.map((r) => (
              <li
                key={r.id}
                className="flex items-baseline justify-between px-1 py-3"
              >
                <span>
                  {fullName(r.fromMember)}{" "}
                  <span className="text-ink-soft">
                    {RELATIONSHIP_VERB[r.type]}
                  </span>{" "}
                  {fullName(r.toMember)}
                </span>
                <form action={deleteRelationship}>
                  <input type="hidden" name="id" value={r.id} />
                  <button
                    type="submit"
                    className="text-sm text-ink-soft hover:text-danger"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
