import { requestMagicLink } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-serif text-3xl">Sign in</h1>
      <p className="mt-3 text-ink-soft">
        We&rsquo;ll email you a link to sign in. There is no password to
        remember.
      </p>

      {sp.sent ? (
        <div className="mt-8 rounded border border-rule bg-white/60 p-5">
          <p>Check your email for a sign-in link. It expires in 15 minutes.</p>
          <p className="mt-2 text-sm text-ink-soft">
            Running locally? The link is also printed in the server console.
          </p>
        </div>
      ) : (
        <form action={requestMagicLink} className="mt-8 space-y-4">
          {sp.error === "invalid" ? (
            <p className="text-sm text-danger">
              Please enter a valid email address.
            </p>
          ) : null}
          {sp.error === "expired" ? (
            <p className="text-sm text-danger">
              That link has expired or was already used. Request a new one.
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
              placeholder="you@example.com"
              className="mt-1 w-full rounded border border-rule bg-white px-4 py-3"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-accent px-5 py-3 text-white hover:opacity-90"
          >
            Email me a link
          </button>
        </form>
      )}
    </div>
  );
}
