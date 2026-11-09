import { type NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/auth";
import { directUploadsEnabled, isStoragePrefix, presignUpload } from "@/lib/storage";

/**
 * Step 1 of a direct upload: hand the browser a short-lived signed PUT URL so a
 * large file (a long phone video) goes straight to the bucket. When storage is
 * local disk, answers { direct: false } and the browser posts to /api/uploads.
 */
export async function POST(req: NextRequest) {
  await requireMember();
  if (!directUploadsEnabled()) return NextResponse.json({ direct: false });

  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    type?: unknown;
    prefix?: unknown;
  } | null;
  const name = typeof body?.name === "string" ? body.name.slice(0, 200) : "upload";
  const type = typeof body?.type === "string" ? body.type.slice(0, 100) : "";
  const prefix = typeof body?.prefix === "string" && isStoragePrefix(body.prefix) ? body.prefix : "entry-media";

  try {
    const signed = await presignUpload(name, type, prefix);
    return NextResponse.json({ direct: true, ...signed });
  } catch (err) {
    console.error("presignUpload failed", err);
    return NextResponse.json({ error: "Storage isn't reachable right now." }, { status: 502 });
  }
}
