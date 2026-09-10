/**
 * Voice-interview pipeline (spec §6).
 *
 *   record in the browser  →  upload raw audio (kept permanently)
 *     →  create a DRAFT Entry, submit audio to AssemblyAI
 *     →  poll; on completion store transcript_raw, set a mechanical DRAFT
 *        immediately, then best-effort Claude reconciliation
 *     →  author edits and approves; only then can it be published
 *
 * The two-step DRAFT (mechanical first, AI polish second) means a serverless
 * timeout during the slow Claude call never leaves an entry stuck — the author
 * always has an editable draft, and `reconciledAt = null` marks the ones the
 * daily job still needs to polish. Nothing here auto-publishes.
 */
import { prisma } from "../db";
import { fetchTranscription, submitTranscription } from "./assemblyai";
import {
  mechanicalReconcile,
  reconcileTranscript,
  reconciliationConfigured,
} from "./reconcile";

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
 * transcript, run reconciliation, and move it to DRAFT.
 *
 * Resumable: the transcript is stored as soon as AssemblyAI finishes, then
 * reconciliation runs as a separate step. If the request handling that step is
 * killed (a serverless timeout — the Claude call is the slow part), the next
 * poll picks up from the stored transcript and retries reconciliation. The
 * entry never gets stuck in PROCESSING with a transcript already in hand.
 */
export async function advanceTranscription(
  entryId: string,
): Promise<{ state: TranscriptionState; error?: string }> {
  const entry = await prisma.entry.findUnique({ where: { id: entryId } });
  if (!entry) return { state: "NONE" };
  if (entry.transcriptStatus !== "PROCESSING") {
    return { state: entry.transcriptStatus as TranscriptionState };
  }

  // Step 2 (resume): AssemblyAI already finished on an earlier poll; only the
  // reconciliation still needs to run.
  if (entry.transcriptRaw != null) {
    return finalizeTranscript(entry.id, entry.transcriptRaw, entry.interviewPrompt);
  }

  if (!entry.transcriptJobId) return { state: "PROCESSING" };

  // Step 1: check AssemblyAI.
  const outcome = await fetchTranscription(entry.transcriptJobId);

  if (outcome.status === "PROCESSING") return { state: "PROCESSING" };

  if (outcome.status === "ERROR") {
    await prisma.entry.updateMany({
      where: { id: entryId, transcriptStatus: "PROCESSING" },
      data: { transcriptStatus: "NONE", transcriptJobId: null },
    });
    return { state: "ERROR", error: outcome.error };
  }

  // COMPLETED — persist the transcript exactly once, then reconcile.
  const raw = outcome.transcriptRaw || "(no speech detected)";
  const claim = await prisma.entry.updateMany({
    where: { id: entryId, transcriptStatus: "PROCESSING", transcriptRaw: null },
    data: { transcriptRaw: raw },
  });
  if (claim.count === 0) {
    const fresh = await prisma.entry.findUnique({ where: { id: entryId } });
    return { state: (fresh?.transcriptStatus ?? "PROCESSING") as TranscriptionState };
  }

  return finalizeTranscript(entryId, raw, entry.interviewPrompt);
}

async function finalizeTranscript(
  entryId: string,
  transcriptRaw: string,
  promptText: string | null,
): Promise<{ state: TranscriptionState }> {
  // 1. A usable DRAFT right away, from the mechanical cleanup. Fast, no network.
  //    Guarded so a concurrent poll (or a re-run after the transcript was
  //    already stored) doesn't clobber a later state.
  const quick = mechanicalReconcile(transcriptRaw, promptText);
  await prisma.entry.updateMany({
    where: { id: entryId, transcriptStatus: "PROCESSING" },
    data: {
      title: quick.title,
      body: quick.body,
      transcriptStatus: "DRAFT",
      transcriptJobId: null,
    },
  });

  // 2. Best-effort Claude polish, inline. If this request is killed here, the
  //    daily job (or the "polish" button) finishes it.
  await polishEntryWithAi(entryId).catch((err) => {
    console.error("inline AI polish failed", err);
  });

  return { state: "DRAFT" };
}

/**
 * Replace a voice entry's mechanical draft with the Claude-reconciled version —
 * only if the author hasn't edited it since. Idempotent; safe to retry.
 * Returns true when the AI version was applied.
 */
export async function polishEntryWithAi(entryId: string): Promise<boolean> {
  const entry = await prisma.entry.findUnique({ where: { id: entryId } });
  if (
    !entry ||
    entry.transcriptRaw == null ||
    entry.reconciledAt != null ||
    (entry.transcriptStatus !== "DRAFT" && entry.transcriptStatus !== "APPROVED")
  ) {
    return false;
  }

  if (!reconciliationConfigured()) {
    // No AI available — the mechanical draft is the final version.
    await prisma.entry.update({
      where: { id: entryId },
      data: { reconciledAt: new Date() },
    });
    return false;
  }

  const reconciled = await reconcileTranscript({
    transcriptRaw: entry.transcriptRaw,
    promptText: entry.interviewPrompt,
  });
  if (!reconciled.reconciledByAI) return false; // the AI call failed — retry later

  // Only overwrite if the body is still exactly the mechanical draft.
  const mechanical = mechanicalReconcile(entry.transcriptRaw, entry.interviewPrompt);
  const untouched = entry.body === mechanical.body;

  await prisma.entry.update({
    where: { id: entryId },
    data: {
      reconciledAt: new Date(),
      ...(untouched ? { title: reconciled.title, body: reconciled.body } : {}),
    },
  });
  return untouched;
}

/** Daily-job sweep: polish voice drafts whose inline AI attempt didn't finish. */
export async function reconcilePendingDrafts(): Promise<number> {
  const pending = await prisma.entry.findMany({
    where: {
      transcriptRaw: { not: null },
      reconciledAt: null,
      transcriptStatus: { in: ["DRAFT", "APPROVED"] },
    },
    select: { id: true },
    take: 25,
  });
  let polished = 0;
  for (const { id } of pending) {
    if (await polishEntryWithAi(id).catch(() => false)) polished += 1;
  }
  return polished;
}
