import { describe, expect, it } from "vitest";
import {
  canViewerSeeEntry,
  selectVisibleEntries,
  type VisibilityEntry,
  type VisibilityRelease,
} from "./visibility";

const entries: VisibilityEntry[] = [
  { id: "public", authorMemberId: "grandpa", status: "RELEASED" },
  { id: "for-sarah-at-18", authorMemberId: "grandpa", status: "SCHEDULED" },
  { id: "grandpa-draft", authorMemberId: "grandpa", status: "DRAFT" },
  { id: "moms-letter", authorMemberId: "mom", status: "SCHEDULED" },
];

// "public" has been released to everyone; the gated entries to no one yet.
const releases: VisibilityRelease[] = [
  { entryId: "public", recipientMemberId: "grandpa" },
  { entryId: "public", recipientMemberId: "sarah" },
  { entryId: "public", recipientMemberId: "mom" },
];

const visibleIds = (viewerMemberId: string) =>
  selectVisibleEntries({ viewerMemberId, entries, releases })
    .map((v) => v.entryId)
    .sort();

describe("selectVisibleEntries", () => {
  it("a recipient sees only what has actually been released to them", () => {
    expect(visibleIds("sarah")).toEqual(["public"]);
  });

  it("a gated entry is invisible to a 15-year-old — no title, no count, nothing", () => {
    const sarahView = selectVisibleEntries({
      viewerMemberId: "sarah",
      entries,
      releases,
    });
    expect(sarahView.some((v) => v.entryId === "for-sarah-at-18")).toBe(false);
  });

  it("the author sees their own pending entries (DRAFT and SCHEDULED)", () => {
    expect(visibleIds("grandpa")).toEqual([
      "for-sarah-at-18",
      "grandpa-draft",
      "public",
    ]);
  });

  it("the author does not see someone else's unreleased entry", () => {
    expect(visibleIds("grandpa")).not.toContain("moms-letter");
  });

  it("being the Steward grants nothing — same view as any other member", () => {
    // `steward` authored nothing and has no Release rows.
    expect(visibleIds("steward")).toEqual([]);
  });

  it("labels why each entry is visible", () => {
    const view = selectVisibleEntries({
      viewerMemberId: "grandpa",
      entries,
      releases,
    });
    expect(view.find((v) => v.entryId === "public")?.reason).toBe("author");
    const sarah = selectVisibleEntries({ viewerMemberId: "sarah", entries, releases });
    expect(sarah.find((v) => v.entryId === "public")?.reason).toBe("released");
  });
});

describe("canViewerSeeEntry", () => {
  const gated = entries[1];
  it("false for a non-author with no release", () => {
    expect(
      canViewerSeeEntry({ viewerMemberId: "sarah", entry: gated, releases }),
    ).toBe(false);
  });
  it("true once a release row exists", () => {
    expect(
      canViewerSeeEntry({
        viewerMemberId: "sarah",
        entry: gated,
        releases: [...releases, { entryId: gated.id, recipientMemberId: "sarah" }],
      }),
    ).toBe(true);
  });
  it("true for the author regardless", () => {
    expect(
      canViewerSeeEntry({ viewerMemberId: "grandpa", entry: gated, releases }),
    ).toBe(true);
  });
});
