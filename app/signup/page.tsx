import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";
import { StackedLogo } from "../_components/brand-logo";
import { signUpAction } from "../login/actions";

const ERRORS: Record<string, string> = {
  email: "Enter a valid email address.",
  too_short: `Use at least ${PASSWORD_MIN_LENGTH} characters for your password.`,
  too_long: "That password is too long.",
  mismatch: "The two passwords didn't match.",
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string; sent?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const sp = await searchParams;

  return (
    <div className="mx-auto max-w-sm">
      <div className="flex justify-center">
        <StackedLogo width={140} />
      </div>
      <h1 className="mt-6 text-center font-serif text-h2 text-ink">
        Start your family&rsquo;s well
      </h1>
      <p className="mt-2 text-center text-ink-soft">
        Create your account. Next, you&rsquo;ll name your family and become its
        first steward.
      </p>

      <div className="card mt-8">
        {sp.sent ? (
          <p className="text-ink">
            You already have an account from before we used passwords. We&rsquo;ve
            emailed you a link to set your password &mdash; open it to continue.
          </p>
        ) : (
          <form action={signUpAction} className="space-y-4">
            {sp.error && ERRORS[sp.error] ? (
              <p className="text-sm text-danger" role="alert">
                {ERRORS[sp.error]}
              </p>
            ) : null}
            <label className="block">
              <span className="text-sm text-ink-soft">Email address</span>
              <input
                type="email"
                name="email"
                required
                autoFocus
                autoComplete="email"
                defaultValue={sp.email ?? ""}
                className="field mt-1"
              />
            </label>
            <label className="block">
              <span className="text-sm text-ink-soft">
                Password{" "}
                <span className="text-ink-soft/70">(at least {PASSWORD_MIN_LENGTH} characters)</span>
              </span>
              <input
                type="password"
                name="password"
                required
                minLength={PASSWORD_MIN_LENGTH}
                autoComplete="new-password"
                className="field mt-1"
              />
            </label>
            <label className="block">
              <span className="text-sm text-ink-soft">Password again</span>
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
              Create account
            </button>
          </form>
        )}
      </div>

      <p className="mt-6 text-center text-sm text-ink-soft">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
      <p className="mt-2 text-center text-sm text-ink-soft">
        Joining a family that&rsquo;s already here? Use the invite email or join
        link the family&rsquo;s steward sent you.
      </p>
    </div>
  );
}
