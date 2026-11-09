import { type NextRequest, NextResponse } from "next/server";
import { consumeMagicLink, createSession } from "@/lib/auth";

/** Where each kind of emailed link lands after signing the person in. */
const LANDING: Record<string, string> = {
  SIGN_IN: "/",
  INVITE: "/welcome",
  SET_PASSWORD: "/account/password?via=email",
  RESET_PASSWORD: "/account/password?via=reset",
};

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/login?error=invalid", req.url));
  }

  const result = await consumeMagicLink(token);
  if (!result) {
    return NextResponse.redirect(new URL("/login?error=expired", req.url));
  }

  await createSession(result.user.id);
  return NextResponse.redirect(new URL(LANDING[result.purpose] ?? "/", req.url));
}
