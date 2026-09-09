import { type NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { advanceTranscription } from "@/lib/transcription";

/**
 * Poll target for the interview page. Each hit checks AssemblyAI; the first one
 * to see a completed job stores the transcript, runs reconciliation, and moves
 * the entry to DRAFT. The author polls this until `state` leaves "PROCESSING".
 *
 * (A webhook would be tidier in production; polling keeps the prototype
 * dependency-free and works on localhost.)
 */
export async function GET(
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

  const result = await advanceTranscription(id);
  return NextResponse.json(result);
}
