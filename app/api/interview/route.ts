import { type NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/auth";
import { putObject } from "@/lib/storage";
import { startVoiceEntry, transcriptionConfigured } from "@/lib/transcription";

const MAX_BYTES = 200 * 1024 * 1024; // ~3 hours of Opus

export async function POST(req: NextRequest) {
  const { member } = await requireMember();

  if (!transcriptionConfigured()) {
    return NextResponse.json(
      { error: "Transcription is not configured (ASSEMBLYAI_API_KEY)." },
      { status: 503 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  const promptText = String(form.get("promptText") ?? "").trim() || null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no audio" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "audio missing or too large" }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // The recording is the artifact — stored permanently, before anything else.
  const stored = await putObject(
    { name: file.name || "interview.webm", type: file.type, bytes },
    { prefix: "raw-audio" },
  );

  try {
    const { entryId } = await startVoiceEntry({
      familyId: member.familyId,
      authorMemberId: member.id,
      audioUrl: stored.url,
      audioBytes: bytes,
      promptText,
    });
    return NextResponse.json({ entryId });
  } catch (err) {
    console.error("startVoiceEntry failed", err);
    return NextResponse.json(
      { error: "Could not start transcription. The recording was saved." },
      { status: 502 },
    );
  }
}
