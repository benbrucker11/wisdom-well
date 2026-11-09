import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { StackedLogo } from "../../_components/brand-logo";
import { submitJoinRequest } from "./actions";

/**
 * Public "ask to join" page, reached only through a link the steward shared.
 * Shows the family's name and nothing else.
 */
export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { code } = await params;
  const sp = await searchParams;
  const family = await prisma.family.findUnique({
    where: { joinCode: code },
    select: { name: true },
  });
  if (!family) notFound();

  return (
    <div className="mx-auto max-w-md">
      <div className="flex justify-center">
        <StackedLogo width={120} />
      </div>
      <h1 className="mt-6 text-center font-serif text-h2 text-ink">
        Ask to join {family.name}
      </h1>

      <div className="card mt-8">
        {sp.sent ? (
          <p className="text-ink">
            Thanks &mdash; your request is with the family&rsquo;s steward. If
            they approve it, you&rsquo;ll get an email with a link to set up
            your account.
          </p>
        ) : (
          <form action={submitJoinRequest} className="space-y-4">
            <input type="hidden" name="code" value={code} />
            <p className="text-sm text-ink-soft">
              The family&rsquo;s steward will see your request and add you to the
              family tree.
            </p>
            {sp.error ? (
              <p className="text-sm text-danger" role="alert">
                Please fill in every field with a valid email address.
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm text-ink-soft">Given name</span>
                <input name="givenName" required autoComplete="given-name" className="field mt-1" />
              </label>
              <label className="block">
                <span className="text-sm text-ink-soft">Family name</span>
                <input name="familyName" required autoComplete="family-name" className="field mt-1" />
              </label>
            </div>
            <label className="block">
              <span className="text-sm text-ink-soft">Email address</span>
              <input type="email" name="email" required autoComplete="email" className="field mt-1" />
            </label>
            <label className="block">
              <span className="text-sm text-ink-soft">How are you related?</span>
              <textarea
                name="relationNote"
                required
                rows={3}
                maxLength={500}
                placeholder="e.g. I'm Sarah's husband — Tom and Ellen's son-in-law."
                className="field mt-1"
              />
            </label>
            <button type="submit" className="btn btn-primary w-full">
              Send request
            </button>
          </form>
        )}
      </div>
      <p className="mt-6 text-center text-sm text-ink-soft">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </div>
  );
}
