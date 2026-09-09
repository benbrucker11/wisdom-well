/**
 * Succession decision logic — pure, no database.
 *
 * Given the state of a family's stewardship, `decideSuccession` returns the one
 * action the system should take now: start a handover, complete one whose grace
 * period has elapsed, cancel one because the steward came back, or do nothing.
 *
 * The database wrapper in ./index.ts loads the state, calls this, and applies
 * the action. Completing a handover only moves `Family.stewardMemberId` and the
 * successor list — it never touches entries or releases, so no sealed content
 * is ever exposed (spec §5 + the Phase 3 "done when").
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SuccessionState {
  now: Date;
  stewardMemberId: string | null;
  /** The steward account's last authenticated activity. */
  stewardLastSeenAt: Date | null;
  inactivityThresholdDays: number;
  successionGraceDays: number;
  /** Ordered successors who can actually take over (have a login). position asc. */
  successors: { memberId: string; position: number }[];
  pendingTransfer: {
    id: string;
    toMemberId: string;
    initiatedAt: Date;
    graceEndsAt: Date;
    stewardLastSeenAt: Date;
  } | null;
}

export type SuccessionDecision =
  | { action: "NONE"; reason: string }
  | {
      action: "INITIATE";
      toMemberId: string;
      graceEndsAt: Date;
      stewardLastSeenAt: Date;
      daysInactive: number;
    }
  | { action: "COMPLETE"; transferId: string; toMemberId: string }
  | {
      action: "CANCEL";
      transferId: string;
      cancelReason: "STEWARD_RETURNED" | "SUPERSEDED";
    };

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

export function isStewardInactive(state: SuccessionState): boolean {
  if (!state.stewardLastSeenAt) return false; // unknown — never assume inactive
  return (
    daysBetween(state.stewardLastSeenAt, state.now) >= state.inactivityThresholdDays
  );
}

export function decideSuccession(state: SuccessionState): SuccessionDecision {
  const { pendingTransfer, successors, now } = state;

  if (pendingTransfer) {
    // The steward signed in again after succession began → they're still here.
    if (
      state.stewardLastSeenAt &&
      state.stewardLastSeenAt.getTime() > pendingTransfer.stewardLastSeenAt.getTime()
    ) {
      return {
        action: "CANCEL",
        transferId: pendingTransfer.id,
        cancelReason: "STEWARD_RETURNED",
      };
    }

    // The named successor is no longer a valid successor, or the steward seat
    // changed underneath us.
    const stillValid =
      successors.some((s) => s.memberId === pendingTransfer.toMemberId) &&
      state.stewardMemberId !== null &&
      state.stewardMemberId !== pendingTransfer.toMemberId;
    if (!stillValid) {
      return {
        action: "CANCEL",
        transferId: pendingTransfer.id,
        cancelReason: "SUPERSEDED",
      };
    }

    // Grace period elapsed and the steward never came back → promote.
    if (now.getTime() >= pendingTransfer.graceEndsAt.getTime()) {
      return {
        action: "COMPLETE",
        transferId: pendingTransfer.id,
        toMemberId: pendingTransfer.toMemberId,
      };
    }

    return { action: "NONE", reason: "grace period still running" };
  }

  // No pending transfer — should we start one?
  if (!state.stewardMemberId) {
    return { action: "NONE", reason: "family has no steward" };
  }
  if (successors.length === 0) {
    return { action: "NONE", reason: "no successors named" };
  }
  if (!isStewardInactive(state)) {
    return { action: "NONE", reason: "steward is active" };
  }

  const first = [...successors].sort((a, b) => a.position - b.position)[0];
  if (first.memberId === state.stewardMemberId) {
    return { action: "NONE", reason: "first successor is already the steward" };
  }

  return {
    action: "INITIATE",
    toMemberId: first.memberId,
    graceEndsAt: new Date(now.getTime() + state.successionGraceDays * DAY_MS),
    stewardLastSeenAt: state.stewardLastSeenAt ?? now,
    daysInactive: state.stewardLastSeenAt
      ? daysBetween(state.stewardLastSeenAt, now)
      : 0,
  };
}
