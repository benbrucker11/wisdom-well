import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import type { TokenPurpose } from "@prisma/client";
import {
  sendInviteEmail,
  sendMagicLinkEmail,
  sendPasswordResetEmail,
  sendPasswordSetupEmail,
} from "./mail";
import { afterFailedAttempt, hashPassword, isLocked, verifyPassword } from "./password";

const SESSION_COOKIE = "ww_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const MAGIC_LINK_TTL_MS = 1000 * 60 * 15; // 15 minutes
const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const SET_PASSWORD_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const RESET_TTL_MS = 1000 * 60 * 60; // 1 hour

function newToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

async function issueToken(opts: {
  email: string;
  purpose: TokenPurpose;
  ttlMs: number;
  memberId?: string;
}): Promise<string> {
  const token = newToken();
  await prisma.magicLinkToken.create({
    data: {
      token,
      email: opts.email,
      purpose: opts.purpose,
      memberId: opts.memberId ?? null,
      expiresAt: new Date(Date.now() + opts.ttlMs),
    },
  });
  return token;
}

const callbackUrl = (origin: string, token: string) =>
  `${origin}/api/auth/callback?token=${token}`;

// --- Emailed links -----------------------------------------------------------

/** "Email me a sign-in link instead" — kept as a fallback to passwords. */
export async function issueMagicLink(email: string, origin: string): Promise<string> {
  const token = await issueToken({ email, purpose: "SIGN_IN", ttlMs: MAGIC_LINK_TTL_MS });
  const url = callbackUrl(origin, token);
  await sendMagicLinkEmail(email, url);
  return url;
}

/**
 * "Forgot password?" Only sends when an account exists, but the caller shows
 * the same message either way so the form can't be used to probe for emails.
 */
export async function issuePasswordReset(email: string, origin: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  const token = await issueToken({ email, purpose: "RESET_PASSWORD", ttlMs: RESET_TTL_MS });
  await sendPasswordResetEmail(email, callbackUrl(origin, token));
}

/**
 * The one-time "Wisdom Well now uses a password — set yours" email, for an
 * account that has never set one. Records that it was sent so it goes once.
 */
export async function issuePasswordSetupPrompt(userId: string, origin: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.passwordHash || user.passwordPromptSentAt) return false;
  const token = await issueToken({
    email: user.email,
    purpose: "SET_PASSWORD",
    ttlMs: SET_PASSWORD_TTL_MS,
  });
  const result = await sendPasswordSetupEmail(user.email, callbackUrl(origin, token));
  if (result.delivered || result.via === "none") {
    await prisma.user.update({ where: { id: user.id }, data: { passwordPromptSentAt: new Date() } });
  }
  return result.delivered;
}

export type InviteResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "already_member" | "email_in_use" };

/**
 * Invite an existing, login-less Member by email: issues a link tied to that
 * member so redemption links the two, then walks them through setting a
 * password and confirming their details (spec: invite-by-email).
 */
export async function issueMemberInvite(
  memberId: string,
  email: string,
  origin: string,
): Promise<InviteResult> {
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) return { ok: false, reason: "not_found" };
  if (member.userId) return { ok: false, reason: "already_member" };

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const linkedElsewhere = await prisma.member.findFirst({
      where: { userId: existingUser.id, NOT: { id: memberId } },
    });
    if (linkedElsewhere) return { ok: false, reason: "email_in_use" };
  }

  const token = await issueToken({ email, purpose: "INVITE", ttlMs: INVITE_TTL_MS, memberId });
  await sendInviteEmail(email, callbackUrl(origin, token));
  return { ok: true };
}

/**
 * Validate and burn an emailed token, returning the matching User (creating it
 * on first sign-in) and what the link was for. Returns null if the token is
 * unknown, used, or expired. An INVITE links that Member to the User (unless it
 * was already linked in the meantime, which is left untouched).
 */
export async function consumeMagicLink(token: string) {
  const row = await prisma.magicLinkToken.findUnique({ where: { token } });
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    return null;
  }

  // Burn it atomically so a double-click can't redeem it twice.
  const burned = await prisma.magicLinkToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (burned.count === 0) return null;

  const user = await prisma.user.upsert({
    where: { email: row.email },
    // Proving control of the inbox clears any password lockout.
    update: { failedLoginCount: 0, lockedUntil: null },
    create: { email: row.email },
  });

  if (row.memberId) {
    const member = await prisma.member.findUnique({ where: { id: row.memberId } });
    if (member && !member.userId) {
      await prisma.member.update({ where: { id: member.id }, data: { userId: user.id } });
    } else if (member && member.userId !== user.id) {
      console.error(
        `Invite conflict: member ${member.id} already linked to a different user; leaving it alone.`,
      );
    }
  }

  return { user, purpose: row.purpose };
}

// --- Passwords ---------------------------------------------------------------

export type PasswordSignInResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "locked" | "no_password" };

/**
 * Email + password sign-in. Five wrong passwords lock the account for 15
 * minutes (an emailed sign-in link still works and clears the lock). An account
 * that has never set a password gets "no_password" so the page can offer the
 * emailed link instead of a misleading "wrong password".
 */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<PasswordSignInResult> {
  const user = await prisma.user.findUnique({ where: { email } });
  const now = new Date();
  if (!user) {
    // Same work as a real check, so timing doesn't reveal which emails exist.
    await verifyPassword(password, DUMMY_HASH);
    return { ok: false, reason: "invalid" };
  }
  if (isLocked(user.lockedUntil, now)) return { ok: false, reason: "locked" };
  if (!user.passwordHash) return { ok: false, reason: "no_password" };

  if (await verifyPassword(password, user.passwordHash)) {
    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    }
    return { ok: true, userId: user.id };
  }

  const next = afterFailedAttempt(user.failedLoginCount, now);
  await prisma.user.update({ where: { id: user.id }, data: next });
  return { ok: false, reason: next.lockedUntil ? "locked" : "invalid" };
}

// A well-formed hash that matches nothing, used only to equalise timing.
const DUMMY_HASH = ["scrypt", "16384", Buffer.alloc(16).toString("base64"), Buffer.alloc(64).toString("base64")].join("$");

/**
 * Whether this user may set a new password without typing the current one:
 * they have none yet, or they arrived in the last 30 minutes through an
 * emailed set-password / reset / invite link (which proves the inbox).
 */
export async function canSetPasswordWithoutCurrent(user: {
  email: string;
  passwordHash: string | null;
}): Promise<boolean> {
  if (!user.passwordHash) return true;
  const recent = await prisma.magicLinkToken.findFirst({
    where: {
      email: user.email,
      purpose: { in: ["SET_PASSWORD", "RESET_PASSWORD", "INVITE"] },
      usedAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
    },
    select: { id: true },
  });
  return recent != null;
}

export async function setUserPassword(userId: string, password: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(password),
      failedLoginCount: 0,
      lockedUntil: null,
      // Setting one any way counts as having answered the setup email.
      passwordPromptSentAt: new Date(),
    },
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

  await recordActivity(session.user);
  return session.user;
}

const ACTIVITY_THROTTLE_MS = 60 * 60 * 1000; // at most one write per hour

/**
 * Keep `lastSeenAt` roughly current so steward-inactivity detection (Phase 3)
 * has something to measure against, and cancel a pending inactivity handover
 * the moment a steward signs back in.
 */
async function recordActivity(
  user: { id: string; lastSeenAt: Date; member: { id: string } | null },
): Promise<void> {
  if (Date.now() - user.lastSeenAt.getTime() < ACTIVITY_THROTTLE_MS) return;

  const now = new Date();
  user.lastSeenAt = now;
  await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: now } }).catch(
    () => {},
  );

  if (user.member) {
    const { cancelTransferOnStewardReturn } = await import("./succession");
    await cancelTransferOnStewardReturn(user.member.id).catch(() => {});
  }
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
  // An invited person reviews their own name and birthday once, first.
  if (!user.member.detailsConfirmedAt) redirect("/welcome");
  return { user, member: user.member };
}

/** A member who is the current steward of their family. Redirects otherwise. */
export async function requireSteward() {
  const { user, member } = await requireMember();
  if (member.family.stewardMemberId !== member.id) redirect("/steward");
  return { user, member };
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }
  jar.delete(SESSION_COOKIE);
}

/**
 * Daily-job sweep: the one-time "set your password" email to everyone who
 * signed up in the email-link days and hasn't set one. Invitees mid-welcome are
 * skipped — their invite already walks them through it.
 */
export async function sendPendingPasswordPrompts(origin: string, limit = 50): Promise<number> {
  const users = await prisma.user.findMany({
    where: {
      passwordHash: null,
      passwordPromptSentAt: null,
      OR: [{ member: null }, { member: { detailsConfirmedAt: { not: null } } }],
    },
    select: { id: true },
    take: limit,
  });
  let sent = 0;
  for (const u of users) {
    if (await issuePasswordSetupPrompt(u.id, origin).catch(() => false)) sent += 1;
  }
  return sent;
}
