import { type NextRequest, NextResponse } from "next/server";
import { evaluateAllFamilies } from "@/lib/release";

/**
 * The daily job (spec §4). Point a scheduler (cron, Vercel Cron, GitHub Action)
 * at this route once a day; it handles AGE and DATE triggers crossing their
 * threshold. Tree edits, entry publishes, and event confirmations re-evaluate
 * inline, so this is only a backstop for time passing.
 *
 * Protect it with CRON_SECRET (Authorization: Bearer <secret>, or ?secret=).
 * If CRON_SECRET is unset it is open in development only.
 */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided =
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      req.nextUrl.searchParams.get("secret");
    if (provided !== secret) {
      return new NextResponse(null, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "CRON_SECRET must be set in production" },
      { status: 503 },
    );
  }

  const results = await evaluateAllFamilies();
  const totals = results.reduce(
    (acc, r) => ({
      releasesCreated: acc.releasesCreated + r.releasesCreated,
      entriesReleased: acc.entriesReleased + r.entriesReleased,
    }),
    { releasesCreated: 0, entriesReleased: 0 },
  );

  return NextResponse.json({ ranAt: new Date().toISOString(), families: results.length, ...totals });
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
