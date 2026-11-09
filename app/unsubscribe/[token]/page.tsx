import Link from "next/link";
import { confirmUnsubscribe } from "./actions";

/**
 * "Stop these emails" from a reminder. A button rather than an immediate
 * change, so link-scanners in mail systems can't switch reminders off.
 */
export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="font-serif text-h2 text-ink">Reminder emails</h1>
      <div className="card mt-6 space-y-4">
        {sp.done ? (
          <>
            <p className="text-ink">Done &mdash; you won&rsquo;t get reminder emails anymore.</p>
            <p className="text-sm text-ink-soft">
              You can turn them back on any time in <Link href="/settings">Settings</Link>.
            </p>
          </>
        ) : (
          <form action={confirmUnsubscribe} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <p className="text-ink">Stop the reminder emails with suggested questions?</p>
            <p className="text-sm text-ink-soft">
              Sign-in, invite, and password emails aren&rsquo;t affected.
            </p>
            <button type="submit" className="btn btn-primary w-full">
              Stop reminder emails
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
