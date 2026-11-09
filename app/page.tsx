import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { StackedLogo } from "./_components/brand-logo";

const HOW_IT_WORKS = [
  {
    title: "Answer a prompt",
    detail:
      "Pick a question — about your parents, your faith, money, the hard years — and write it, say it, or film it. Two minutes or two hours.",
  },
  {
    title: "Decide who receives it, and when",
    detail:
      "Now, on a grandchild's 18th birthday, on their wedding day, or after you're gone. Sealed wisdom stays sealed — no one sees it, or even that it exists, until its moment.",
  },
  {
    title: "Your family's well fills over time",
    detail:
      "Every answer joins the family archive, and stewardship passes down the line so it outlasts any one of us.",
  },
];

/**
 * Public landing page. Signed-in members go straight to their dashboard;
 * everyone else — strangers and invited relatives alike — lands here.
 */
export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user?.member) redirect("/home");
  if (user) redirect("/onboarding");

  return (
    <div className="space-y-20">
      {/* --- Hero ------------------------------------------------------- */}
      <section className="mx-auto max-w-2xl text-center">
        <div className="flex justify-center">
          <StackedLogo width={200} />
        </div>
        <h1 className="mt-8 font-serif text-h2 italic leading-tight text-ink sm:text-h1">
          Keep close what matters most.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">
          Your family&rsquo;s stories, values, and hard-won wisdom &mdash;
          recorded in your own voice and passed to the right person at the
          right moment.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/signup" className="btn btn-primary w-full no-underline sm:w-auto">
            Start your family&rsquo;s well
          </Link>
          <Link href="/login" className="btn btn-secondary w-full no-underline sm:w-auto">
            Sign in
          </Link>
        </div>
      </section>

      {/* --- How it works ------------------------------------------------ */}
      <section aria-labelledby="how" className="border-t border-mist pt-16">
        <h2 id="how" className="text-center font-serif text-h2 text-ink">
          How it works
        </h2>
        <ol className="mt-10 grid gap-8 sm:grid-cols-3">
          {HOW_IT_WORKS.map((step, i) => (
            <li key={step.title} className="card">
              <span className="eyebrow">{`Step ${i + 1}`}</span>
              <h3 className="mt-2 text-lg font-semibold text-ink">{step.title}</h3>
              <p className="mt-2 text-base leading-relaxed text-ink-soft">
                {step.detail}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* --- Sample prompt ----------------------------------------------- */}
      <section aria-labelledby="sample" className="mx-auto max-w-2xl">
        <div className="card card-feature text-center">
          <p id="sample" className="eyebrow">
            A question to start with
          </p>
          <p className="prose-entry mt-4 text-ink">
            &ldquo;What did your mother do when money was tight?&rdquo;
          </p>
          <p className="mt-3 text-sm text-ink-soft">
            One of hundreds of prompts across family history, faith, money,
            marriage, work, and the lessons you&rsquo;d want passed on.
          </p>
          <Link href="/signup" className="btn btn-primary mt-6 no-underline">
            Answer this &rarr;
          </Link>
        </div>
      </section>

      {/* --- Invited? ------------------------------------------------------ */}
      <section className="card card-muted mx-auto max-w-2xl text-center">
        <h2 className="font-serif text-xl text-ink">
          Invited by a family member?
        </h2>
        <p className="mx-auto mt-2 max-w-md text-base leading-relaxed text-ink-soft">
          Check your email for your invite link. If your family&rsquo;s steward
          shared a join link with you, open it to ask to be added.
        </p>
        <p className="mt-4 text-sm text-ink-soft">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </section>
    </div>
  );
}
