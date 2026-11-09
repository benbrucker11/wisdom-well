import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { StackedLogo } from "../_components/brand-logo";
import { createFamily } from "./actions";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (user.member) redirect("/home");
  const sp = await searchParams;

  return (
    <div className="mx-auto max-w-lg">
      <div className="flex justify-center">
        <StackedLogo width={120} />
      </div>
      <h1 className="mt-8 text-center font-serif text-h2 text-ink">
        Start your family&rsquo;s well
      </h1>
      <p className="mt-3 text-center text-ink-soft">
        A well is where a family keeps its stories, its values, and the things
        it has learned. You&rsquo;ll be its first steward.
      </p>

      <form action={createFamily} className="card mt-10 space-y-5">
        {sp.error === "missing" ? (
          <p className="text-sm text-danger">
            Family name and your name are required.
          </p>
        ) : null}

        <label className="block">
          <span className="text-sm text-ink-soft">Family name</span>
          <input
            name="familyName"
            required
            placeholder="The Kowalski Family"
            className="field mt-1"
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm text-ink-soft">Your given name</span>
            <input name="givenName" required className="field mt-1" />
          </label>
          <label className="block">
            <span className="text-sm text-ink-soft">Your family name</span>
            <input name="surname" required className="field mt-1" />
          </label>
        </div>

        <label className="block">
          <span className="text-sm text-ink-soft">
            Your date of birth{" "}
            <span className="text-ink-soft/70">
              (optional, but needed for age-based rules later)
            </span>
          </span>
          <input type="date" name="dateOfBirth" className="field mt-1" />
        </label>

        <button type="submit" className="btn btn-primary w-full">
          Start your family&rsquo;s well
        </button>
      </form>
    </div>
  );
}
