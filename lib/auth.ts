import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { sendMagicLinkEmail } from "./mail";

const SESSION_COOKIE = "ww_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const MAGIC_LINK_TTL_MS = 1000 * 60 * 15; // 15 minutes

function newToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// --- Magic link ----------------------------------------------------------

export async function issueMagicLink(email: string, origin: string): Promise<string> {
  const token = newToken();
  await prisma.magicLinkToken.create({
    data: {
      token,
      email,
      expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
    },
  });

  const url = `${origin}/api/auth/callback?token=${token}`;
  await sendMagicLinkEmail(email, url);
  return url;
}

/**
 * Validate and burn a magic-link token, returning the matching User (creating
 * it on first sign-in). Returns null if the token is unknown, used, or expired.
 */
export async function consumeMagicLink(token: string) {
  const row = await prisma.magicLinkToken.findUnique({ where: { token } });
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    return null;
  }

  await prisma.magicLinkToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });

  return prisma.user.upsert({
    where: { email: row.email },
    update: {},
    create: { email: row.email },
  });
}

// --- Sessions ----------------------------------------------------------

export async function createSession(userId: string): Promise<void> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({ data: { token, userId, expiresAt } });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function getCurrentUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          member: { include: { family: true } },
        },
      },
    },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  return session.user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * A user who has finished onboarding (has a Member, which always has a Family).
 * Redirects to /onboarding otherwise.
 */
export async function requireMember() {
  const user = await requireUser();
  if (!user.member) redirect("/onboarding");
  return { user, member: user.member };
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }
  jar.delete(SESSION_COOKIE);
}
