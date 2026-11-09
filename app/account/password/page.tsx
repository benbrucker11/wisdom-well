import Link from "next/link";
import { canSetPasswordWithoutCurrent, requireUser } from "@/lib/auth";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";
import { setPasswordAction } from "../../login/actions";

const ERRORS: Record<string, string> = {
  too_short: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  too_long: "That password is too long.",
  mismatch: "The two passwords didn't match.",
  current: "Your current password wasn't right.",
};

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; next?: string; via?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const needsCurrent = !(await canSetPasswordWithoutCurrent(user));
  const hasPassword = Boolean(user.passwordHash);

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="font-serif text-h2 text-ink">
        {hasPassword ? "Change your password" : "Set your password"}
      </h1>
      {sp.via === "email" && !hasPassword ? (
        <p className="mt-2 text-ink-soft">
          From now on you&rsquo;ll sign in with your email and this password.
        </p>
      ) : null}

      <div className="card mt-6">
        {sp.saved ? (
          <div className="space-y-3">
            <p className="text-ink">Your password is saved.</p>
            <Link href="/" className="btn btn-primary no-underline">
              Continue
            </Link>
          </div>
        ) : (
          <form action={setPasswordAction} className="space-y-4">
            <input type="hidden" name="next" value={sp.next ?? "/"} />
            {sp.error && ERRORS[sp.error] ? (
              <p className="text-sm text-danger" role="alert">
                {ERRORS[sp.error]}
              </p>
            ) : null}
            <p className="text-sm text-ink-soft">Signed in as {user.email}</p>
            {needsCurrent ? (
              <label className="block">
                <span className="text-sm text-ink-soft">Current password</span>
                <input
                  type="password"
                  name="current"
                  required
                  autoComplete="current-password"
                  className="field mt-1"
                />
              </label>
            ) : null}
            <label className="block">
              <span className="text-sm text-ink-soft">
                New password{" "}
                <span className="text-ink-soft/70">(at least {PASSWORD_MIN_LENGTH} characters)</span>
              </span>
              <input
                type="password"
                name="password"
                required
                minLength={PASSWORD_MIN_LENGTH}
                autoFocus
                autoComplete="new-password"
                className="field mt-1"
              />
            </label>
            <label className="block">
              <span className="text-sm text-ink-soft">New password again</span>
              <input
                type="password"
                name="confirm"
                required
                minLength={PASSWORD_MIN_LENGTH}
                autoComplete="new-password"
                className="field mt-1"
              />
            </label>
            <button type="submit" className="btn btn-primary w-full">
              Save password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
