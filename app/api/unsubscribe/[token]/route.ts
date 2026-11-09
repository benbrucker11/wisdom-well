import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * One-click unsubscribe (RFC 8058): mail providers POST here when someone
 * presses "Unsubscribe" in their inbox. Turns reminders off; nothing else.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (token) {
    await prisma.user.updateMany({
      where: { unsubscribeToken: token },
      data: { reminderFrequency: "OFF" },
    });
  }
  return new NextResponse(null, { status: 204 });
}
