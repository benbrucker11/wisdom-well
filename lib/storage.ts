// Server-only in practice (filesystem / cloud storage); not importing
// "server-only" so the e2e scripts can stage fixtures through it.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Object storage for entry media and raw interview audio.
 *
 * Two drivers:
 *  - local disk (default) — runs with no credentials, for local dev;
 *  - S3-compatible (set S3_BUCKET) — for any serverless host, where the disk is
 *    ephemeral. Cloudflare R2 is the recommended target.
 *
 * Either way, files are addressed by an opaque key and served back through
 * `/api/media/<key>`, which enforces the same visibility gate as the entry
 * that references them (spec §5). Raw interview audio is retained permanently
 * and never deleted after transcription (spec §6).
 */

const STORAGE_DIR =
  process.env.STORAGE_DIR ?? path.join(process.cwd(), "storage");

const usingS3 = Boolean(process.env.S3_BUCKET);

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

function safeKey(key: string): string {
  const normalized = path.posix.normalize(key);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error("invalid storage key");
  }
  return normalized;
}

// --- S3 driver (lazy — the SDK is only loaded when configured) ------------

let s3Client: import("@aws-sdk/client-s3").S3Client | null = null;

async function s3(): Promise<import("@aws-sdk/client-s3").S3Client> {
  if (!s3Client) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    s3Client = new S3Client({
      region: process.env.S3_REGION ?? "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(process.env.S3_ENDPOINT), // R2 / MinIO
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined, // fall back to the ambient AWS credential chain
    });
  }
  return s3Client;
}

// --- Public API ---------------------------------------------------------

/** Where an object lives: attachments, voice recordings, video recordings. */
export type StoragePrefix = "entry-media" | "raw-audio" | "raw-video";
export const STORAGE_PREFIXES: StoragePrefix[] = ["entry-media", "raw-audio", "raw-video"];

export function isStoragePrefix(x: string): x is StoragePrefix {
  return (STORAGE_PREFIXES as string[]).includes(x);
}

export function mediaUrlForKey(key: string): string {
  return `/api/media/${key}`;
}

/** "/api/media/raw-video/2026/…" → "raw-video/2026/…"; null if not ours. */
export function keyFromMediaUrl(url: string): string | null {
  const m = url.match(/^\/api\/media\/(.+)$/);
  if (!m) return null;
  try {
    return safeKey(m[1]);
  } catch {
    return null;
  }
}

export async function putObject(
  file: { name: string; type: string; bytes: Buffer },
  opts: { prefix: StoragePrefix },
): Promise<StoredObject> {
  const key = keyFor(file.name, opts.prefix);
  const contentType = contentTypeForKey(key, file.type);

  if (usingS3) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (
      await s3()
    ).send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: file.bytes,
        ContentType: contentType,
      }),
    );
  } else {
    const dest = path.join(STORAGE_DIR, safeKey(key));
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, file.bytes);
  }

  return { url: `/api/media/${key}`, key, contentType, bytes: file.bytes.length };
}

/** Read bytes back for the /api/media route. */
export async function getObject(key: string): Promise<Buffer> {
  const safe = safeKey(key);

  if (usingS3) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const res = await (
      await s3()
    ).send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: safe }),
    );
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error("empty object");
    return Buffer.from(bytes);
  }

  return readFile(path.join(STORAGE_DIR, safe));
}

/** Permanently remove an object — only ever used for unpublished entry media. */
export async function deleteObject(key: string): Promise<void> {
  const safe = safeKey(key);
  if (usingS3) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (
      await s3()
    ).send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: safe }));
  } else {
    const { unlink } = await import("node:fs/promises");
    await unlink(path.join(STORAGE_DIR, safe)).catch(() => {});
  }
}

// --- Direct (browser → bucket) uploads ---------------------------------------
//
// Hosted serverless functions cap request bodies at a few MB, so long phone
// videos can't pass through the app. With S3/R2 configured, the browser PUTs
// straight to the bucket using a short-lived signed URL; the app only issues
// the URL and later records the key. Reads still go through /api/media, which
// checks visibility before redirecting to a short-lived signed GET.
//
// The bucket needs a CORS rule allowing PUT from the app's origin — see
// docs/DEPLOY.md.

export function directUploadsEnabled(): boolean {
  return usingS3;
}

const UPLOAD_URL_TTL_S = 60 * 60; // 1 hour to finish a long upload
const DOWNLOAD_URL_TTL_S = 60 * 10;

export async function presignUpload(
  name: string,
  contentType: string,
  prefix: StoragePrefix,
): Promise<{ key: string; uploadUrl: string; url: string; contentType: string }> {
  if (!usingS3) throw new Error("direct uploads need S3_BUCKET");
  const key = keyFor(name, prefix);
  const type = contentTypeForKey(key, contentType);
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const uploadUrl = await getSignedUrl(
    await s3(),
    new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, ContentType: type }),
    { expiresIn: UPLOAD_URL_TTL_S },
  );
  return { key, uploadUrl, url: mediaUrlForKey(key), contentType: type };
}

/**
 * A short-lived signed GET for an object. Only call this after the caller's
 * access has been checked (the media route) or for a trusted server-side
 * consumer (handing a recording to the transcription service).
 */
export async function presignDownload(key: string, ttlSeconds = DOWNLOAD_URL_TTL_S): Promise<string> {
  if (!usingS3) throw new Error("signed downloads need S3_BUCKET");
  const safe = safeKey(key);
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  return getSignedUrl(
    await s3(),
    new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: safe,
      ResponseContentType: contentTypeForKey(safe),
    }),
    { expiresIn: ttlSeconds },
  );
}

/** Whether an object exists (used to confirm a direct upload finished). */
export async function objectExists(key: string): Promise<boolean> {
  let safe: string;
  try {
    safe = safeKey(key);
  } catch {
    return false;
  }
  if (usingS3) {
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      await (await s3()).send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: safe }));
      return true;
    } catch {
      return false;
    }
  }
  const { stat } = await import("node:fs/promises");
  return stat(path.join(STORAGE_DIR, safe)).then(
    () => true,
    () => false,
  );
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
  m4v: "video/mp4",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  aiff: "audio/aiff",
  aif: "audio/aiff",
};

export function contentTypeForKey(key: string, fallback?: string): string {
  const ext = path.extname(key).replace(".", "").toLowerCase();
  // Browser voice recordings come out as .webm / .mp4 containers holding only
  // audio; serve them as audio so players don't show an empty video frame.
  if (key.startsWith("raw-audio/") && (ext === "webm" || ext === "mp4")) {
    return ext === "webm" ? "audio/webm" : "audio/mp4";
  }
  return CONTENT_TYPES[ext] ?? fallback ?? "application/octet-stream";
}
