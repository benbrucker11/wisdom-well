import { describe, expect, it } from "vitest";
import { decideSuccession, isStewardInactive, type SuccessionState } from "./logic";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-06-01T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

function state(over: Partial<SuccessionState> = {}): SuccessionState {
  return {
    now: NOW,
    stewardMemberId: "steward",
    stewardLastSeenAt: daysAgo(10),
    inactivityThresholdDays: 365,
    successionGraceDays: 30,
    successors: [{ memberId: "heir", position: 1 }],
    pendingTransfer: null,
    ...over,
  };
}

describe("isStewardInactive", () => {
  it("false while within the threshold", () => {
    expect(isStewardInactive(state({ stewardLastSeenAt: daysAgo(200) }))).toBe(false);
  });
  it("true past the threshold", () => {
    expect(isStewardInactive(state({ stewardLastSeenAt: daysAgo(400) }))).toBe(true);
  });
  it("never assumes inactive when last-seen is unknown", () => {
    expect(isStewardInactive(state({ stewardLastSeenAt: null }))).toBe(false);
  });
});

describe("decideSuccession — starting a handover", () => {
  it("does nothing while the steward is active", () => {
    expect(decideSuccession(state()).action).toBe("NONE");
  });

  it("does nothing when there are no successors", () => {
    const d = decideSuccession(
      state({ stewardLastSeenAt: daysAgo(400), successors: [] }),
    );
    expect(d).toEqual({ action: "NONE", reason: "no successors named" });
  });

  it("initiates once the steward is inactive and a successor exists", () => {
    const d = decideSuccession(state({ stewardLastSeenAt: daysAgo(400) }));
    expect(d.action).toBe("INITIATE");
    if (d.action === "INITIATE") {
      expect(d.toMemberId).toBe("heir");
      expect(d.graceEndsAt).toEqual(new Date(NOW.getTime() + 30 * DAY));
      expect(d.daysInactive).toBe(400);
    }
  });

  it("picks the lowest-position successor", () => {
    const d = decideSuccession(
      state({
        stewardLastSeenAt: daysAgo(400),
        successors: [
          { memberId: "third", position: 3 },
          { memberId: "first", position: 1 },
          { memberId: "second", position: 2 },
        ],
      }),
    );
    expect(d.action === "INITIATE" && d.toMemberId).toBe("first");
  });
});

describe("decideSuccession — an in-flight handover", () => {
  const pending = {
    id: "t1",
    toMemberId: "heir",
    initiatedAt: daysAgo(10),
    graceEndsAt: new Date(NOW.getTime() + 20 * DAY),
    stewardLastSeenAt: daysAgo(400),
  };

  it("waits while the grace period is still running", () => {
    const d = decideSuccession(
      state({ stewardLastSeenAt: daysAgo(410), pendingTransfer: pending }),
    );
    expect(d).toEqual({ action: "NONE", reason: "grace period still running" });
  });

  it("completes once the grace period has elapsed", () => {
    const d = decideSuccession(
      state({
        stewardLastSeenAt: daysAgo(410),
        pendingTransfer: { ...pending, graceEndsAt: daysAgo(1) },
      }),
    );
    expect(d).toEqual({ action: "COMPLETE", transferId: "t1", toMemberId: "heir" });
  });

  it("cancels if the steward has signed in since it began", () => {
    const d = decideSuccession(
      state({ stewardLastSeenAt: daysAgo(2), pendingTransfer: pending }),
    );
    expect(d).toEqual({
      action: "CANCEL",
      transferId: "t1",
      cancelReason: "STEWARD_RETURNED",
    });
  });

  it("cancels if the named successor is no longer in the line", () => {
    const d = decideSuccession(
      state({
        stewardLastSeenAt: daysAgo(410),
        successors: [{ memberId: "someone-else", position: 1 }],
        pendingTransfer: pending,
      }),
    );
    expect(d).toEqual({
      action: "CANCEL",
      transferId: "t1",
      cancelReason: "SUPERSEDED",
    });
  });

  it("cancels if the successor has already become steward", () => {
    const d = decideSuccession(
      state({
        stewardMemberId: "heir",
        stewardLastSeenAt: daysAgo(410),
        pendingTransfer: pending,
      }),
    );
    expect(d.action).toBe("CANCEL");
  });
});
