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

export async function putObject(
  file: { name: string; type: string; bytes: Buffer },
  opts: { prefix: "entry-media" | "raw-audio" },
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
  aiff: "audio/aiff",
  aif: "audio/aiff",
};

export function contentTypeForKey(key: string, fallback?: string): string {
  const ext = path.extname(key).replace(".", "").toLowerCase();
  return CONTENT_TYPES[ext] ?? fallback ?? "application/octet-stream";
}
