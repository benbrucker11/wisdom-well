/**
 * Voice-interview pipeline (spec §6).
 *
 *   record in the browser  →  upload raw audio (kept permanently)
 *     →  create a DRAFT Entry, submit audio to AssemblyAI
 *     →  poll; on completion store transcript_raw, reconcile with Claude,
 *        set transcript_status = DRAFT
 *     →  author edits and approves; only then can it be published
 *
 * Nothing here auto-publishes.
 */
import { prisma } from "../db";
import { fetchTranscription, submitTranscription } from "./assemblyai";
import { reconcileTranscript } from "./reconcile";

export { transcriptionConfigured } from "./assemblyai";
export { reconciliationConfigured } from "./reconcile";

/**
 * Create the entry and kick off transcription. `audioUrl` is the permanent
 * storage URL for the raw recording; `audioBytes` is the same audio, uploaded
 * straight to AssemblyAI.
 */
export async function startVoiceEntry(input: {
  familyId: string;
  authorMemberId: string;
  audioUrl: string;
  audioBytes: Buffer;
  promptText: string | null;
}): Promise<{ entryId: string }> {
  const jobId = await submitTranscription(input.audioBytes);

  const entry = await prisma.entry.create({
    data: {
      familyId: input.familyId,
      authorMemberId: input.authorMemberId,
      title: input.promptText
        ? input.promptText.replace(/[?.]$/, "").slice(0, 70)
        : "Untitled recording",
      body: "",
      mediaType: "AUDIO",
      rawAudioUrl: input.audioUrl,
      transcriptStatus: "PROCESSING",
      transcriptJobId: jobId,
      interviewPrompt: input.promptText,
      status: "DRAFT",
    },
  });

  return { entryId: entry.id };
}

export type TranscriptionState =
  | "PROCESSING"
  | "DRAFT"
  | "APPROVED"
  | "NONE"
  | "ERROR";

/**
 * Advance a PROCESSING entry: check AssemblyAI, and on completion store the raw
 * transcript, run reconciliation, and move it to DRAFT. Safe to call
 * repeatedly (the interview page polls it) — a lightweight optimistic lock on
 * `transcriptRaw` being null means only the first caller does the work.
 */
export async function advanceTranscription(
  entryId: string,
): Promise<{ state: TranscriptionState; error?: string }> {
  const entry = await prisma.entry.findUnique({ where: { id: entryId } });
  if (!entry) return { state: "NONE" };
  if (entry.transcriptStatus !== "PROCESSING" || !entry.transcriptJobId) {
    return { state: entry.transcriptStatus as TranscriptionState };
  }

  const outcome = await fetchTranscription(entry.transcriptJobId);

  if (outcome.status === "PROCESSING") return { state: "PROCESSING" };

  if (outcome.status === "ERROR") {
    await prisma.entry.updateMany({
      where: { id: entryId, transcriptStatus: "PROCESSING" },
      data: { transcriptStatus: "NONE", transcriptJobId: null },
    });
    return { state: "ERROR", error: outcome.error };
  }

  // COMPLETED — claim the finalization by writing transcriptRaw exactly once.
  const claim = await prisma.entry.updateMany({
    where: { id: entryId, transcriptStatus: "PROCESSING", transcriptRaw: null },
    data: { transcriptRaw: outcome.transcriptRaw || "(no speech detected)" },
  });
  if (claim.count === 0) {
    // Someone else is finalizing (or already did).
    const fresh = await prisma.entry.findUnique({ where: { id: entryId } });
    return { state: (fresh?.transcriptStatus ?? "PROCESSING") as TranscriptionState };
  }

  const reconciled = await reconcileTranscript({
    transcriptRaw: outcome.transcriptRaw,
    promptText: entry.interviewPrompt,
  });

  await prisma.entry.update({
    where: { id: entryId },
    data: {
      title: reconciled.title,
      body: reconciled.body,
      transcriptStatus: "DRAFT",
      transcriptJobId: null,
    },
  });

  return { state: "DRAFT" };
}
