import { type NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/auth";
import { generateQuestion, promptGenerationConfigured } from "@/lib/prompt-generation";
import {
  findBucket,
  findSubtopic,
  promptsIn,
  suggestPrompts,
  type PromptBucket,
  type PromptSubtopic,
} from "@/lib/prompts";
import { visibleEntriesFor } from "@/lib/release";

export const maxDuration = 30;

interface NextPrompt {
  text: string;
  bucket: string | null;
  bucketTitle: string | null;
  subtopic: string | null;
  subtopicTitle: string | null;
  source: "claude" | "library";
}

function shape(
  text: string,
  bucket: PromptBucket | undefined,
  subtopic: PromptSubtopic | undefined,
  source: NextPrompt["source"],
): NextPrompt {
  return {
    text,
    bucket: bucket?.slug ?? null,
    bucketTitle: bucket?.title ?? null,
    subtopic: subtopic?.slug ?? null,
    subtopicTitle: subtopic && subtopic.slug !== "general" ? subtopic.title : null,
    source,
  };
}

/**
 * "Ask me something different." With a bucket (and optional subtopic), Claude
 * writes a fresh question there, steering clear of what this person has already
 * answered — or, with mode=follow_up, picks up on something they've written.
 * Without Claude (no key, slow, or an unusable answer) it falls back to the
 * next unanswered sample question. Without a bucket it suggests from the
 * least-explored core buckets.
 */
export async function GET(req: NextRequest) {
  const { member } = await requireMember();
  const sp = req.nextUrl.searchParams;
  const exclude = (sp.get("exclude") ?? "").slice(0, 300);
  const mode = sp.get("mode") === "follow_up" ? "follow_up" : "fresh";

  // Their own wisdom only (author view) — read through the visibility layer.
  const own = (await visibleEntriesFor(member.id))
    .filter((v) => v.reason === "author")
    .map((v) => v.entry);
  const answered = new Set(own.map((e) => e.interviewPrompt).filter((t): t is string => Boolean(t)));
  if (exclude) answered.add(exclude);

  let bucket = findBucket(sp.get("bucket"));
  let subtopic = findSubtopic(bucket, sp.get("subtopic"));

  if (!bucket && mode === "follow_up") {
    // Follow up on whatever they wrote most recently.
    const recent = own.find((e) => e.promptBucket);
    bucket = findBucket(recent?.promptBucket) ?? findBucket("family-history-and-origins");
    subtopic = findSubtopic(bucket, recent?.promptSubtopic);
  }

  if (!bucket) {
    const bucketCounts: Record<string, number> = {};
    for (const e of own) if (e.promptBucket) bucketCounts[e.promptBucket] = (bucketCounts[e.promptBucket] ?? 0) + 1;
    const [pick] = suggestPrompts({
      bucketCounts,
      answered,
      seed: Math.floor(Math.random() * 2 ** 31),
    });
    if (!pick) return NextResponse.json({ error: "no prompts left" }, { status: 404 });
    return NextResponse.json(shape(pick.text, pick.bucket, pick.subtopic, "library"));
  }

  const samples = promptsIn(bucket, subtopic);

  if (promptGenerationConfigured()) {
    const question = await generateQuestion({
      bucketTitle: bucket.title,
      bucketBlurb: bucket.blurb,
      subtopicTitle: subtopic && subtopic.slug !== "general" ? subtopic.title : null,
      sampleQuestions: samples,
      alreadyAsked: [...answered],
      ownWisdom: own.slice(0, 8).map((e) => ({
        title: e.title,
        excerpt: e.body.slice(0, 400),
      })),
      mode,
    });
    if (question) return NextResponse.json(shape(question, bucket, subtopic, "claude"));
  }

  // Fallback: the next sample after the one on screen that they haven't answered.
  const start = Math.max(0, samples.indexOf(exclude) + 1);
  const ordered = [...samples.slice(start), ...samples.slice(0, start)];
  const next = ordered.find((t) => !answered.has(t)) ?? ordered[0];
  return NextResponse.json(shape(next, bucket, subtopic, "library"));
}
