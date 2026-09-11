"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Phase = "idle" | "recording" | "recorded" | "uploading" | "processing" | "error";

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const t of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return "";
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Recorder({ promptText }: { promptText: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  useEffect(() => () => stopTracks(), [stopTracks]);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeType || "audio/webm",
        });
        blobRef.current = blob;
        setBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        setPhase("recorded");
        stopTracks();
      };
      recorderRef.current = rec;
      rec.start();
      setElapsed(0);
      setPhase("recording");
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch {
      setError(
        "Couldn't reach the microphone. Check that your browser has permission.",
      );
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
  }

  function discard() {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    blobRef.current = null;
    setElapsed(0);
    setPhase("idle");
  }

  async function submit() {
    const blob = blobRef.current;
    if (!blob) return;
    setPhase("uploading");
    setError(null);

    const form = new FormData();
    const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
    form.set("file", blob, `interview.${ext}`);
    form.set("promptText", promptText);

    let entryId: string;
    try {
      const res = await fetch("/api/interview", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Upload failed (${res.status})`);
      }
      entryId = (await res.json()).entryId;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setPhase("error");
      return;
    }

    setPhase("processing");
    poll(entryId);
  }

  function poll(entryId: string) {
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const res = await fetch(`/api/entries/${entryId}/transcription`);
        const data = await res.json();
        if (data.state === "DRAFT" || data.state === "APPROVED") {
          stopped = true;
          router.push(`/entries/${entryId}`);
          return;
        }
        if (data.state === "ERROR" || data.state === "NONE") {
          stopped = true;
          setError(
            data.error
              ? `Transcription failed: ${data.error}. Your recording is saved on the entry.`
              : "Transcription didn't complete. Your recording is saved on the entry.",
          );
          setPhase("error");
          // Still let them go to the entry — audio + manual writing.
          setTimeout(() => router.push(`/entries/${entryId}`), 3500);
          return;
        }
      } catch {
        // transient — keep polling
      }
      setTimeout(tick, 4000);
    };
    tick();
  }

  return (
    <div className="card mt-8">
      {error ? (
        <p className="mb-4 rounded-field border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {phase === "idle" ? (
        <button type="button" onClick={startRecording} className="btn btn-primary">
          Start recording
        </button>
      ) : null}

      {phase === "recording" ? (
        <div className="flex items-center gap-4">
          <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-danger" />
          <span className="tabular-nums text-lg">{formatElapsed(elapsed)}</span>
          <button type="button" onClick={stopRecording} className="btn btn-secondary">
            Stop
          </button>
          <span className="text-sm text-ink-soft">
            Take your time. Wander off the question if you want to.
          </span>
        </div>
      ) : null}

      {phase === "recorded" && blobUrl ? (
        <div className="space-y-4">
          <audio src={blobUrl} controls className="w-full" />
          <div className="flex gap-3">
            <button type="button" onClick={submit} className="btn btn-primary">
              Use this recording
            </button>
            <button type="button" onClick={discard} className="btn btn-secondary">
              Record again
            </button>
          </div>
        </div>
      ) : null}

      {phase === "uploading" ? (
        <p className="text-ink-soft">Saving your recording&hellip;</p>
      ) : null}

      {phase === "processing" ? (
        <div className="space-y-2">
          <p className="prose-entry">Transcribing your recording&hellip;</p>
          <p className="text-sm text-ink-soft">
            This usually takes a minute or two. The recording is already saved —
            you can leave this page and come back to the entry.
          </p>
        </div>
      ) : null}
    </div>
  );
}
