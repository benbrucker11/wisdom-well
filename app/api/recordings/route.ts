import { type NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/auth";
import {
  directUploadsEnabled,
  getObject,
  keyFromMediaUrl,
  objectExists,
  presignDownload,
} from "@/lib/storage";
import { startRecordedEntry } from "@/lib/transcription";
import { addAskerDefaultRule, mediaUrlIsAttachable, resolvePromptContext } from "@/lib/wisdom";

export const maxDuration = 60;

const str = (v: unknown, max = 300): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/**
 * Step 2 of recording: the browser has already uploaded the recording
 * (straight to the bucket, or through /api/uploads locally). This creates the
 * draft wisdom and starts transcription. The recording is saved even when
 * transcription isn't configured — the author can write it up by hand.
 */
export async function POST(req: NextRequest) {
  const { member } = await requireMember();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const kind = body.kind === "video" ? "video" : "voice";
  const recordingUrl = str(body.recordingUrl, 500);
  const key = recordingUrl ? keyFromMediaUrl(recordingUrl) : null;
  const expectedPrefix = kind === "video" ? "raw-video/" : "raw-audio/";
  if (!recordingUrl || !key || !key.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: "missing recording" }, { status: 400 });
  }
  if (!(await objectExists(key))) {
    return NextResponse.json(
      { error: "The recording didn't finish uploading. Try again." },
      { status: 409 },
    );
  }
  const photoUrl = str(body.photoUrl, 500);
  if (
    !(await mediaUrlIsAttachable(recordingUrl, member.id)) ||
    !(await mediaUrlIsAttachable(photoUrl, member.id))
  ) {
    return NextResponse.json({ error: "That file can't be attached." }, { status: 400 });
  }

  const ctx = await resolvePromptContext(member, {
    promptText: str(body.promptText),
    promptBucket: str(body.promptBucket, 80),
    promptSubtopic: str(body.promptSubtopic, 80),
    promptId: str(body.promptId, 40),
    customPrompt: str(body.customPrompt),
    shareCustomPrompt: body.shareCustomPrompt === true,
  });

  // What AssemblyAI reads: a 24-hour signed URL for bucket storage (the file
  // may be far too large to pass through here), or the bytes locally.
  let audio: Buffer | string | null = null;
  try {
    audio = directUploadsEnabled() ? await presignDownload(key, 24 * 60 * 60) : await getObject(key);
  } catch (err) {
    console.error("couldn't read recording for transcription", err);
  }

  try {
    const { entryId, transcribing } = await startRecordedEntry({
      familyId: member.familyId,
      authorMemberId: member.id,
      kind,
      recordingUrl,
      audio,
      photoUrl,
      prompt: ctx,
    });
    if (ctx.askerMemberId) await addAskerDefaultRule(entryId, ctx.askerMemberId);
    return NextResponse.json({ entryId, transcribing });
  } catch (err) {
    console.error("startRecordedEntry failed", err);
    return NextResponse.json(
      { error: "Could not start transcription. Your recording is saved — try again." },
      { status: 502 },
    );
  }
}
