"use client";

import { useState } from "react";
import { uploadFile } from "../../_lib/upload-client";

type MediaType = "TEXT" | "IMAGE" | "VIDEO" | "AUDIO";

function mediaTypeFor(file: File): MediaType {
  if (file.type.startsWith("image/")) return "IMAGE";
  if (file.type.startsWith("video/")) return "VIDEO";
  if (file.type.startsWith("audio/")) return "AUDIO";
  return "TEXT";
}

/**
 * Attach a photo (or an existing video file) to a piece of wisdom. Writes
 * hidden `mediaUrl` / `mediaType` fields for the surrounding form. When
 * `mediaTypeField` is false the type isn't submitted (recorded wisdom keeps its
 * VOICE / VIDEO type; the attachment is rendered by file type).
 */
export function MediaUpload({
  initialUrl = "",
  initialType = "TEXT",
  label = "Attach a photo or video (optional)",
  accept = "image/*,video/*",
  mediaTypeField = true,
}: {
  initialUrl?: string;
  initialType?: MediaType;
  label?: string;
  accept?: string;
  mediaTypeField?: boolean;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [type, setType] = useState<MediaType>(initialType);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setProgress(0);
    setError(null);
    try {
      const uploaded = await uploadFile(file, file.name, "entry-media", setProgress);
      setUrl(uploaded.url);
      setType(mediaTypeFor(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="mediaUrl" value={url} />
      {mediaTypeField ? <input type="hidden" name="mediaType" value={type} /> : null}

      {url ? (
        <div className="space-y-2">
          {type === "IMAGE" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="max-h-64 rounded-card border border-mist" />
          ) : type === "VIDEO" ? (
            <video src={url} controls playsInline className="max-h-64 rounded-card border border-mist" />
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
          {label}
          <input
            type="file"
            accept={accept}
            onChange={onPick}
            disabled={progress !== null}
            className="mt-1 block w-full text-sm"
          />
        </label>
      )}

      {progress !== null ? (
        <p className="text-sm text-ink-soft">Uploading&hellip; {Math.round(progress * 100)}%</p>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
