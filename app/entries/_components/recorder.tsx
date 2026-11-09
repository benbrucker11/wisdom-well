"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecordingKind = "voice" | "video";

type Phase = "idle" | "recording" | "recorded";

const MIME_CANDIDATES: Record<RecordingKind, string[]> = {
  voice: ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"],
  // Safari records mp4; Chrome / Firefox record webm.
  video: ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"],
};

function pickMimeType(kind: RecordingKind): string {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES[kind].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

function extFor(type: string): string {
  if (type.includes("mp4")) return "mp4";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("quicktime")) return "mov";
  return "webm";
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = h ? m.toString().padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${s.toString().padStart(2, "0")}`;
}

/**
 * Record a voice or video answer in the browser — no length limit. When the
 * person is happy with it, hands the blob (and a file name) to `onUse`.
 * Also offers "use your phone's camera / a file", which on phones opens the
 * native recorder — the most reliable path for very long videos.
 */
export function Recorder({
  kind,
  busy,
  onUse,
}: {
  kind: RecordingKind;
  busy: boolean;
  onUse: (blob: Blob, fileName: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<{ blob: Blob; name: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    wakeRef.current?.release().catch(() => {});
    wakeRef.current = null;
  }, []);

  useEffect(() => () => stopTracks(), [stopTracks]);

  // Switching between Voice and Video starts over.
  useEffect(() => {
    stopTracks();
    setPhase("idle");
    setElapsed(0);
    setError(null);
    setBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    blobRef.current = null;
  }, [kind, stopTracks]);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: kind === "video" ? { facingMode: "user" } : false,
      });
      streamRef.current = stream;
      if (kind === "video" && previewRef.current) {
        previewRef.current.srcObject = stream;
        previewRef.current.play().catch(() => {});
      }
      const mimeType = pickMimeType(kind);
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = rec.mimeType || mimeType || (kind === "video" ? "video/webm" : "audio/webm");
        const blob = new Blob(chunksRef.current, { type });
        blobRef.current = { blob, name: `${kind}.${extFor(type)}` };
        setBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        if (previewRef.current) previewRef.current.srcObject = null;
        setPhase("recorded");
        stopTracks();
      };
      recorderRef.current = rec;
      // Timeslice so a long recording is gathered in chunks, not one huge buffer.
      rec.start(5000);
      setElapsed(0);
      setPhase("recording");
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      // Keep the phone screen awake while recording (best-effort).
      const nav = navigator as Navigator & {
        wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
      };
      wakeRef.current = (await nav.wakeLock?.request("screen").catch(() => null)) ?? null;
    } catch {
      setError(
        kind === "video"
          ? "Couldn't reach the camera. Check that your browser has permission — or use your phone's camera below."
          : "Couldn't reach the microphone. Check that your browser has permission.",
      );
    }
  }

  function stop() {
    recorderRef.current?.stop();
  }

  function again() {
    setBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    blobRef.current = null;
    setElapsed(0);
    setPhase("idle");
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    blobRef.current = { blob: file, name: file.name || `${kind}.${extFor(file.type)}` };
    setBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setPhase("recorded");
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-field border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {kind === "video" ? (
        <video
          ref={previewRef}
          muted
          playsInline
          className={`aspect-[3/4] w-full rounded-card bg-well-ink object-cover sm:aspect-video ${
            phase === "recording" ? "" : "hidden"
          }`}
        />
      ) : null}

      {phase === "idle" ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={start}
            className="btn btn-primary w-full py-5 text-lg"
          >
            {kind === "video" ? "Start video" : "Start recording"}
          </button>
          <label className="block text-center text-sm text-ink-soft">
            {kind === "video"
              ? "Or use your phone's camera app / pick a video"
              : "Or pick a recording you already have"}
            <input
              type="file"
              accept={kind === "video" ? "video/*" : "audio/*"}
              {...(kind === "video" ? { capture: "user" as const } : {})}
              onChange={onPickFile}
              className="mt-2 block w-full text-sm"
            />
          </label>
        </div>
      ) : null}

      {phase === "recording" ? (
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-danger" aria-hidden />
          <span className="tabular-nums text-lg" aria-live="off">
            {formatElapsed(elapsed)}
          </span>
          <button type="button" onClick={stop} className="btn btn-secondary">
            Stop
          </button>
          <span className="text-sm text-ink-soft">
            Take your time. Wander off the question if you want to.
          </span>
        </div>
      ) : null}

      {phase === "recorded" && blobUrl ? (
        <div className="space-y-4">
          {kind === "video" ? (
            <video src={blobUrl} controls playsInline className="w-full rounded-card bg-well-ink" />
          ) : (
            <audio src={blobUrl} controls className="w-full" />
          )}
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={busy}
              onClick={() => blobRef.current && onUse(blobRef.current.blob, blobRef.current.name)}
              className="btn btn-primary"
            >
              Use this {kind === "video" ? "video" : "recording"}
            </button>
            <button type="button" disabled={busy} onClick={again} className="btn btn-secondary">
              Record again
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
