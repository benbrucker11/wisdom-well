import { StackedLogo } from "../_components/brand-logo";
import { requestMagicLink } from "./actions";

const STEPS = [
  { label: "Capture", detail: "Speak or write a memory, a lesson, a belief." },
  { label: "Organize", detail: "It's kept with your family tree, in context." },
  { label: "Share", detail: "You decide who receives it, and when." },
  { label: "Carry forward", detail: "It stays for the people who come after." },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <div className="space-y-20">
      <section className="mx-auto max-w-2xl text-center">
        <div className="flex justify-center">
          <StackedLogo width={180} />
        </div>
        <h1 className="mt-8 font-serif italic text-h1 leading-tight text-ink">
          Keep close what matters most.
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed text-ink-soft">
          Wisdom Well gives your family one private place to preserve the
          stories, lessons, values, and perspective you want future
          generations to know.
        </p>

        <div className="card mx-auto mt-10 max-w-sm text-left">
          {sp.sent ? (
            <div>
              <p className="text-ink">
                Check your email for a sign-in link. It expires in 15 minutes.
              </p>
              <p className="mt-2 text-sm text-ink-soft">
                Running locally? The link is also printed in the server
                console.
              </p>
            </div>
          ) : (
            <form action={requestMagicLink} className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-ink">Sign in</h2>
                <p className="mt-1 text-sm text-ink-soft">
                  We&rsquo;ll email you a link. No password to remember.
                </p>
              </div>
              {sp.error === "invalid" ? (
                <p className="text-sm text-danger">
                  Please enter a valid email address.
                </p>
              ) : null}
              {sp.error === "expired" ? (
                <p className="text-sm text-danger">
                  That link has expired or was already used. Request a new
                  one.
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
                  className="field mt-1"
                />
              </label>
              <button type="submit" className="btn btn-primary w-full">
                Email me a link
              </button>
            </form>
          )}
        </div>
      </section>

      <section aria-label="How it works" className="border-t border-mist pt-16">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
          {STEPS.map((step, i) => (
            <div key={step.label}>
              <span className="eyebrow text-water">{`0${i + 1}`}</span>
              <h3 className="mt-2 text-lg font-semibold text-ink">{step.label}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                {step.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="card card-muted mx-auto max-w-2xl text-center">
        <p className="prose-entry text-ink">
          &ldquo;The things your family knows should not disappear with
          time.&rdquo;
        </p>
        <p className="eyebrow mt-4">Private by default</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
          Nothing you write is visible until you decide who it&rsquo;s for and
          when they receive it. Not even the family steward can open a sealed
          entry.
        </p>
      </section>
    </div>
  );
}
