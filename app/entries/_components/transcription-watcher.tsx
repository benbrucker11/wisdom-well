"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Polls the transcription endpoint and refreshes the page when it's done. */
export function TranscriptionWatcher({ entryId }: { entryId: string }) {
  const router = useRouter();

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const res = await fetch(`/api/entries/${entryId}/transcription`);
        const data = await res.json();
        if (data.state !== "PROCESSING") {
          stopped = true;
          router.refresh();
          return;
        }
      } catch {
        // transient
      }
      setTimeout(tick, 4000);
    };
    const first = setTimeout(tick, 2000);
    return () => {
      stopped = true;
      clearTimeout(first);
    };
  }, [entryId, router]);

  return (
    <p className="card card-muted text-sm text-ink-soft">
      Transcribing your recording&hellip; this page will update on its own when
      the draft is ready. The audio is already saved.
    </p>
  );
}
