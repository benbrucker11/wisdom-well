// No "server-only": the cron job and scripts call this too.

/**
 * The public URL of the app, for links in emails sent outside a request (the
 * daily job's reminders and password-setup emails). Set APP_URL in production;
 * Netlify's URL and Vercel's production URL are used as fallbacks.
 */
export function appOrigin(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.URL) return process.env.URL.replace(/\/+$/, ""); // Netlify
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}
