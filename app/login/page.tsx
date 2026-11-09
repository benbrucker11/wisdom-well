import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { StackedLogo } from "../_components/brand-logo";
import { requestMagicLink, signInAction } from "./actions";

const ERRORS: Record<string, string> = {
  invalid: "That email and password don't match. Check them and try again.",
  locked:
    "Too many attempts. For your safety, password sign-in is paused for 15 minutes — you can still sign in with an emailed link below.",
  no_password:
    "This account doesn't have a password yet. Email yourself a sign-in link below, then set one.",
  expired: "That link has expired or was already used. Request a new one.",
  exists: "There's already an account with that email. Sign in below.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; mode?: string; email?: string; next?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const sp = await searchParams;
  const linkMode = sp.mode === "link" || sp.error === "no_password" || sp.error === "locked";

  return (
    <div className="mx-auto max-w-sm">
      <div className="flex justify-center">
        <StackedLogo width={140} />
      </div>
      <h1 className="mt-6 text-center font-serif text-h2 text-ink">Sign in</h1>

      <div className="card mt-8">
        {sp.sent ? (
          <div>
            <p className="text-ink">
              Check your email for a sign-in link. It expires in 15 minutes.
            </p>
            <p className="mt-2 text-sm text-ink-soft">
              Running locally? The link is also printed in the server console.
            </p>
          </div>
        ) : (
          <>
            {sp.error && ERRORS[sp.error] ? (
              <p className="mb-4 text-sm text-danger" role="alert">
                {ERRORS[sp.error]}
              </p>
            ) : null}

            <form action={signInAction} className="space-y-4">
              <input type="hidden" name="next" value={sp.next ?? "/"} />
              <label className="block">
                <span className="text-sm text-ink-soft">Email address</span>
                <input
                  type="email"
                  name="email"
                  required
                  autoFocus={!linkMode}
                  autoComplete="email"
                  defaultValue={sp.email ?? ""}
                  className="field mt-1"
                />
              </label>
              <label className="block">
                <span className="flex items-baseline justify-between text-sm text-ink-soft">
                  Password
                  <Link href="/forgot-password" className="text-sm">
                    Forgot password?
                  </Link>
                </span>
                <input
                  type="password"
                  name="password"
                  required
                  autoComplete="current-password"
                  className="field mt-1"
                />
              </label>
              <button type="submit" className="btn btn-primary w-full">
                Sign in
              </button>
            </form>

            <details className="mt-6 border-t border-mist pt-4" open={linkMode}>
              <summary className="cursor-pointer text-sm text-ink-soft">
                Email me a sign-in link instead
              </summary>
              <form action={requestMagicLink} className="mt-3 space-y-3">
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  defaultValue={sp.email ?? ""}
                  placeholder="you@example.com"
                  className="field"
                  aria-label="Email address for a sign-in link"
                />
                <button type="submit" className="btn btn-secondary w-full">
                  Email me a link
                </button>
              </form>
            </details>
          </>
        )}
      </div>

      <p className="mt-6 text-center text-sm text-ink-soft">
        New to Wisdom Well? <Link href="/signup">Create an account</Link>
      </p>
    </div>
  );
}
