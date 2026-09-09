import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { visibleEntriesFor } from "@/lib/release";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  RELEASED: "Released",
};

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function EntriesPage() {
  const { member } = await requireMember();
  const visible = await visibleEntriesFor(member.id);

  const mine = visible.filter((v) => v.reason === "author");
  const received = visible.filter((v) => v.reason === "released");

  return (
    <div className="space-y-12">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-serif text-4xl">Entries</h1>
        <span className="flex items-baseline gap-3">
          <Link href="/interview" className="text-sm text-ink-soft no-underline hover:text-ink">
            Speak a memory
          </Link>
          <Link
            href="/entries/new"
            className="rounded bg-accent px-4 py-2 text-white no-underline hover:opacity-90"
          >
            Write a new entry
          </Link>
        </span>
      </header>

      <section>
        <h2 className="font-serif text-2xl">For you</h2>
        {received.length === 0 ? (
          <p className="mt-3 text-ink-soft">
            Nothing has been released to you yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-rule border-y border-rule">
            {received.map(({ entry }) => (
              <li key={entry.id} className="py-4">
                <Link href={`/entries/${entry.id}`} className="no-underline">
                  <span className="font-serif text-xl text-ink">{entry.title}</span>
                </Link>
                <p className="text-sm text-ink-soft">
                  {entry.author.givenName} {entry.author.familyName}
                  {entry.releasedAt ? ` · released ${formatDate(entry.releasedAt)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-serif text-2xl">Your entries</h2>
        {mine.length === 0 ? (
          <p className="mt-3 text-ink-soft">
            You haven&rsquo;t written anything yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-rule border-y border-rule">
            {mine.map(({ entry }) => (
              <li
                key={entry.id}
                className="flex items-baseline justify-between py-4"
              >
                <div>
                  <Link href={`/entries/${entry.id}`} className="no-underline">
                    <span className="font-serif text-xl text-ink">
                      {entry.title}
                    </span>
                  </Link>
                  <p className="text-sm text-ink-soft">
                    {entry.mediaType !== "TEXT"
                      ? `${entry.mediaType.toLowerCase()} · `
                      : ""}
                    created {formatDate(entry.createdAt)}
                  </p>
                </div>
                <span className="text-sm text-ink-soft">
                  {STATUS_LABEL[entry.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
