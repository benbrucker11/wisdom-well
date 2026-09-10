import { type NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { polishEntryWithAi } from "@/lib/transcription";

// The Claude call is the slow part.
export const maxDuration = 60;

/**
 * Manually run (or re-run) the Claude polish on a voice entry's draft. Used by
 * the "Polish with AI" button when the inline attempt during transcription
 * timed out. Only the author, only while it's still a mechanical draft.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { member } = await requireMember();
  const { id } = await params;

  const entry = await prisma.entry.findFirst({
    where: { id, familyId: member.familyId, authorMemberId: member.id },
    select: { id: true },
  });
  if (!entry) return new NextResponse(null, { status: 404 });

  const applied = await polishEntryWithAi(id);
  return NextResponse.json({ applied });
}
