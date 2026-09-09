/**
 * Database-backed stewardship & succession (Phase 3).
 *
 * Completing a handover changes only `Family.stewardMemberId` and the successor
 * list. It never creates Release rows or otherwise grants the incoming steward
 * visibility into sealed entries — `visibleEntriesFor` is untouched by anything
 * here. See scripts/e2e-phase3.ts for the proof.
 */
import type { Member, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { sendEmail } from "../mail";
import { buildGraph, getDescendants } from "../relationships/graph";
import {
  decideSuccession,
  isStewardInactive,
  type SuccessionState,
} from "./logic";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * The eldest living descendant of the family's founder who has a login and is
 * still an active member — the policy fallback when the named line is empty
 * (spec §10). Recurses naturally: it's recomputed from scratch every time.
 */
async function resolvePolicyCandidate(
  familyId: string,
  excludeMemberIds: string[],
): Promise<Member | null> {
  const family = await prisma.family.findUniqueOrThrow({ where: { id: familyId } });
  if (
    family.successionPolicy !== "NAMED_THEN_ELDEST_DESCENDANT" ||
    !family.founderMemberId
  ) {
    return null;
  }

  const [members, relationships] = await Promise.all([
    prisma.member.findMany({ where: { familyId } }),
    prisma.relationship.findMany({ where: { familyId } }),
  ]);

  const graph = buildGraph(
    relationships.map((r) => ({
      fromMemberId: r.fromMemberId,
      toMemberId: r.toMemberId,
      type: r.type,
      parentKind: r.parentKind,
      endedAt: r.endedAt,
    })),
  );
  const descendantIds = new Set(
    getDescendants(graph, family.founderMemberId, 100).map((d) => d.memberId),
  );
  const exclude = new Set([family.founderMemberId, ...excludeMemberIds]);

  const eligible = members
    .filter(
      (m) =>
        descendantIds.has(m.id) &&
        !exclude.has(m.id) &&
        m.userId != null &&
        m.dateOfDeath == null &&
        m.status === "ACTIVE",
    )
    .sort((a, b) => {
      const at = a.dateOfBirth?.getTime() ?? Number.POSITIVE_INFINITY;
      const bt = b.dateOfBirth?.getTime() ?? Number.POSITIVE_INFINITY;
      return at - bt; // eldest first
    });

  return eligible[0] ?? null;
}

// --- Successor list management --------------------------------------

async function orderedSuccessorMemberIds(tx: Tx, familyId: string): Promise<string[]> {
  const rows = await tx.successor.findMany({
    where: { familyId },
    orderBy: { position: "asc" },
  });
  return rows.map((r) => r.memberId);
}

/**
 * Rewrite the successor list to exactly `memberIds`, positions 1..n, preserving
 * each person's `acceptedAt` (reordering must not un-accept anyone).
 */
async function rewriteSuccessors(tx: Tx, familyId: string, memberIds: string[]) {
  const existing = await tx.successor.findMany({ where: { familyId } });
  const acceptedByMember = new Map(
    existing.map((s) => [s.memberId, s.acceptedAt]),
  );
  await tx.successor.deleteMany({ where: { familyId } });
  if (memberIds.length === 0) return;
  await tx.successor.createMany({
    data: memberIds.map((memberId, i) => ({
      familyId,
      memberId,
      position: i + 1,
      acceptedAt: acceptedByMember.get(memberId) ?? null,
    })),
  });
}

async function assertActingSteward(familyId: string, actingMemberId: string) {
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: { stewardMemberId: true },
  });
  if (!family || family.stewardMemberId !== actingMemberId) {
    throw new Error("only the current steward can do that");
  }
}

export async function addSuccessor(input: {
  familyId: string;
  actingMemberId: string;
  memberId: string;
}) {
  await assertActingSteward(input.familyId, input.actingMemberId);

  const member = await prisma.member.findFirst({
    where: { id: input.memberId, familyId: input.familyId },
    select: { id: true, userId: true },
  });
  if (!member) throw new Error("no such family member");
  // A successor has to be able to sign in to actually take over.
  if (!member.userId) throw new Error("that person has no login yet");
  if (input.memberId === input.actingMemberId) {
    throw new Error("the steward can't be their own successor");
  }

  const current = await orderedSuccessorMemberIds(prisma, input.familyId);
  if (current.includes(input.memberId)) return;
  await rewriteSuccessors(prisma, input.familyId, [...current, input.memberId]);
  await maybeSupersede(input.familyId);

  const [invitee, family] = await Promise.all([
    prisma.member.findUnique({
      where: { id: input.memberId },
      include: { user: true },
    }),
    prisma.family.findUniqueOrThrow({ where: { id: input.familyId } }),
  ]);
  if (invitee?.user?.email) {
    await sendEmail({
      to: invitee.user.email,
      subject: `Wisdom Well: you've been named a successor for ${family.name}`,
      text: `The steward of ${family.name} has named you in the line of succession. Open the app and go to Stewardship to accept — you won't be promoted unless you do. Accepting shares nothing sealed; it means you're willing to look after the family if the current steward becomes inactive.`,
    });
  }
}

/** A named successor confirms they'll take the role. */
export async function acceptSuccession(input: {
  familyId: string;
  actingMemberId: string;
}): Promise<void> {
  const row = await prisma.successor.findFirst({
    where: { familyId: input.familyId, memberId: input.actingMemberId },
  });
  if (!row) throw new Error("you have not been named as a successor");
  if (row.acceptedAt) return;
  await prisma.successor.update({
    where: { id: row.id },
    data: { acceptedAt: new Date() },
  });
}

export async function setSuccessionPolicy(input: {
  familyId: string;
  actingMemberId: string;
  policy: "NAMED_ONLY" | "NAMED_THEN_ELDEST_DESCENDANT";
}): Promise<void> {
  await assertActingSteward(input.familyId, input.actingMemberId);
  await prisma.family.update({
    where: { id: input.familyId },
    data: { successionPolicy: input.policy },
  });
}

export async function removeSuccessor(input: {
  familyId: string;
  actingMemberId: string;
  successorId: string;
}) {
  await assertActingSteward(input.familyId, input.actingMemberId);
  const row = await prisma.successor.findFirst({
    where: { id: input.successorId, familyId: input.familyId },
  });
  if (!row) return;
  const remaining = (await orderedSuccessorMemberIds(prisma, input.familyId)).filter(
    (id) => id !== row.memberId,
  );
  await rewriteSuccessors(prisma, input.familyId, remaining);
  await maybeSupersede(input.familyId);
}

export async function moveSuccessor(input: {
  familyId: string;
  actingMemberId: string;
  successorId: string;
  direction: "up" | "down";
}) {
  await assertActingSteward(input.familyId, input.actingMemberId);
  const row = await prisma.successor.findFirst({
    where: { id: input.successorId, familyId: input.familyId },
  });
  if (!row) return;

  const order = await orderedSuccessorMemberIds(prisma, input.familyId);
  const i = order.indexOf(row.memberId);
  const j = input.direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  await rewriteSuccessors(prisma, input.familyId, order);
}

/** If a pending transfer no longer makes sense after a list edit, resolve it. */
async function maybeSupersede(familyId: string) {
  const pending = await prisma.stewardTransfer.findFirst({
    where: { familyId, status: "PENDING" },
  });
  if (pending) await processFamilySuccession(familyId);
}

// --- Assessment & views -------------------------------------------

export interface StewardAssessment {
  stewardMemberId: string | null;
  stewardName: string | null;
  lastSeenAt: Date | null;
  inactivityThresholdDays: number;
  successionGraceDays: number;
  daysSinceSeen: number | null;
  isInactive: boolean;
}

export async function assessSteward(familyId: string): Promise<StewardAssessment> {
  const family = await prisma.family.findUniqueOrThrow({
    where: { id: familyId },
    include: { stewardMember: { include: { user: true } } },
  });

  const lastSeenAt = family.stewardMember?.user?.lastSeenAt ?? null;
  const state: SuccessionState = {
    now: new Date(),
    stewardMemberId: family.stewardMemberId,
    stewardLastSeenAt: lastSeenAt,
    inactivityThresholdDays: family.inactivityThresholdDays,
    successionGraceDays: family.successionGraceDays,
    successors: [],
    pendingTransfer: null,
  };

  return {
    stewardMemberId: family.stewardMemberId,
    stewardName: family.stewardMember
      ? `${family.stewardMember.givenName} ${family.stewardMember.familyName}`.trim()
      : null,
    lastSeenAt,
    inactivityThresholdDays: family.inactivityThresholdDays,
    successionGraceDays: family.successionGraceDays,
    daysSinceSeen: lastSeenAt
      ? Math.floor((Date.now() - lastSeenAt.getTime()) / 86_400_000)
      : null,
    isInactive: isStewardInactive(state),
  };
}

export interface SuccessionView {
  assessment: StewardAssessment;
  policy: "NAMED_ONLY" | "NAMED_THEN_ELDEST_DESCENDANT";
  successors: {
    id: string;
    memberId: string;
    name: string;
    position: number;
    hasLogin: boolean;
    accepted: boolean;
  }[];
  /** The eldest-descendant fallback, if the policy allows one and one exists. */
  policyFallbackName: string | null;
  pendingTransfer: {
    id: string;
    toMemberId: string;
    toName: string;
    graceEndsAt: Date;
    graceElapsed: boolean;
  } | null;
  history: {
    id: string;
    toName: string;
    status: string;
    at: Date;
    cancelReason: string | null;
  }[];
}

export async function getSuccessionView(familyId: string): Promise<SuccessionView> {
  const [family, assessment, successorRows, pending, past] = await Promise.all([
    prisma.family.findUniqueOrThrow({ where: { id: familyId } }),
    assessSteward(familyId),
    prisma.successor.findMany({
      where: { familyId },
      orderBy: { position: "asc" },
      include: { member: true },
    }),
    prisma.stewardTransfer.findFirst({
      where: { familyId, status: "PENDING" },
      include: { toMember: true },
    }),
    prisma.stewardTransfer.findMany({
      where: { familyId, status: { in: ["COMPLETED", "CANCELLED"] } },
      orderBy: { initiatedAt: "desc" },
      take: 10,
      include: { toMember: true },
    }),
  ]);

  const anyAccepted = successorRows.some(
    (s) => s.member.userId != null && s.acceptedAt != null,
  );
  const fallback = anyAccepted
    ? null
    : await resolvePolicyCandidate(
        familyId,
        family.stewardMemberId ? [family.stewardMemberId] : [],
      );

  return {
    assessment,
    policy: family.successionPolicy,
    policyFallbackName: fallback
      ? `${fallback.givenName} ${fallback.familyName}`.trim()
      : null,
    successors: successorRows.map((s) => ({
      id: s.id,
      memberId: s.memberId,
      name: `${s.member.givenName} ${s.member.familyName}`.trim(),
      position: s.position,
      hasLogin: s.member.userId != null,
      accepted: s.acceptedAt != null,
    })),
    pendingTransfer: pending
      ? {
          id: pending.id,
          toMemberId: pending.toMemberId,
          toName: `${pending.toMember.givenName} ${pending.toMember.familyName}`.trim(),
          graceEndsAt: pending.graceEndsAt,
          graceElapsed: Date.now() >= pending.graceEndsAt.getTime(),
        }
      : null,
    history: past.map((t) => ({
      id: t.id,
      toName: `${t.toMember.givenName} ${t.toMember.familyName}`.trim(),
      status: t.status,
      at: t.completedAt ?? t.cancelledAt ?? t.initiatedAt,
      cancelReason: t.cancelReason,
    })),
  };
}

// --- The engine: process one family ------------------------------

function memberName(m: { givenName: string; familyName: string }): string {
  return `${m.givenName} ${m.familyName}`.trim();
}

export interface SuccessionOutcome {
  familyId: string;
  action: "NONE" | "INITIATE" | "COMPLETE" | "CANCEL";
  detail: string;
}

export async function processFamilySuccession(
  familyId: string,
  now: Date = new Date(),
): Promise<SuccessionOutcome> {
  const family = await prisma.family.findUniqueOrThrow({
    where: { id: familyId },
    include: { stewardMember: { include: { user: true } } },
  });

  const [successorRows, pending] = await Promise.all([
    prisma.successor.findMany({
      where: { familyId },
      orderBy: { position: "asc" },
      include: { member: true },
    }),
    prisma.stewardTransfer.findFirst({
      where: { familyId, status: "PENDING" },
    }),
  ]);

  // A named successor counts only once they have a login AND have accepted.
  let validSuccessors = successorRows
    .filter((s) => s.member.userId != null && s.acceptedAt != null)
    .map((s) => ({ memberId: s.memberId, position: s.position }));

  // If the named line is empty, fall back to the policy candidate.
  if (validSuccessors.length === 0 && family.stewardMemberId) {
    const fallback = await resolvePolicyCandidate(familyId, [
      family.stewardMemberId,
    ]);
    if (fallback) validSuccessors = [{ memberId: fallback.id, position: 1 }];
  }

  const state: SuccessionState = {
    now,
    stewardMemberId: family.stewardMemberId,
    stewardLastSeenAt: family.stewardMember?.user?.lastSeenAt ?? null,
    inactivityThresholdDays: family.inactivityThresholdDays,
    successionGraceDays: family.successionGraceDays,
    successors: validSuccessors,
    pendingTransfer: pending
      ? {
          id: pending.id,
          toMemberId: pending.toMemberId,
          initiatedAt: pending.initiatedAt,
          graceEndsAt: pending.graceEndsAt,
          stewardLastSeenAt: pending.stewardLastSeenAt,
        }
      : null,
  };

  const decision = decideSuccession(state);

  switch (decision.action) {
    case "NONE":
      return { familyId, action: "NONE", detail: decision.reason };

    case "INITIATE": {
      const transfer = await prisma.stewardTransfer.create({
        data: {
          familyId,
          fromMemberId: family.stewardMemberId,
          toMemberId: decision.toMemberId,
          stewardLastSeenAt: decision.stewardLastSeenAt,
          graceEndsAt: decision.graceEndsAt,
        },
        include: {
          fromMember: { include: { user: true } },
          toMember: { include: { user: true } },
        },
      });
      await notifyInitiated(family.name, transfer, decision.daysInactive);
      return {
        familyId,
        action: "INITIATE",
        detail: `handover to ${memberName(transfer.toMember)} begins; grace ends ${decision.graceEndsAt.toISOString().slice(0, 10)}`,
      };
    }

    case "COMPLETE": {
      const result = await prisma.$transaction(async (tx) => {
        const t = await tx.stewardTransfer.update({
          where: { id: decision.transferId },
          data: { status: "COMPLETED", completedAt: now },
          include: {
            fromMember: { include: { user: true } },
            toMember: { include: { user: true } },
          },
        });
        await tx.family.update({
          where: { id: familyId },
          data: { stewardMemberId: decision.toMemberId },
        });
        // The new steward leaves the line of succession; everyone else shuffles up.
        const remaining = (await orderedSuccessorMemberIds(tx, familyId)).filter(
          (id) => id !== decision.toMemberId,
        );
        await rewriteSuccessors(tx, familyId, remaining);
        return t;
      });
      await notifyCompleted(family.name, result);
      return {
        familyId,
        action: "COMPLETE",
        detail: `${memberName(result.toMember)} is now the steward`,
      };
    }

    case "CANCEL": {
      const t = await prisma.stewardTransfer.update({
        where: { id: decision.transferId },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          cancelReason: decision.cancelReason,
        },
        include: { toMember: { include: { user: true } } },
      });
      await notifyCancelled(family.name, t, decision.cancelReason);
      return {
        familyId,
        action: "CANCEL",
        detail: `handover cancelled (${decision.cancelReason})`,
      };
    }
  }
}

export async function processAllSuccession(
  now: Date = new Date(),
): Promise<SuccessionOutcome[]> {
  const families = await prisma.family.findMany({ select: { id: true } });
  const out: SuccessionOutcome[] = [];
  for (const { id } of families) {
    out.push(await processFamilySuccession(id, now));
  }
  return out;
}

// --- Steward / successor actions --------------------------------

/** The steward says "I'm still here." */
export async function declineTransfer(input: {
  familyId: string;
  actingMemberId: string;
}): Promise<void> {
  await assertActingSteward(input.familyId, input.actingMemberId);

  const acting = await prisma.member.findUnique({
    where: { id: input.actingMemberId },
    select: { userId: true },
  });
  if (acting?.userId) {
    await prisma.user.update({
      where: { id: acting.userId },
      data: { lastSeenAt: new Date() },
    });
  }

  const pending = await prisma.stewardTransfer.findFirst({
    where: { familyId: input.familyId, status: "PENDING" },
    include: { toMember: { include: { user: true } } },
  });
  if (!pending) return;

  await prisma.stewardTransfer.update({
    where: { id: pending.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: "STEWARD_DECLINED",
    },
  });
  await notifyCancelled(
    (await prisma.family.findUniqueOrThrow({ where: { id: input.familyId } })).name,
    pending,
    "STEWARD_DECLINED",
  );
}

/** A successor takes over once the grace period has elapsed. */
export async function assumeStewardship(input: {
  familyId: string;
  actingMemberId: string;
}): Promise<SuccessionOutcome> {
  const pending = await prisma.stewardTransfer.findFirst({
    where: { familyId: input.familyId, status: "PENDING" },
  });
  if (!pending || pending.toMemberId !== input.actingMemberId) {
    throw new Error("there is no pending handover to you");
  }
  if (Date.now() < pending.graceEndsAt.getTime()) {
    throw new Error("the grace period has not elapsed yet");
  }
  return processFamilySuccession(input.familyId);
}

/**
 * Called on every authenticated request for a steward: if they have a pending
 * inactivity handover, their signing in cancels it immediately (the daily job
 * would catch it too, but this makes "the steward came back" instant).
 */
export async function cancelTransferOnStewardReturn(stewardMemberId: string) {
  const family = await prisma.family.findFirst({
    where: { stewardMemberId },
    select: { id: true },
  });
  if (!family) return;
  const pending = await prisma.stewardTransfer.findFirst({
    where: { familyId: family.id, status: "PENDING" },
  });
  if (pending) await processFamilySuccession(family.id);
}

// --- Notifications -------------------------------------------------

type TransferWithParties = Prisma.StewardTransferGetPayload<{
  include: {
    fromMember: { include: { user: true } };
    toMember: { include: { user: true } };
  };
}>;
type TransferWithTo = Prisma.StewardTransferGetPayload<{
  include: { toMember: { include: { user: true } } };
}>;

async function notifyInitiated(
  familyName: string,
  transfer: TransferWithParties,
  daysInactive: number,
) {
  const grace = transfer.graceEndsAt.toLocaleDateString();
  const stewardEmail = transfer.fromMember?.user?.email;
  if (stewardEmail) {
    await sendEmail({
      to: stewardEmail,
      subject: `Wisdom Well: your stewardship of ${familyName}`,
      text: `We haven't seen you sign in for ${daysInactive} days. Unless you sign in or decline, stewardship of ${familyName} passes to ${memberName(transfer.toMember)} on ${grace}.`,
    });
  }
  const heirEmail = transfer.toMember.user?.email;
  if (heirEmail) {
    await sendEmail({
      to: heirEmail,
      subject: `Wisdom Well: you may become steward of ${familyName}`,
      text: `${transfer.fromMember ? memberName(transfer.fromMember) : "The current steward"} has been inactive. On ${grace} you can assume stewardship of ${familyName}. Nothing sealed is shared with you — you'll be able to manage the family and its line of succession.`,
    });
  }
}

async function notifyCompleted(familyName: string, transfer: TransferWithParties) {
  const heirEmail = transfer.toMember.user?.email;
  if (heirEmail) {
    await sendEmail({
      to: heirEmail,
      subject: `Wisdom Well: you are now the steward of ${familyName}`,
      text: `Stewardship of ${familyName} has passed to you. You can manage the family tree and the line of succession. Entries that were sealed remain sealed — becoming steward does not let you read them.`,
    });
  }
  const oldEmail = transfer.fromMember?.user?.email;
  if (oldEmail) {
    await sendEmail({
      to: oldEmail,
      subject: `Wisdom Well: stewardship of ${familyName} has transferred`,
      text: `Stewardship of ${familyName} has passed to ${memberName(transfer.toMember)}.`,
    });
  }
}

async function notifyCancelled(
  familyName: string,
  transfer: TransferWithTo,
  reason: string,
) {
  const heirEmail = transfer.toMember.user?.email;
  if (heirEmail) {
    await sendEmail({
      to: heirEmail,
      subject: `Wisdom Well: the handover of ${familyName} was called off`,
      text: `The pending stewardship handover of ${familyName} to you has been cancelled (${reason.toLowerCase().replace("_", " ")}).`,
    });
  }
}
