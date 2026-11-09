import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { visibleEntry } from "@/lib/release";
import {
  contentTypeForKey,
  directUploadsEnabled,
  etagFor,
  getObject,
  presignDownload,
} from "@/lib/storage";

/**
 * Serves entry media and recordings. Access follows the entry: you can fetch
 * the bytes only if you can see the wisdom that references them. A guessed URL
 * for gated wisdom returns 404, exactly as the wisdom itself would.
 *
 * With S3/R2 configured, a permitted request is redirected to a 10-minute
 * signed URL — large videos stream (with seeking) straight from the bucket
 * instead of through a size-limited serverless function. The bucket itself
 * stays private.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const user = await getCurrentUser();
  if (!user?.member) {
    return new NextResponse(null, { status: 404 });
  }

  const { key: segments } = await params;
  const key = segments.join("/");
  const mediaUrl = `/api/media/${key}`;

  const entry = await prisma.entry.findFirst({
    where: {
      familyId: user.member.familyId,
      OR: [{ mediaUrl }, { rawAudioUrl: mediaUrl }],
    },
    select: { id: true },
  });
  if (!entry) {
    return new NextResponse(null, { status: 404 });
  }

  const view = await visibleEntry(user.member.id, entry.id);
  if (!view) {
    return new NextResponse(null, { status: 404 });
  }

  if (directUploadsEnabled()) {
    try {
      const signed = await presignDownload(key);
      return NextResponse.redirect(signed, {
        status: 302,
        headers: { "cache-control": "private, no-store" },
      });
    } catch {
      return new NextResponse(null, { status: 404 });
    }
  }

  let bytes: Buffer;
  try {
    bytes = await getObject(key);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  const etag = etagFor(bytes);
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304 });
  }

  const contentType = contentTypeForKey(key);
  const total = bytes.byteLength;

  // Byte ranges — Safari won't play audio/video without them.
  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : total - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : total - 1;
    start = Math.max(0, start);
    end = Math.min(end, total - 1);
    if (start > end) {
      return new NextResponse(null, {
        status: 416,
        headers: { "content-range": `bytes */${total}` },
      });
    }
    const slice = bytes.subarray(start, end + 1);
    return new NextResponse(
      slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength) as ArrayBuffer,
      {
        status: 206,
        headers: {
          "content-type": contentType,
          "content-range": `bytes ${start}-${end}/${total}`,
          "content-length": String(slice.byteLength),
          "accept-ranges": "bytes",
          "cache-control": "private, max-age=3600",
          etag,
        },
      },
    );
  }

  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new NextResponse(body, {
    headers: {
      "content-type": contentType,
      "content-length": String(total),
      "accept-ranges": "bytes",
      "cache-control": "private, max-age=3600",
      etag,
    },
  });
}
