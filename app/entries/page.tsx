import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { PROMPT_BUCKETS, findBucket } from "@/lib/prompts";
import { visibleEntriesFor } from "@/lib/release";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  RELEASED: "Released",
};

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function kindLabel(mediaType: string, rawAudioUrl: string | null): string | null {
  if (rawAudioUrl) return mediaType === "VIDEO" ? "video" : "recording";
  if (mediaType === "IMAGE") return "photo";
  if (mediaType === "VIDEO") return "video";
  return null;
}

/**
 * The family well: everything released to you, plus your own wisdom, filterable
 * by topic and by person. Same visibility boundary as before — wisdom that
 * hasn't reached you isn't here at all.
 */
export default async function FamilyWellPage({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string; person?: string }>;
}) {
  const { member } = await requireMember();
  const sp = await searchParams;
  const visible = await visibleEntriesFor(member.id);

  const bucketFilter = findBucket(sp.bucket)?.slug ?? null;
  const personFilter = sp.person && visible.some((v) => v.entry.authorMemberId === sp.person) ? sp.person : null;
  const matches = (e: (typeof visible)[number]["entry"]) =>
    (!bucketFilter || e.promptBucket === bucketFilter) &&
    (!personFilter || e.authorMemberId === personFilter);

  const mine = visible.filter((v) => v.reason === "author" && matches(v.entry));
  const received = visible.filter((v) => v.reason === "released" && matches(v.entry));

  // Filter options only from what this person can already see.
  const authors = new Map<string, string>();
  for (const v of visible) {
    authors.set(v.entry.authorMemberId, `${v.entry.author.givenName} ${v.entry.author.familyName}`.trim());
  }
  const bucketsSeen = new Set(visible.map((v) => v.entry.promptBucket).filter(Boolean));
  const bucketOptions = PROMPT_BUCKETS.filter((b) => bucketsSeen.has(b.slug));
  const filtered = Boolean(bucketFilter || personFilter);

  return (
    <div className="space-y-12">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-serif text-h1 text-ink">The family well</h1>
          <p className="mt-1 text-ink-soft">What&rsquo;s been shared with you, and what you&rsquo;ve shared.</p>
        </div>
        <Link href="/entries/new" className="btn btn-primary no-underline">
          Add wisdom
        </Link>
      </header>

      {visible.length > 0 ? (
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-ink-soft">
            Topic
            <select name="bucket" defaultValue={bucketFilter ?? ""} className="field mt-1">
              <option value="">All topics</option>
              {bucketOptions.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-ink-soft">
            From
            <select name="person" defaultValue={personFilter ?? ""} className="field mt-1">
              <option value="">Everyone</option>
              {[...authors].map(([id, name]) => (
                <option key={id} value={id}>
                  {id === member.id ? `${name} (you)` : name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-secondary">
            Filter
          </button>
          {filtered ? (
            <Link href="/entries" className="btn-text text-sm">
              Clear
            </Link>
          ) : null}
        </form>
      ) : null}

      <section>
        <h2 className="font-serif text-h2 text-ink">Shared with you</h2>
        {received.length === 0 ? (
          <p className="mt-3 text-ink-soft">
            {filtered ? "Nothing matches that filter." : "Nothing has been shared with you yet."}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-mist border-y border-mist">
            {received.map(({ entry }) => {
              const kind = kindLabel(entry.mediaType, entry.rawAudioUrl);
              return (
                <li key={entry.id} className="py-4">
                  <Link href={`/entries/${entry.id}`} className="no-underline">
                    <span className="font-serif text-xl text-ink">{entry.title}</span>
                  </Link>
                  <p className="text-sm text-ink-soft">
                    {entry.author.givenName} {entry.author.familyName}
                    {entry.promptBucket ? ` · ${findBucket(entry.promptBucket)?.title}` : ""}
                    {kind ? ` · ${kind}` : ""}
                    {entry.releasedAt ? ` · ${formatDate(entry.releasedAt)}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-serif text-h2 text-ink">Your wisdom</h2>
        {mine.length === 0 ? (
          <p className="mt-3 text-ink-soft">
            {filtered ? "Nothing matches that filter." : "You haven’t shared anything yet."}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-mist border-y border-mist">
            {mine.map(({ entry }) => {
              const kind = kindLabel(entry.mediaType, entry.rawAudioUrl);
              return (
                <li key={entry.id} className="flex items-baseline justify-between gap-4 py-4">
                  <div>
                    <Link href={`/entries/${entry.id}`} className="no-underline">
                      <span className="font-serif text-xl text-ink">{entry.title}</span>
                    </Link>
                    <p className="text-sm text-ink-soft">
                      {entry.promptBucket ? `${findBucket(entry.promptBucket)?.title} · ` : ""}
                      {kind ? `${kind} · ` : ""}
                      {formatDate(entry.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm text-ink-soft">{STATUS_LABEL[entry.status]}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
