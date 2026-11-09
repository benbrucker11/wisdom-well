import { type NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/auth";
import { isStoragePrefix, putObject } from "@/lib/storage";

// Fallback path for local-disk storage (dev). With S3/R2 configured, large
// files go straight to the bucket via /api/uploads/presign instead.
const MAX_BYTES = 500 * 1024 * 1024;

export async function POST(req: NextRequest) {
  // Any signed-in family member may upload; the file only becomes reachable
  // once it is attached to an entry they can see.
  await requireMember();

  const form = await req.formData();
  const file = form.get("file");
  const prefixRaw = String(form.get("prefix") ?? "entry-media");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }
  const prefix = isStoragePrefix(prefixRaw) ? prefixRaw : "entry-media";

  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    const stored = await putObject(
      { name: file.name, type: file.type, bytes },
      { prefix },
    );
    return NextResponse.json(stored);
  } catch (err) {
    console.error("putObject failed", err);
    return NextResponse.json(
      { error: "Could not save the file. Storage isn't reachable right now." },
      { status: 502 },
    );
  }
}
