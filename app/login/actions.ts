"use server";

import { redirect } from "next/navigation";
import {
  canSetPasswordWithoutCurrent,
  createSession,
  issueMagicLink,
  issuePasswordReset,
  issuePasswordSetupPrompt,
  requireUser,
  setUserPassword,
  signInWithPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { passwordProblem, verifyPassword } from "@/lib/password";
import { requestOrigin } from "@/lib/request-origin";

function emailFrom(formData: FormData): string {
  return String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
}

const validEmail = (email: string) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/** Only same-site relative paths survive as a post-sign-in destination. */
function safeNext(raw: FormDataEntryValue | null): string {
  const next = String(raw ?? "");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

// --- Sign in -------------------------------------------------------------------

export async function signInAction(formData: FormData) {
  const email = emailFrom(formData);
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  if (!validEmail(email) || !password) redirect("/login?error=invalid");

  const result = await signInWithPassword(email, password);
  if (!result.ok) {
    const q = new URLSearchParams({ error: result.reason, email });
    redirect(`/login?${q}`);
  }
  await createSession(result.userId);
  redirect(next);
}

/** "Email me a sign-in link instead." */
export async function requestMagicLink(formData: FormData) {
  const email = emailFrom(formData);
  if (!validEmail(email)) redirect("/login?mode=link&error=invalid");
  await issueMagicLink(email, await requestOrigin());
  redirect("/login?sent=1");
}

// --- Sign up -------------------------------------------------------------------

export async function signUpAction(formData: FormData) {
  const email = emailFrom(formData);
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!validEmail(email)) redirect("/signup?error=email");
  const problem = passwordProblem(password);
  if (problem) redirect(`/signup?error=${problem}&email=${encodeURIComponent(email)}`);
  if (password !== confirm) redirect(`/signup?error=mismatch&email=${encodeURIComponent(email)}`);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.passwordHash) {
    redirect(`/login?error=exists&email=${encodeURIComponent(email)}`);
  }
  if (existing) {
    // An account from the email-link days. We can't set a password for an
    // inbox we haven't verified, so email them the set-password link instead.
    await prisma.user.update({ where: { id: existing.id }, data: { passwordPromptSentAt: null } });
    await issuePasswordSetupPrompt(existing.id, await requestOrigin());
    redirect("/signup?sent=1");
  }

  const user = await prisma.user.create({ data: { email } });
  await setUserPassword(user.id, password);
  await createSession(user.id);
  redirect("/onboarding");
}

// --- Forgot / set password ---------------------------------------------------

export async function requestPasswordReset(formData: FormData) {
  const email = emailFrom(formData);
  if (!validEmail(email)) redirect("/forgot-password?error=invalid");
  await issuePasswordReset(email, await requestOrigin());
  // Same answer whether or not the account exists.
  redirect("/forgot-password?sent=1");
}

export async function setPasswordAction(formData: FormData) {
  const user = await requireUser();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const current = String(formData.get("current") ?? "");
  const next = safeNext(formData.get("next"));
  // The welcome flow shows its own errors; everything else returns here.
  const back =
    next === "/welcome" ? "/welcome?step=1" : `/account/password?next=${encodeURIComponent(next)}`;

  const problem = passwordProblem(password);
  if (problem) redirect(`${back}&error=${problem}`);
  if (password !== confirm) redirect(`${back}&error=mismatch`);

  if (!(await canSetPasswordWithoutCurrent(user))) {
    if (!(await verifyPassword(current, user.passwordHash))) {
      redirect(`${back}&error=current`);
    }
  }

  await setUserPassword(user.id, password);
  redirect(next === "/" ? "/account/password?saved=1" : next);
}
