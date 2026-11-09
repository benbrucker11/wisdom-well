// Server-only in practice (Prisma); not importing "server-only" so e2e scripts
// can drive it under plain Node.
import type { Member, Prompt } from "@prisma/client";
import { prisma } from "./db";
import { findBucket, findSubtopic, locatePrompt } from "./prompts";

/**
 * What a new piece of wisdom answers. Resolved once, the same way for written,
 * voice, and video wisdom.
 */
export interface PromptContext {
  /** The question text, stored on Entry.interviewPrompt. */
  promptText: string | null;
  promptBucket: string | null;
  promptSubtopic: string | null;
  promptId: string | null;
  /** When answering a question someone asked: release to them by default. */
  askerMemberId: string | null;
  /** "Release when they turn N" suggestion from the subtopic (Growing up). */
  suggestedReleaseAge: number | null;
}

export interface PromptInput {
  promptText?: string | null;
  promptBucket?: string | null;
  promptSubtopic?: string | null;
  promptId?: string | null;
  /** A question the author is writing for themselves right now. */
  customPrompt?: string | null;
  /** Add that custom question to the family's shared prompts. */
  shareCustomPrompt?: boolean;
}

const MAX_PROMPT = 300;

/** Family prompts a member may answer: their own, shared ones, or asked of them. */
export function canUsePrompt(p: Prompt, member: Pick<Member, "id" | "familyId">): boolean {
  if (p.familyId !== member.familyId) return false;
  return (
    p.authorMemberId === member.id || p.visibility === "FAMILY" || p.askedOfMemberId === member.id
  );
}

export async function resolvePromptContext(
  member: Pick<Member, "id" | "familyId">,
  input: PromptInput,
): Promise<PromptContext> {
  const empty: PromptContext = {
    promptText: null,
    promptBucket: null,
    promptSubtopic: null,
    promptId: null,
    askerMemberId: null,
    suggestedReleaseAge: null,
  };

  // 1. A family-written prompt (shared, asked, or one of mine).
  if (input.promptId) {
    const p = await prisma.prompt.findUnique({ where: { id: input.promptId } });
    if (p && canUsePrompt(p, member)) {
      return {
        ...empty,
        promptText: p.text,
        promptId: p.id,
        askerMemberId:
          p.askedOfMemberId === member.id && p.authorMemberId !== member.id
            ? p.authorMemberId
            : null,
      };
    }
  }

  // 2. A question I'm writing for myself now — saved so it can be reused or shared.
  const custom = input.customPrompt?.trim().slice(0, MAX_PROMPT);
  if (custom) {
    const p = await prisma.prompt.create({
      data: {
        familyId: member.familyId,
        authorMemberId: member.id,
        text: custom,
        visibility: input.shareCustomPrompt ? "FAMILY" : "PRIVATE",
      },
    });
    return { ...empty, promptText: p.text, promptId: p.id };
  }

  // 3. A library question (sample or Claude-written) in a bucket / subtopic.
  const text = input.promptText?.trim().slice(0, MAX_PROMPT) || null;
  if (!text) return empty;
  const located = locatePrompt(text);
  const bucket = located?.bucket ?? findBucket(input.promptBucket);
  const subtopic = located?.subtopic ?? findSubtopic(bucket, input.promptSubtopic);
  return {
    ...empty,
    promptText: text,
    promptBucket: bucket?.slug ?? null,
    promptSubtopic: subtopic?.slug ?? null,
    suggestedReleaseAge: subtopic?.suggestedReleaseAge ?? null,
  };
}

/**
 * Answering a question someone asked: by default it goes to the person who
 * asked, right away (decided Nov 2026). It's an ordinary rule — the answerer
 * can remove it or add others before publishing.
 */
export async function addAskerDefaultRule(entryId: string, askerMemberId: string): Promise<void> {
  await prisma.releaseRule.create({
    data: {
      entryId,
      targetType: "SPECIFIC_MEMBER",
      targetMemberId: askerMemberId,
      triggerType: "NONE",
    },
  });
}

/**
 * A media URL may be attached to new wisdom only if no *other* author's wisdom
 * already references it. Keys are unguessable, but someone who can see a
 * released video knows its URL; without this check they could attach it to
 * their own wisdom and re-release it to people the author never chose.
 */
export async function mediaUrlIsAttachable(
  url: string | null,
  authorMemberId: string,
): Promise<boolean> {
  if (!url) return true;
  if (!url.startsWith("/api/media/")) return false;
  const other = await prisma.entry.findFirst({
    where: {
      authorMemberId: { not: authorMemberId },
      OR: [{ mediaUrl: url }, { rawAudioUrl: url }],
    },
    select: { id: true },
  });
  return other == null;
}
