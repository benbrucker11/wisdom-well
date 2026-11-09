import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { REMINDER_LABEL, type ReminderFrequency } from "@/lib/reminders";
import { setReminderFrequency } from "./actions";

const OPTIONS: ReminderFrequency[] = ["WEEKLY", "BIWEEKLY", "MONTHLY", "OFF"];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { user } = await requireMember();
  const sp = await searchParams;

  return (
    <div className="mx-auto max-w-xl space-y-10">
      <h1 className="font-serif text-h1 text-ink">Settings</h1>

      {sp.saved ? (
        <p className="rounded-field border border-success/40 bg-success/10 p-3 text-sm text-success">
          Saved.
        </p>
      ) : null}

      <section className="card space-y-4">
        <div>
          <h2 className="font-serif text-xl text-ink">Reminder emails</h2>
          <p className="mt-1 text-sm text-ink-soft">
            A suggested question for your well, plus any questions family members
            have asked you. Sent to {user.email}.
          </p>
        </div>
        <form action={setReminderFrequency} className="space-y-3">
          <fieldset className="space-y-2">
            <legend className="sr-only">How often</legend>
            {OPTIONS.map((f) => (
              <label key={f} className="flex items-center gap-3 rounded-field border border-mist px-4 py-3">
                <input
                  type="radio"
                  name="frequency"
                  value={f}
                  defaultChecked={user.reminderFrequency === f}
                />
                <span className="text-ink">
                  {REMINDER_LABEL[f]}
                  {f === "BIWEEKLY" ? <span className="text-ink-soft"> (default)</span> : null}
                </span>
              </label>
            ))}
          </fieldset>
          <button type="submit" className="btn btn-primary">
            Save
          </button>
        </form>
      </section>

      <section className="card space-y-2">
        <h2 className="font-serif text-xl text-ink">Password</h2>
        <p className="text-sm text-ink-soft">
          {user.passwordHash
            ? "You sign in with your email and password."
            : "You haven't set a password yet — you've been signing in with emailed links."}
        </p>
        <Link href="/account/password" className="btn btn-secondary no-underline">
          {user.passwordHash ? "Change password" : "Set a password"}
        </Link>
      </section>
    </div>
  );
}
