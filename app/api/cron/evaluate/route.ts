import { type NextRequest, NextResponse } from "next/server";
import { evaluateAllFamilies } from "@/lib/release";
import { processAllSuccession } from "@/lib/succession";

/**
 * The daily job. Point a scheduler (cron, Vercel Cron, GitHub Action) at this
 * route once a day. It:
 *
 *  - re-evaluates release rules so AGE / DATE triggers crossing their threshold
 *    fire (spec §4). Tree edits, entry publishes and event confirmations
 *    re-evaluate inline, so this is only a backstop for time passing;
 *  - processes stewardship succession: starts a handover once a steward has
 *    been inactive past the threshold, completes one whose grace period has
 *    elapsed, cancels one whose steward came back (spec §9 Phase 3).
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

  const releaseResults = await evaluateAllFamilies();
  const releaseTotals = releaseResults.reduce(
    (acc, r) => ({
      releasesCreated: acc.releasesCreated + r.releasesCreated,
      entriesReleased: acc.entriesReleased + r.entriesReleased,
    }),
    { releasesCreated: 0, entriesReleased: 0 },
  );

  const successionResults = await processAllSuccession();
  const successionActions = successionResults
    .filter((r) => r.action !== "NONE")
    .map((r) => `${r.action}: ${r.detail}`);

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    families: releaseResults.length,
    ...releaseTotals,
    successionActions,
  });
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
