// Server-only in practice (env-gated API keys, vendor SDKs); not importing "server-only"
// so the e2e script can drive it under plain Node.
import { AssemblyAI } from "assemblyai";

/**
 * AssemblyAI pre-recorded transcription (spec §6).
 *
 * The API key never leaves the server. Audio is either uploaded to AssemblyAI
 * from our storage, or — for direct-to-bucket recordings — handed over as a
 * short-lived signed URL to the private bucket (our /api/media routes need a
 * session and are unreachable from their servers).
 *
 * Speaker diarization is on: in a guided interview a second person (spouse,
 * child, the person asking the questions) often chimes in, and we want the raw
 * transcript to show who said what.
 */

function client(): AssemblyAI {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error("ASSEMBLYAI_API_KEY is not set");
  return new AssemblyAI({ apiKey });
}

export function transcriptionConfigured(): boolean {
  return Boolean(process.env.ASSEMBLYAI_API_KEY);
}

/**
 * Submit audio for transcription without blocking. Returns the job id.
 *
 * `audio` is either the bytes (uploaded to AssemblyAI by the SDK) or an
 * https URL AssemblyAI fetches itself — a short-lived signed URL to our private
 * bucket, for recordings too large to pass through a serverless function.
 * (SDK 4.37: a string starting with "http" is sent as `audio_url` as-is.)
 */
export async function submitTranscription(audio: Buffer | string): Promise<string> {
  const transcript = await client().transcripts.submit({
    audio,
    // universal-3-5-pro is the current flagship; universal-2 is the broad
    // fallback. Ordered model-availability fallback, not parallel.
    speech_models: ["universal-3-5-pro", "universal-2"],
    speaker_labels: true,
  });
  return transcript.id;
}

export type TranscriptionOutcome =
  | { status: "PROCESSING" }
  | { status: "COMPLETED"; transcriptRaw: string; speakerCount: number }
  | { status: "ERROR"; error: string };

/** Check a job. When complete, returns the raw transcript, diarized if possible. */
export async function fetchTranscription(jobId: string): Promise<TranscriptionOutcome> {
  const t = await client().transcripts.get(jobId);

  if (t.status === "queued" || t.status === "processing") {
    return { status: "PROCESSING" };
  }
  if (t.status === "error") {
    return { status: "ERROR", error: t.error ?? "transcription failed" };
  }

  // completed
  const utterances = t.utterances ?? [];
  const speakers = new Set(utterances.map((u) => u.speaker));

  let transcriptRaw: string;
  if (utterances.length > 0 && speakers.size > 1) {
    transcriptRaw = utterances
      .map((u) => `Speaker ${u.speaker}: ${u.text}`)
      .join("\n\n");
  } else {
    transcriptRaw = (t.text ?? "").trim();
  }

  return {
    status: "COMPLETED",
    transcriptRaw,
    speakerCount: Math.max(speakers.size, transcriptRaw ? 1 : 0),
  };
}
