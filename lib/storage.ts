import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Object storage for entry media and raw interview audio.
 *
 * The prototype uses a local-disk driver so it runs with no cloud credentials.
 * Set `S3_BUCKET` (+ standard AWS env) to switch to presigned S3 uploads in
 * production — spec §8. The important invariant either way: raw audio is
 * retained permanently and never deleted after transcription (spec §6).
 */

const STORAGE_DIR =
  process.env.STORAGE_DIR ?? path.join(process.cwd(), "storage");

export interface StoredObject {
  /** App-relative URL that serves the bytes back: /api/media/<key>. */
  url: string;
  key: string;
  contentType: string;
  bytes: number;
}

const SAFE_EXT = /^[a-z0-9]{1,8}$/i;

function keyFor(originalName: string, prefix: string): string {
  const ext = path.extname(originalName).replace(".", "").toLowerCase();
  const suffix = SAFE_EXT.test(ext) ? `.${ext}` : "";
  return `${prefix}/${new Date().getUTCFullYear()}/${randomUUID()}${suffix}`;
}

export async function putObject(
  file: { name: string; type: string; bytes: Buffer },
  opts: { prefix: "entry-media" | "raw-audio" },
): Promise<StoredObject> {
  const key = keyFor(file.name, opts.prefix);

  if (process.env.S3_BUCKET) {
    // Production path: upload to S3. Left as a single well-marked seam rather
    // than a half-built integration.
    throw new Error(
      "S3_BUCKET is set but the S3 storage driver is not implemented in this prototype",
    );
  }

  const dest = path.join(STORAGE_DIR, key);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, file.bytes);

  return {
    url: `/api/media/${key}`,
    key,
    contentType: file.type || "application/octet-stream",
    bytes: file.bytes.length,
  };
}

/** Read bytes back for the /api/media route. Rejects path traversal. */
export async function getObject(key: string): Promise<Buffer> {
  const normalized = path.posix.normalize(key);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error("invalid key");
  }
  return readFile(path.join(STORAGE_DIR, normalized));
}

export function etagFor(bytes: Buffer): string {
  return `"${createHash("sha1").update(bytes).digest("hex")}"`;
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
};

export function contentTypeForKey(key: string): string {
  const ext = path.extname(key).replace(".", "").toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}
