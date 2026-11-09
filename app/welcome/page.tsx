import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";
import { StackedLogo } from "../_components/brand-logo";
import { setPasswordAction } from "../login/actions";
import { confirmDetails } from "./actions";

/**
 * First sign-in for an invited person: (1) set a password, (2) confirm how
 * they appear in the family tree. Founders and existing members skip this.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (!user.member) redirect("/onboarding");
  if (user.member.detailsConfirmedAt) redirect("/home");
  const sp = await searchParams;
  const m = user.member;
  const step = user.passwordHash ? 2 : 1;

  return (
    <div className="mx-auto max-w-md">
      <div className="flex justify-center">
        <StackedLogo width={120} />
      </div>
      <h1 className="mt-6 text-center font-serif text-h2 text-ink">
        Welcome to {m.family.name}&rsquo;s well
      </h1>
      <p className="mt-2 text-center text-ink-soft">Step {step} of 2</p>

      {step === 1 ? (
        <form action={setPasswordAction} className="card mt-8 space-y-4">
          <input type="hidden" name="next" value="/welcome" />
          <h2 className="text-lg font-semibold text-ink">Set your password</h2>
          <p className="text-sm text-ink-soft">
            You&rsquo;ll sign in with {user.email} and this password from now on.
          </p>
          {sp.error === "too_short" ? (
            <p className="text-sm text-danger">Use at least {PASSWORD_MIN_LENGTH} characters.</p>
          ) : sp.error === "mismatch" ? (
            <p className="text-sm text-danger">The two passwords didn&rsquo;t match.</p>
          ) : null}
          <input
            type="password"
            name="password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoFocus
            autoComplete="new-password"
            placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
            className="field"
            aria-label="New password"
          />
          <input
            type="password"
            name="confirm"
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            placeholder="Password again"
            className="field"
            aria-label="New password again"
          />
          <button type="submit" className="btn btn-primary w-full">
            Continue
          </button>
        </form>
      ) : (
        <form action={confirmDetails} className="card mt-8 space-y-4">
          <h2 className="text-lg font-semibold text-ink">Is this you?</h2>
          <p className="text-sm text-ink-soft">
            This is how you appear in the family tree. Fix anything that&rsquo;s
            wrong &mdash; your birthday matters, because some wisdom is set to
            reach people at a certain age.
          </p>
          {sp.error === "name" ? (
            <p className="text-sm text-danger">Both names are needed.</p>
          ) : sp.error === "date" ? (
            <p className="text-sm text-danger">That birthday didn&rsquo;t look right.</p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-ink-soft">Given name</span>
              <input name="givenName" required defaultValue={m.givenName} className="field mt-1" />
            </label>
            <label className="block">
              <span className="text-sm text-ink-soft">Family name</span>
              <input name="familyName" required defaultValue={m.familyName} className="field mt-1" />
            </label>
          </div>
          <label className="block">
            <span className="text-sm text-ink-soft">Date of birth</span>
            <input
              type="date"
              name="dateOfBirth"
              defaultValue={m.dateOfBirth ? m.dateOfBirth.toISOString().slice(0, 10) : ""}
              className="field mt-1"
            />
          </label>
          <button type="submit" className="btn btn-primary w-full">
            Looks right &mdash; take me in
          </button>
        </form>
      )}
    </div>
  );
}
