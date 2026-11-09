/**
 * "Your well" (Nov 2026) — pure helpers, no database.
 *
 * The well fills with every piece of wisdom the person saves, drafts included
 * (decided: keep it simple, count everything). It fills in levels of 10, so it
 * keeps visibly moving for heavy contributors instead of topping out.
 *
 * "Areas to explore" shows the 14 core buckets as an invitation — which ones
 * they've shared about, which are still open. No percentages, no "complete".
 */
import { CORE_BUCKETS } from "./prompts";

export const WELL_LEVEL_SIZE = 10;

export interface WellState {
  total: number;
  /** 1-based level; each level holds WELL_LEVEL_SIZE pieces. */
  level: number;
  /** How full the current level is, 0–1 (never shows empty after the first). */
  fill: number;
  /** Pieces until the next level. */
  toNextLevel: number;
}

export function wellState(total: number): WellState {
  const n = Math.max(0, Math.floor(total));
  const level = Math.floor(n / WELL_LEVEL_SIZE) + 1;
  const inLevel = n % WELL_LEVEL_SIZE;
  // A just-completed level shows a full well's worth of water at the new
  // level's base, not an empty one: keep a small floor once anything exists.
  const fill = n === 0 ? 0 : Math.max(inLevel / WELL_LEVEL_SIZE, 0.08);
  return { total: n, level, fill, toNextLevel: WELL_LEVEL_SIZE - inLevel };
}

export interface BucketCoverage {
  slug: string;
  title: string;
  blurb: string;
  count: number;
}

/** Core buckets with how much this person has shared in each. */
export function bucketCoverage(promptBuckets: (string | null)[]): BucketCoverage[] {
  const counts = new Map<string, number>();
  for (const b of promptBuckets) if (b) counts.set(b, (counts.get(b) ?? 0) + 1);
  return CORE_BUCKETS.map((b) => ({
    slug: b.slug,
    title: b.title,
    blurb: b.blurb,
    count: counts.get(b.slug) ?? 0,
  }));
}
