"use client";

import { useState } from "react";

type MediaType = "TEXT" | "IMAGE" | "VIDEO" | "AUDIO";

function mediaTypeFor(file: File): MediaType {
  if (file.type.startsWith("image/")) return "IMAGE";
  if (file.type.startsWith("video/")) return "VIDEO";
  if (file.type.startsWith("audio/")) return "AUDIO";
  return "TEXT";
}

export function MediaUpload({
  initialUrl = "",
  initialType = "TEXT",
}: {
  initialUrl?: string;
  initialType?: MediaType;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [type, setType] = useState<MediaType>(initialType);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("prefix", "entry-media");
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const data = (await res.json()) as { url: string };
      setUrl(data.url);
      setType(mediaTypeFor(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="mediaUrl" value={url} />
      <input type="hidden" name="mediaType" value={type} />

      {url ? (
        <div className="space-y-2">
          {type === "IMAGE" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="max-h-64 rounded-card border border-mist" />
          ) : type === "VIDEO" ? (
            <video src={url} controls className="max-h-64 rounded-card border border-mist" />
          ) : type === "AUDIO" ? (
            <audio src={url} controls />
          ) : null}
          <button
            type="button"
            onClick={() => {
              setUrl("");
              setType("TEXT");
            }}
            className="btn-text text-sm hover:text-danger"
          >
            Remove attachment
          </button>
        </div>
      ) : (
        <label className="block text-sm text-ink-soft">
          Attach a photo or video (optional)
          <input
            type="file"
            accept="image/*,video/*"
            onChange={onPick}
            disabled={busy}
            className="mt-1 block w-full text-sm"
          />
        </label>
      )}

      {busy ? <p className="text-sm text-ink-soft">Uploading&hellip;</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
