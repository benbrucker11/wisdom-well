import Link from "next/link";
import { requestPasswordReset } from "../login/actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="font-serif text-h2 text-ink">Forgot your password?</h1>
      <div className="card mt-6">
        {sp.sent ? (
          <p className="text-ink">
            If there&rsquo;s an account for that email, a reset link is on its
            way. It works once and expires in an hour.
          </p>
        ) : (
          <form action={requestPasswordReset} className="space-y-4">
            <p className="text-sm text-ink-soft">
              Enter your email and we&rsquo;ll send you a link to choose a new
              password.
            </p>
            {sp.error ? (
              <p className="text-sm text-danger" role="alert">
                Enter a valid email address.
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
                className="field mt-1"
              />
            </label>
            <button type="submit" className="btn btn-primary w-full">
              Send reset link
            </button>
          </form>
        )}
      </div>
      <p className="mt-6 text-center text-sm">
        <Link href="/login">Back to sign in</Link>
      </p>
    </div>
  );
}
