/**
 * Netlify Scheduled Function — the daily job.
 *
 * Netlify can't schedule a Next.js route handler directly, so this thin
 * function calls /api/cron/evaluate with the CRON_SECRET. Same job as Vercel's
 * cron entry in vercel.json.
 */
export default async () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!base) {
    return new Response("no site URL in env", { status: 500 });
  }
  const res = await fetch(`${base}/api/cron/evaluate`, {
    method: "POST",
    headers: process.env.CRON_SECRET
      ? { authorization: `Bearer ${process.env.CRON_SECRET}` }
      : {},
  });
  const body = await res.text();
  console.log(`daily-tasks: ${res.status} ${body}`);
  return new Response(body, { status: res.ok ? 200 : 502 });
};

export const config = { schedule: "0 8 * * *" };
