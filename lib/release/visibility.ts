/**
 * Visibility — the trust boundary of the whole product (spec §5).
 *
 * Pure logic. `selectVisibleEntries` decides, for one viewer, which entries
 * they may see and why. Every read path in the app goes through the
 * database-backed `visibleEntriesFor(memberId)` in ./index.ts, which is a thin
 * wrapper over this.
 *
 * The rules:
 *   - A gated entry is HIDDEN, not locked. If a viewer has no Release row for
 *     it and did not author it, then as far as any query they can make is
 *     concerned the entry does not exist — no title, no thumbnail, no count.
 *   - The author always sees their own entries, including DRAFT and SCHEDULED
 *     ones, so they can edit / reschedule / delete. This is the only asymmetry.
 *   - Being the Steward grants nothing here. The Steward administers the family;
 *     they do not read other people's sealed letters. (Aggregate counts for
 *     succession are a separate, content-free query — see ./index.ts.)
 */

export type VisibilityReason = "author" | "released";

export interface VisibilityEntry {
  id: string;
  authorMemberId: string;
  status: "DRAFT" | "SCHEDULED" | "RELEASED";
}

export interface VisibilityRelease {
  entryId: string;
  recipientMemberId: string;
}

export interface VisibleEntry {
  entryId: string;
  reason: VisibilityReason;
  /** True when a Release row exists for this viewer (independent of authorship). */
  releasedToViewer: boolean;
}

export function selectVisibleEntries(input: {
  viewerMemberId: string;
  entries: VisibilityEntry[];
  releases: VisibilityRelease[];
}): VisibleEntry[] {
  const releasedEntryIds = new Set(
    input.releases
      .filter((r) => r.recipientMemberId === input.viewerMemberId)
      .map((r) => r.entryId),
  );

  const visible: VisibleEntry[] = [];

  for (const entry of input.entries) {
    const isAuthor = entry.authorMemberId === input.viewerMemberId;
    const releasedToViewer = releasedEntryIds.has(entry.id);

    if (isAuthor) {
      visible.push({ entryId: entry.id, reason: "author", releasedToViewer });
      continue;
    }

    if (releasedToViewer) {
      // A non-author only ever sees an entry once it has actually been
      // released to them — never a DRAFT, never a SCHEDULED entry.
      visible.push({ entryId: entry.id, reason: "released", releasedToViewer: true });
    }
  }

  return visible;
}

/** Convenience predicate for a single entry + viewer. */
export function canViewerSeeEntry(input: {
  viewerMemberId: string;
  entry: VisibilityEntry;
  releases: VisibilityRelease[];
}): boolean {
  return (
    selectVisibleEntries({
      viewerMemberId: input.viewerMemberId,
      entries: [input.entry],
      releases: input.releases,
    }).length > 0
  );
}
