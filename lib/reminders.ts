/**
 * Reminder cadence (Nov 2026) — pure, no database. Email only, per person:
 * weekly, every 2 weeks (default), monthly, or off.
 */

export type ReminderFrequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "OFF";

const DAY = 86_400_000;

export const REMINDER_INTERVAL_DAYS: Record<Exclude<ReminderFrequency, "OFF">, number> = {
  WEEKLY: 7,
  BIWEEKLY: 14,
  MONTHLY: 30,
};

export const REMINDER_LABEL: Record<ReminderFrequency, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Every 2 weeks",
  MONTHLY: "Monthly",
  OFF: "Off",
};

/**
 * Due when a full interval has passed since the last reminder — or, for
 * someone never reminded, since they joined (nobody gets one on day one).
 * The daily job runs once a day, so allow half a day of slack so a reminder
 * doesn't slip a whole extra day because of when the job happened to run.
 */
export function isReminderDue(opts: {
  frequency: ReminderFrequency;
  lastRemindedAt: Date | null;
  createdAt: Date;
  now: Date;
}): boolean {
  if (opts.frequency === "OFF") return false;
  const since = (opts.lastRemindedAt ?? opts.createdAt).getTime();
  const interval = REMINDER_INTERVAL_DAYS[opts.frequency] * DAY;
  return opts.now.getTime() - since >= interval - DAY / 2;
}
