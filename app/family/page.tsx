import Link from "next/link";
import type { Member } from "@prisma/client";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { describeFamilyFrom } from "@/lib/relationships";
import { RelationshipForm } from "./_components/relationship-form";
import { FamilyTreeDiagram } from "./_components/tree-diagram";
import {
  addMember,
  addRelationship,
  deleteRelationship,
  endRelationship,
  inviteMember,
  setMemberStatus,
  updateMember,
} from "./actions";

const INVITE_ERROR_LABEL: Record<string, string> = {
  not_found: "That person couldn't be found.",
  already_member: "That person already has a login.",
  email_in_use: "That email is already linked to a different family member.",
  invalid: "Enter a valid email address.",
};

const PARENT_KIND_LABEL: Record<string, string> = {
  BIOLOGICAL: "",
  ADOPTIVE: " (adoptive)",
  STEP: " (step)",
  GUARDIAN: " (guardian)",
};

function isoDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

/** How a stored relationship reads from the focused person's side. */
function describeEdgeFrom(
  focusId: string,
  r: {
    fromMemberId: string;
    toMemberId: string;
    type: string;
    parentKind: string | null;
    customLabel: string | null;
  },
): string {
  const outgoing = r.fromMemberId === focusId;
  const kind = r.parentKind ? PARENT_KIND_LABEL[r.parentKind] ?? "" : "";
  switch (r.type) {
    case "PARENT_OF":
      return outgoing ? `parent of${kind}` : `child of${kind}`;
    case "SPOUSE_OF":
      return "married to";
    case "SIBLING_OF":
      return "sibling of";
    case "CUSTOM":
      // Recorded as "A — godfather — B": A is B's godfather.
      return outgoing ? `${r.customLabel ?? "custom"} to` : `has as ${r.customLabel ?? "custom"}:`;
    default:
      return r.type;
  }
}

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
  searchParams: Promise<{
    focus?: string;
    error?: string;
    invited?: string;
    inviteError?: string;
  }>;
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
  const isSteward = stewardId === member.id;
  const focusEdges = relationships.filter(
    (r) => r.fromMemberId === focusId || r.toMemberId === focusId,
  );
  const missingDob = members.filter((m) => !m.dateOfBirth);

  return (
    <div className="space-y-14">
      <header>
        <h1 className="font-serif text-h1 text-ink">{family.name}</h1>
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

      {sp.error === "steward-only" ? (
        <p className="rounded-field border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          Only the family&rsquo;s steward can add people, send invites, or
          change relationships.
        </p>
      ) : null}
      {sp.error === "custom-label" ? (
        <p className="rounded-field border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          Give the custom relationship a label, like &ldquo;godfather&rdquo;.
        </p>
      ) : null}

      {sp.error === "steward-departed" ? (
        <p className="rounded-field border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          The steward can&rsquo;t be marked as having left the family. Transfer
          stewardship first on the{" "}
          <Link href="/steward">stewardship</Link> page.
        </p>
      ) : null}

      {sp.invited ? (
        <p className="rounded-field border border-success/40 bg-success/10 p-3 text-sm text-success">
          Invite sent. They&rsquo;ll get a sign-in link by email.
        </p>
      ) : null}
      {sp.inviteError ? (
        <p className="rounded-field border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {INVITE_ERROR_LABEL[sp.inviteError] ?? "Couldn't send that invite."}
        </p>
      ) : null}

      {/* --- Family tree diagram ---------------------------------------- */}
      <section>
        <h2 className="font-serif text-h2 text-ink">Family tree</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Select anyone in the tree to see the family from their point of view.
        </p>
        <div className="mt-4">
          <FamilyTreeDiagram
            members={members.map((m) => ({
              id: m.id,
              name: fullName(m),
              dateOfBirth: m.dateOfBirth,
              lifespan: lifespan(m),
              isFocus: m.id === focusId,
              isYou: m.id === user.member?.id,
              isSteward: m.id === stewardId,
              hasLogin: Boolean(m.userId),
              departed: m.status === "DEPARTED",
            }))}
            relationships={relationships.map((r) => ({
              fromMemberId: r.fromMemberId,
              toMemberId: r.toMemberId,
              type: r.type,
              parentKind: r.parentKind,
              endedAt: r.endedAt,
              customLabel: r.customLabel,
            }))}
          />
        </div>
      </section>

      {/* --- The people ------------------------------------------------- */}
      <section>
        <h2 className="font-serif text-h2 text-ink">The people</h2>
        <ul className="mt-4 divide-y divide-mist border-y border-mist">
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
                    {m.status === "DEPARTED" ? (
                      <span className="ml-2 text-xs text-danger">
                        no longer in this family
                      </span>
                    ) : null}
                  </span>
                  <span className="text-sm tabular-nums text-ink-soft">{span}</span>
                </div>
                {isSteward || m.id === member.id ? (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-ink-soft">
                    Edit
                  </summary>
                  <div className="mt-2 space-y-3">
                    <form
                      action={updateMember}
                      className="flex flex-wrap items-end gap-3"
                    >
                      <input type="hidden" name="id" value={m.id} />
                      <label className="text-xs text-ink-soft">
                        Born
                        <input
                          type="date"
                          name="dateOfBirth"
                          defaultValue={isoDate(m.dateOfBirth)}
                          className="field mt-1 px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="text-xs text-ink-soft">
                        Died
                        <input
                          type="date"
                          name="dateOfDeath"
                          defaultValue={isoDate(m.dateOfDeath)}
                          className="field mt-1 px-2 py-1 text-sm"
                        />
                      </label>
                      <button type="submit" className="btn btn-primary btn-sm">
                        Save
                      </button>
                    </form>
                    {isSteward && m.id !== stewardId ? (
                      <form action={setMemberStatus} className="text-xs">
                        <input type="hidden" name="id" value={m.id} />
                        <input
                          type="hidden"
                          name="status"
                          value={m.status === "DEPARTED" ? "ACTIVE" : "DEPARTED"}
                        />
                        <button type="submit" className="btn-text text-xs">
                          {m.status === "DEPARTED"
                            ? "Bring back into the family"
                            : "Mark as no longer in this family"}
                        </button>
                      </form>
                    ) : null}
                    {isSteward && !m.userId && m.status !== "DEPARTED" ? (
                      <form
                        action={inviteMember}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="memberId" value={m.id} />
                        <input
                          type="email"
                          name="email"
                          required
                          placeholder="their email"
                          className="field px-2 py-1 text-sm"
                        />
                        <button type="submit" className="btn btn-secondary btn-sm">
                          Invite to sign in
                        </button>
                      </form>
                    ) : null}
                  </div>
                </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {/* --- Seen from the focused member ----------------------------- */}
      <section>
        <h2 className="font-serif text-h2 text-ink">
          Seen from {fullName(view.focus)}
        </h2>

        <div className="card card-muted mt-4">
          <h3 className="eyebrow">
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

        <div className="card mt-4">
          <h3 className="eyebrow">
            {view.focus.givenName}&rsquo;s recorded relationships
          </h3>
          {focusEdges.length > 0 ? (
            <ul className="mt-2 divide-y divide-mist">
              {focusEdges.map((r) => {
                const other = r.fromMemberId === focusId ? r.toMember : r.fromMember;
                return (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 py-2"
                  >
                    <span>
                      <span className="text-ink-soft">
                        {describeEdgeFrom(focusId, r)}
                      </span>{" "}
                      <Link href={`/family?focus=${other.id}`}>{fullName(other)}</Link>
                      {r.type === "SPOUSE_OF" && r.endedAt ? (
                        <span className="text-ink-soft"> — marriage ended</span>
                      ) : null}
                    </span>
                    {isSteward ? (
                      <span className="flex items-center gap-3 text-sm">
                        {r.type === "SPOUSE_OF" && !r.endedAt ? (
                          <form action={endRelationship}>
                            <input type="hidden" name="id" value={r.id} />
                            <button type="submit" className="btn-text text-sm">
                              Mark ended
                            </button>
                          </form>
                        ) : null}
                        <form action={deleteRelationship}>
                          <input type="hidden" name="id" value={r.id} />
                          <button
                            type="submit"
                            className="btn-text text-sm hover:text-danger"
                          >
                            Remove
                          </button>
                        </form>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-ink-soft">None recorded yet.</p>
          )}
        </div>

        {view.relations.length > 0 ? (
          <table className="mt-6 w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-mist text-sm text-ink-soft">
                <th className="py-2 font-normal">Person</th>
                <th className="py-2 font-normal">
                  Relationship to {view.focus.givenName}
                </th>
              </tr>
            </thead>
            <tbody>
              {view.relations.map(({ member: m, relation }) => (
                <tr key={m.id} className="border-b border-mist/60">
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
        <section className="card card-muted">
          <h2 className="font-serif text-lg text-ink">Missing dates of birth</h2>
          <p className="mt-1 text-sm text-ink-soft">
            An age-based release rule cannot evaluate against a person with no
            date of birth. Add one under &ldquo;Edit dates&rdquo; above.
          </p>
          <p className="mt-2">
            {missingDob.map((m) => fullName(m)).join(", ")}
          </p>
        </section>
      ) : null}

      {/* --- Editing the tree (steward only) ------------------------------ */}
      {isSteward ? (
      <section className="grid gap-10 md:grid-cols-2">
        <div>
          <h2 className="font-serif text-h2 text-ink">Add a person</h2>
          <form action={addMember} className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                name="givenName"
                required
                placeholder="Given name"
                className="field"
              />
              <input
                name="surname"
                required
                placeholder="Family name"
                defaultValue={family.name.replace(/^The\s+|\s+Family$/gi, "")}
                className="field"
              />
            </div>
            <label className="block text-sm text-ink-soft">
              Date of birth
              <input type="date" name="dateOfBirth" className="field mt-1" />
            </label>
            <label className="block text-sm text-ink-soft">
              Date of death (if applicable)
              <input type="date" name="dateOfDeath" className="field mt-1" />
            </label>
            <label className="block text-sm text-ink-soft">
              Email (optional — invite them to sign in)
              <input
                type="email"
                name="email"
                placeholder="their.email@example.com"
                className="field mt-1"
              />
            </label>
            <button type="submit" className="btn btn-primary">
              Add person
            </button>
          </form>
        </div>

        <div>
          <h2 className="font-serif text-h2 text-ink">Record a relationship</h2>
          {members.length < 2 ? (
            <p className="mt-4 text-ink-soft">
              Add another person first.
            </p>
          ) : (
            <RelationshipForm
              action={addRelationship}
              members={members.map((m) => ({ id: m.id, name: fullName(m) }))}
              defaultFromId={focusId}
            />
          )}
        </div>
      </section>
      ) : (
        <p className="card card-muted text-sm text-ink-soft">
          The family&rsquo;s steward adds people, sends invites, and records
          relationships. Ask them if someone is missing.
        </p>
      )}
    </div>
  );
}
