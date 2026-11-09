import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  PROMPT_BUCKETS,
  daySeed,
  findBucket,
  findSubtopic,
  locatePrompt,
  promptsIn,
  suggestPrompts,
} from "@/lib/prompts";
import { visibleEntriesFor } from "@/lib/release";
import { canUsePrompt } from "@/lib/wisdom";
import { Composer, type ComposerPrompt } from "../_components/composer";

const ERRORS: Record<string, string> = {
  empty: "Write something (or attach a file) before saving.",
  media: "That file can't be attached here.",
};

function fullName(m: { givenName: string; familyName: string }): string {
  return `${m.givenName} ${m.familyName}`.trim();
}

/**
 * The single "Add wisdom" screen. Arrives with a prompt from the dashboard, a
 * reminder email, or a question someone asked (?prompt=<id>); otherwise starts
 * from a suggestion in a topic this person hasn't explored much.
 */
export default async function NewWisdomPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    mode?: string;
    prompt?: string;
    q?: string;
    bucket?: string;
    subtopic?: string;
    none?: string;
  }>;
}) {
  const { member } = await requireMember();
  const sp = await searchParams;

  const [own, familyPromptRows, members] = await Promise.all([
    visibleEntriesFor(member.id).then((v) =>
      v.filter((x) => x.reason === "author").map((x) => x.entry),
    ),
    prisma.prompt.findMany({
      where: {
        familyId: member.familyId,
        OR: [
          { visibility: "FAMILY" },
          { askedOfMemberId: member.id, dismissedAt: null },
          { authorMemberId: member.id, askedOfMemberId: null },
        ],
      },
      include: { author: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.member.findMany({
      where: { familyId: member.familyId, status: "ACTIVE", dateOfDeath: null, NOT: { id: member.id } },
      orderBy: [{ givenName: "asc" }],
    }),
  ]);

  const answered = new Set(own.map((e) => e.interviewPrompt).filter((t): t is string => Boolean(t)));
  const bylineFor = (p: (typeof familyPromptRows)[number]) =>
    p.askedOfMemberId === member.id && p.authorMemberId !== member.id
      ? `Asked by ${fullName(p.author)}`
      : p.authorMemberId === member.id
        ? "Your question"
        : `From our family · ${fullName(p.author)}`;

  const familyPrompts: ComposerPrompt[] = familyPromptRows.map((p) => ({
    text: p.text,
    bucket: null,
    bucketTitle: null,
    subtopic: null,
    subtopicTitle: null,
    promptId: p.id,
    byline: bylineFor(p),
  }));

  // --- Which prompt to open with ---------------------------------------
  let initialPrompt: ComposerPrompt | null = null;
  if (sp.prompt) {
    const row = await prisma.prompt.findUnique({ where: { id: sp.prompt }, include: { author: true } });
    if (row && canUsePrompt(row, member)) {
      initialPrompt = {
        text: row.text,
        bucket: null,
        bucketTitle: null,
        subtopic: null,
        subtopicTitle: null,
        promptId: row.id,
        byline: bylineFor(row),
      };
    }
  } else if (sp.q) {
    const located = locatePrompt(sp.q);
    const bucket = located?.bucket ?? findBucket(sp.bucket);
    const subtopic = located?.subtopic ?? findSubtopic(bucket, sp.subtopic);
    initialPrompt = {
      text: sp.q.slice(0, 300),
      bucket: bucket?.slug ?? null,
      bucketTitle: bucket?.title ?? null,
      subtopic: subtopic?.slug ?? null,
      subtopicTitle: subtopic && subtopic.slug !== "general" ? subtopic.title : null,
    };
  } else if (sp.bucket && findBucket(sp.bucket)) {
    const bucket = findBucket(sp.bucket)!;
    const subtopic = findSubtopic(bucket, sp.subtopic);
    const text = promptsIn(bucket, subtopic).find((t) => !answered.has(t)) ?? promptsIn(bucket, subtopic)[0];
    const loc = locatePrompt(text);
    initialPrompt = {
      text,
      bucket: bucket.slug,
      bucketTitle: bucket.title,
      subtopic: loc?.subtopic.slug ?? null,
      subtopicTitle: loc && loc.subtopic.slug !== "general" ? loc.subtopic.title : null,
    };
  } else if (!sp.none) {
    const bucketCounts: Record<string, number> = {};
    for (const e of own) if (e.promptBucket) bucketCounts[e.promptBucket] = (bucketCounts[e.promptBucket] ?? 0) + 1;
    const [pick] = suggestPrompts({ bucketCounts, answered, seed: daySeed(new Date(), member.id) });
    if (pick) {
      initialPrompt = {
        text: pick.text,
        bucket: pick.bucket.slug,
        bucketTitle: pick.bucket.title,
        subtopic: pick.subtopic.slug,
        subtopicTitle: pick.subtopic.slug !== "general" ? pick.subtopic.title : null,
      };
    }
  }

  const mode = sp.mode === "voice" || sp.mode === "video" ? sp.mode : "write";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-h2 text-ink">Add wisdom</h1>
      <p className="mt-2 text-ink-soft">
        Answer a question &mdash; or share whatever&rsquo;s on your mind. Write it,
        say it, or film it.
      </p>
      {sp.error && ERRORS[sp.error] ? (
        <p className="mt-4 rounded-field border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {ERRORS[sp.error]}
        </p>
      ) : null}
      <div className="mt-8">
        <Composer
          initialPrompt={initialPrompt}
          initialMode={mode}
          buckets={PROMPT_BUCKETS.map((b) => ({
            slug: b.slug,
            title: b.title,
            optional: Boolean(b.optional),
            subtopics:
              b.subtopics.length > 1 ? b.subtopics.map((s) => ({ slug: s.slug, title: s.title })) : [],
          }))}
          familyPrompts={familyPrompts}
          members={members.map((m) => ({ id: m.id, name: fullName(m) }))}
        />
      </div>
    </div>
  );
}
