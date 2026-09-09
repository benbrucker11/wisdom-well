import { NextResponse } from "next/server";
import { requireMember } from "@/lib/auth";
import { buildFamilyExport } from "@/lib/export";

// Bundling media can take a moment for a large family.
export const maxDuration = 60;

export async function GET() {
  const { member } = await requireMember();
  const { filename, bytes } = await buildFamilyExport(member.id);

  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  return new NextResponse(body, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
