import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { visibleEntry } from "@/lib/release";
import { contentTypeForKey, etagFor, getObject } from "@/lib/storage";

/**
 * Serves entry media / raw audio. Access follows the entry: you can fetch the
 * bytes only if you can see the entry that references them. A guessed URL for a
 * gated entry returns 404, exactly as the entry itself would.
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

  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new NextResponse(body, {
    headers: {
      "content-type": contentTypeForKey(key),
      "cache-control": "private, max-age=3600",
      etag,
    },
  });
}
