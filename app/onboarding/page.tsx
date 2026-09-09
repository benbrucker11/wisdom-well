import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createFamily } from "./actions";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (user.member) redirect("/family");
  const sp = await searchParams;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-serif text-3xl">Start your family&rsquo;s well</h1>
      <p className="mt-3 text-ink-soft">
        A well is where a family keeps its stories, its values, and the things it
        has learned. You&rsquo;ll be its first steward.
      </p>

      <form action={createFamily} className="mt-8 space-y-5">
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
            className="mt-1 w-full rounded border border-rule bg-white px-4 py-3"
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm text-ink-soft">Your given name</span>
            <input
              name="givenName"
              required
              className="mt-1 w-full rounded border border-rule bg-white px-4 py-3"
            />
          </label>
          <label className="block">
            <span className="text-sm text-ink-soft">Your family name</span>
            <input
              name="surname"
              required
              className="mt-1 w-full rounded border border-rule bg-white px-4 py-3"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm text-ink-soft">
            Your date of birth{" "}
            <span className="text-ink-soft/70">
              (optional, but needed for age-based rules later)
            </span>
          </span>
          <input
            type="date"
            name="dateOfBirth"
            className="mt-1 w-full rounded border border-rule bg-white px-4 py-3"
          />
        </label>

        <button
          type="submit"
          className="rounded bg-accent px-5 py-3 text-white hover:opacity-90"
        >
          Create family
        </button>
      </form>
    </div>
  );
}
