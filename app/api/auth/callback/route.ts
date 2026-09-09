import { type NextRequest, NextResponse } from "next/server";
import { consumeMagicLink, createSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/login?error=invalid", req.url));
  }

  const user = await consumeMagicLink(token);
  if (!user) {
    return NextResponse.redirect(new URL("/login?error=expired", req.url));
  }

  await createSession(user.id);
  return NextResponse.redirect(new URL("/", req.url));
}
