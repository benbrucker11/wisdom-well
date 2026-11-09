import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { visibleEntry } from "@/lib/release";
import { describeRule } from "@/lib/release/describe";
import { RuleBuilder } from "../_components/rule-builder";
import {
  addRule,
  approveTranscript,
  polishTranscript,
  deleteEntry,
  deleteRule,
  publishEntry,
  reopenTranscript,
  unscheduleEntry,
  updateEntry,
} from "../actions";
import { MediaUpload } from "../_components/media-upload";
import { TranscriptionWatcher } from "../_components/transcription-watcher";

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const ERRORS: Record<string, string> = {
  norules: "Add at least one release rule before publishing.",
  released: "This wisdom has already reached someone and can no longer be changed that way.",
  rulefired: "That rule has already released to someone, so it can't be removed.",
  rule: "Something in that rule didn't look right. Try again.",
  immediate: "“Everyone now” must be immediate. Use “the whole family” for a conditional release.",
  transcript: "Approve the transcript before publishing.",
  polish: "The AI polish didn't finish this time — your draft is unchanged. Try again in a moment.",
};

function MediaBlock({
  mediaType,
  mediaUrl,
}: {
  mediaType: string;
  mediaUrl: string | null;
}) {
  if (!mediaUrl) return null;
  if (mediaType === "IMAGE") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={mediaUrl} alt="" className="my-6 rounded-card border border-mist" />;
  }
  if (mediaType === "VIDEO") {
    return (
      <video src={mediaUrl} controls className="my-6 w-full rounded-card border border-mist" />
    );
  }
  if (mediaType === "AUDIO") {
    return <audio src={mediaUrl} controls className="my-6 block" />;
  }
  return null;
}

export default async function EntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { member } = await requireMember();
  const { id } = await params;
  const sp = await searchParams;

  const view = await visibleEntry(member.id, id);
  if (!view) notFound();

  const { entry, reason } = view;

  // --- Recipient view: a released entry, read only, presented like a page in a book.
  if (reason === "released") {
    const release = await prisma.release.findUnique({
      where: { entryId_recipientMemberId: { entryId: entry.id, recipientMemberId: member.id } },
    });
    return (
      <article className="mx-auto max-w-2xl">
        <Link href="/entries" className="text-sm text-ink-soft">
          &larr; Wisdom
        </Link>
        <h1 className="mt-3 font-serif text-h1 text-ink">{entry.title}</h1>
        <p className="mt-2 text-ink-soft">
          {entry.author.givenName} {entry.author.familyName}
          {release ? ` · released to you ${formatDate(release.releasedAt)}` : ""}
        </p>
        <MediaBlock mediaType={entry.mediaType} mediaUrl={entry.mediaUrl} />
        <div className="mt-6 whitespace-pre-wrap prose-entry">{entry.body}</div>
      </article>
    );
  }

  // --- Author view: full editor.
  const [full, members] = await Promise.all([
    prisma.entry.findUnique({
      where: { id: entry.id },
      include: {
        rules: { orderBy: { createdAt: "asc" } },
        releases: {
          include: { recipient: true },
          orderBy: { releasedAt: "asc" },
        },
      },
    }),
    prisma.member.findMany({
      where: { familyId: member.familyId },
      orderBy: [{ dateOfBirth: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  if (!full) notFound();

  const nameById = new Map(
    members.map((m) => [m.id, `${m.givenName} ${m.familyName}`.trim()]),
  );
  const nameFor = (mid: string) => nameById.get(mid) ?? "a family member";
  const memberOptions = members
    .filter((m) => m.id !== member.id)
    .map((m) => ({ id: m.id, name: nameFor(m.id) }));

  const canEditFreely = full.status !== "RELEASED";

  return (
    <div className="mx-auto max-w-2xl space-y-12">
      <div>
        <Link href="/entries" className="text-sm text-ink-soft">
          &larr; Wisdom
        </Link>
        <div className="mt-2 flex items-baseline justify-between">
          <h1 className="font-serif text-h2 text-ink">{full.title}</h1>
          <span className="text-sm text-ink-soft">
            {full.status === "DRAFT"
              ? "Draft"
              : full.status === "SCHEDULED"
                ? "Scheduled"
                : "Released"}
          </span>
        </div>
      </div>

      {sp.error && ERRORS[sp.error] ? (
        <p className="rounded-field border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {ERRORS[sp.error]}
        </p>
      ) : null}

      {full.transcriptStatus === "PROCESSING" ? (
        <TranscriptionWatcher entryId={full.id} />
      ) : null}

      {/* Voice interview: raw transcript beside the cleaned entry (spec §6) */}
      {full.transcriptRaw &&
      (full.transcriptStatus === "DRAFT" || full.transcriptStatus === "APPROVED") ? (
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-lg text-ink">From the recording</h2>
            {full.transcriptStatus === "DRAFT" ? (
              <form action={approveTranscript}>
                <input type="hidden" name="entryId" value={full.id} />
                <button type="submit" className="btn btn-primary btn-sm">
                  Approve this draft
                </button>
              </form>
            ) : (
              <form action={reopenTranscript} className="flex items-center gap-2">
                <span className="text-sm text-accent">Transcript approved</span>
                <input type="hidden" name="entryId" value={full.id} />
                {full.status === "DRAFT" ? (
                  <button type="submit" className="btn-text text-sm">
                    Reopen
                  </button>
                ) : null}
              </form>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            The draft above was cleaned up from what you said. Edit it freely —
            here is the raw transcript to check it against.
          </p>
          {full.reconciledAt == null ? (
            <form action={polishTranscript} className="mt-3">
              <input type="hidden" name="entryId" value={full.id} />
              <button type="submit" className="btn btn-secondary btn-sm">
                Polish this draft with AI
              </button>
              <span className="ml-2 text-xs text-ink-soft">
                Reorganises the rambling into readable prose, in your own voice.
                Won&rsquo;t touch edits you&rsquo;ve made.
              </span>
            </form>
          ) : null}
          <pre className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-field border border-mist bg-parchment-deep p-4 font-sans text-sm text-ink-soft">
            {full.transcriptRaw}
          </pre>
        </section>
      ) : null}

      {/* Content editor */}
      <section>
        <h2 className="font-serif text-lg text-ink">Your wisdom</h2>
        <form action={updateEntry} className="mt-4 space-y-4">
          <input type="hidden" name="entryId" value={full.id} />
          <label className="block space-y-1">
            <span className="text-sm text-ink-soft">Title</span>
            <input name="title" defaultValue={full.title} required className="field" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-ink-soft">Body</span>
            <textarea
              name="body"
              rows={12}
              defaultValue={full.body}
              className="field prose-entry"
            />
          </label>
          <MediaUpload
            initialUrl={full.mediaUrl ?? ""}
            initialType={full.mediaType as "TEXT" | "IMAGE" | "VIDEO" | "AUDIO"}
          />
          <button type="submit" className="btn btn-primary">
            Save changes
          </button>
        </form>
      </section>

      {full.rawAudioUrl ? (
        <section>
          <h2 className="font-serif text-lg text-ink">Original recording</h2>
          <p className="mt-1 text-sm text-ink-soft">
            The recording in the speaker&rsquo;s own voice is kept permanently.
          </p>
          <audio src={full.rawAudioUrl} controls className="mt-3 block" />
        </section>
      ) : null}

      {/* Release rules */}
      <section>
        <h2 className="font-serif text-lg text-ink">Who receives this, and when</h2>
        {full.rules.length === 0 ? (
          <p className="mt-2 text-ink-soft">No rules yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-mist border-y border-mist">
            {full.rules.map((rule) => (
              <li
                key={rule.id}
                className="flex items-baseline justify-between gap-4 py-3"
              >
                <span>{describeRule(rule, nameFor)}</span>
                <form action={deleteRule}>
                  <input type="hidden" name="entryId" value={full.id} />
                  <input type="hidden" name="ruleId" value={rule.id} />
                  <button type="submit" className="btn-text text-sm hover:text-danger">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5">
          <RuleBuilder entryId={full.id} members={memberOptions} />
        </div>
      </section>

      {/* Recipients so far */}
      {full.releases.length > 0 ? (
        <section>
          <h2 className="font-serif text-lg text-ink">Received by</h2>
          <ul className="mt-3 divide-y divide-mist border-y border-mist">
            {full.releases.map((r) => (
              <li
                key={r.id}
                className="flex items-baseline justify-between py-3"
              >
                <span>
                  {r.recipient.givenName} {r.recipient.familyName}
                </span>
                <span className="text-sm text-ink-soft">
                  {formatDate(r.releasedAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Lifecycle actions */}
      <section className="flex flex-wrap items-center gap-3 border-t border-mist pt-6">
        {full.status === "DRAFT" &&
        (full.transcriptStatus === "PROCESSING" ||
          full.transcriptStatus === "DRAFT") ? (
          <p className="text-sm text-ink-soft">
            {full.transcriptStatus === "PROCESSING"
              ? "You can publish once the transcript is ready and approved."
              : "Approve the transcript above before publishing."}
          </p>
        ) : full.status === "DRAFT" ? (
          <form action={publishEntry}>
            <input type="hidden" name="entryId" value={full.id} />
            <button type="submit" className="btn btn-primary">
              Publish
            </button>
          </form>
        ) : null}

        {full.status === "SCHEDULED" && full.releases.length === 0 ? (
          <form action={unscheduleEntry}>
            <input type="hidden" name="entryId" value={full.id} />
            <button type="submit" className="btn btn-secondary">
              Back to draft
            </button>
          </form>
        ) : null}

        {canEditFreely && full.releases.length === 0 ? (
          <form action={deleteEntry}>
            <input type="hidden" name="entryId" value={full.id} />
            <button type="submit" className="btn btn-danger">
              Delete
            </button>
          </form>
        ) : null}
      </section>

      {full.status !== "DRAFT" ? (
        <p className="text-sm text-ink-soft">
          Published. Rules with a future trigger will release on their own; life
          events wait for confirmation on the{" "}
          <Link href="/confirmations">confirmations</Link> page.
        </p>
      ) : null}
    </div>
  );
}
