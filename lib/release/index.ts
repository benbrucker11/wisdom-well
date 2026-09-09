/**
 * Database-backed release engine. Loads a family snapshot, runs the pure engine
 * (./engine.ts) and pure visibility logic (./visibility.ts), and persists the
 * result.
 *
 * Everything that reads entries goes through `visibleEntriesFor` /
 * `visibleEntry`. No route handler or page should query the `Entry` table
 * directly — that is the trust boundary (spec §5).
 *
 * Not marked "server-only" so the seed script and tests can import it under
 * plain Node; in practice it always runs on the server.
 */
import type { Entry, Member, ReleaseRule } from "@prisma/client";
import { prisma } from "../db";
import {
  buildGraph,
  candidateRecipientIds,
  evaluateReleases,
  unrunnableRules,
  type Edge,
  type EngineConfirmation,
  type EngineEntry,
  type EngineMember,
  type EngineRule,
} from "./engine";
import { selectVisibleEntries, type VisibilityReason } from "./visibility";

// --- Snapshot loading ---------------------------------------------------

function toEngineMember(m: Member): EngineMember {
  return {
    id: m.id,
    dateOfBirth: m.dateOfBirth,
    dateOfDeath: m.dateOfDeath,
    status: m.status,
  };
}

function toEngineRule(r: ReleaseRule): EngineRule {
  return {
    id: r.id,
    entryId: r.entryId,
    targetType: r.targetType,
    targetMemberId: r.targetMemberId,
    targetRole: r.targetRole,
    triggerType: r.triggerType,
    triggerAge: r.triggerAge,
    triggerDate: r.triggerDate,
    triggerEvent: r.triggerEvent,
    includeStepDescendants: r.includeStepDescendants,
  };
}

async function loadEdges(familyId: string): Promise<Edge[]> {
  const relationships = await prisma.relationship.findMany({ where: { familyId } });
  return relationships.map((r) => ({
    fromMemberId: r.fromMemberId,
    toMemberId: r.toMemberId,
    type: r.type,
    parentKind: r.parentKind,
    endedAt: r.endedAt,
  }));
}

// --- Evaluation -------------------------------------------------------

export interface EvaluationResult {
  familyId: string;
  releasesCreated: number;
  entriesReleased: number;
}

/**
 * Re-evaluate every live rule in a family and materialise any Release rows that
 * should now exist. Idempotent — safe to call on every tree change, entry
 * publish, event confirmation, and once a day.
 */
export async function evaluateFamily(familyId: string): Promise<EvaluationResult> {
  const now = new Date();

  const [members, edges, liveEntries, confirmations, existingReleases] =
    await Promise.all([
      prisma.member.findMany({ where: { familyId } }),
      loadEdges(familyId),
      prisma.entry.findMany({
        where: { familyId, status: { in: ["SCHEDULED", "RELEASED"] } },
        include: { rules: true },
      }),
      prisma.eventConfirmation.findMany({
        where: { rule: { entry: { familyId } } },
      }),
      prisma.release.findMany({
        where: { entry: { familyId } },
        select: { entryId: true, recipientMemberId: true },
      }),
    ]);

  const engineEntries: EngineEntry[] = liveEntries.map((e) => ({
    id: e.id,
    authorMemberId: e.authorMemberId,
    status: e.status as "SCHEDULED" | "RELEASED",
  }));
  const engineRules: EngineRule[] = liveEntries.flatMap((e) =>
    e.rules.map(toEngineRule),
  );
  const engineConfirmations: EngineConfirmation[] = confirmations.map((c) => ({
    ruleId: c.ruleId,
    subjectMemberId: c.subjectMemberId,
  }));

  const newReleases = evaluateReleases({
    members: members.map(toEngineMember),
    edges,
    entries: engineEntries,
    rules: engineRules,
    confirmations: engineConfirmations,
    existingReleases,
    now,
  });

  if (newReleases.length === 0) {
    return { familyId, releasesCreated: 0, entriesReleased: 0 };
  }

  await prisma.release.createMany({
    data: newReleases.map((r) => ({
      entryId: r.entryId,
      ruleId: r.ruleId,
      recipientMemberId: r.recipientMemberId,
    })),
    skipDuplicates: true,
  });

  // Any SCHEDULED entry that just gained its first recipient becomes RELEASED.
  const touchedEntryIds = [...new Set(newReleases.map((r) => r.entryId))];
  const promoted = await prisma.entry.updateMany({
    where: { id: { in: touchedEntryIds }, status: "SCHEDULED" },
    data: { status: "RELEASED", releasedAt: now },
  });

  return {
    familyId,
    releasesCreated: newReleases.length,
    entriesReleased: promoted.count,
  };
}

export async function evaluateAllFamilies(): Promise<EvaluationResult[]> {
  const families = await prisma.family.findMany({ select: { id: true } });
  const results: EvaluationResult[] = [];
  for (const { id } of families) {
    results.push(await evaluateFamily(id));
  }
  return results;
}

// --- Visibility (the only read path) --------------------------------

export type EntryWithAuthor = Entry & { author: Member };

export interface VisibleEntryView {
  entry: EntryWithAuthor;
  reason: VisibilityReason;
  releasedToViewer: boolean;
}

/**
 * Every entry `memberId` is allowed to see, and nothing else. A gated entry is
 * absent from this list entirely — no title, no placeholder, no count.
 */
export async function visibleEntriesFor(memberId: string): Promise<VisibleEntryView[]> {
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) return [];

  const [entries, releases] = await Promise.all([
    prisma.entry.findMany({
      where: { familyId: member.familyId },
      include: { author: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.release.findMany({
      where: { entry: { familyId: member.familyId } },
      select: { entryId: true, recipientMemberId: true },
    }),
  ]);

  const visible = selectVisibleEntries({
    viewerMemberId: memberId,
    entries: entries.map((e) => ({
      id: e.id,
      authorMemberId: e.authorMemberId,
      status: e.status,
    })),
    releases,
  });
  const byId = new Map(visible.map((v) => [v.entryId, v]));

  return entries
    .filter((e) => byId.has(e.id))
    .map((e) => {
      const v = byId.get(e.id)!;
      return { entry: e, reason: v.reason, releasedToViewer: v.releasedToViewer };
    });
}

/** One entry, or null if this member may not see it. Goes through the same gate. */
export async function visibleEntry(
  memberId: string,
  entryId: string,
): Promise<VisibleEntryView | null> {
  const all = await visibleEntriesFor(memberId);
  return all.find((v) => v.entry.id === entryId) ?? null;
}

// --- Steward-facing, content-free views ------------------------------

/**
 * Aggregate counts only — for succession planning. The Steward can know that 42
 * scheduled entries exist without being able to open any of them (spec §5).
 */
export async function familyReleaseStats(familyId: string) {
  const [drafts, scheduled, released, recipients] = await Promise.all([
    prisma.entry.count({ where: { familyId, status: "DRAFT" } }),
    prisma.entry.count({ where: { familyId, status: "SCHEDULED" } }),
    prisma.entry.count({ where: { familyId, status: "RELEASED" } }),
    prisma.release.count({ where: { entry: { familyId } } }),
  ]);
  return { drafts, scheduled, released, recipients };
}

export interface UnrunnableRuleView {
  ruleId: string;
  entryId: string;
  reason: string;
  /** Entry title, only when the viewer is that entry's author. */
  entryTitle: string | null;
}

export async function unrunnableRulesForFamily(
  familyId: string,
  viewerMemberId: string,
): Promise<UnrunnableRuleView[]> {
  const [members, liveEntries] = await Promise.all([
    prisma.member.findMany({ where: { familyId } }),
    prisma.entry.findMany({
      where: { familyId, status: { in: ["SCHEDULED", "RELEASED"] } },
      include: { rules: true },
    }),
  ]);

  const flagged = unrunnableRules({
    members: members.map(toEngineMember),
    entries: liveEntries.map((e) => ({
      id: e.id,
      authorMemberId: e.authorMemberId,
      status: e.status as "SCHEDULED" | "RELEASED",
    })),
    rules: liveEntries.flatMap((e) => e.rules.map(toEngineRule)),
  });

  const entriesById = new Map(liveEntries.map((e) => [e.id, e]));
  return flagged.map((f) => {
    const entry = entriesById.get(f.entryId);
    const isAuthor = entry?.authorMemberId === viewerMemberId;
    return {
      ruleId: f.ruleId,
      entryId: f.entryId,
      reason: f.reason,
      entryTitle: isAuthor ? (entry?.title ?? null) : null,
    };
  });
}

// --- Event confirmation queue --------------------------------------

export type PendingConfirmation =
  | {
      kind: "EVENT";
      ruleId: string;
      entryId: string;
      authorMemberId: string;
      /** Only populated when the viewer authored the entry. */
      entryTitle: string | null;
      authorName: string;
      event: string;
      label: string;
      subjectMemberId: string;
      subjectName: string;
    }
  | {
      kind: "DEATH_OF_AUTHOR";
      ruleId: string;
      entryId: string;
      authorMemberId: string;
      entryTitle: string | null;
      authorName: string;
    };

const EVENT_LABELS: Record<string, string> = {
  MARRIAGE: "marriage",
  GRADUATION: "graduation",
  BIRTH_OF_FIRST_CHILD: "birth of first child",
  DEATH_OF_AUTHOR: "death of the author",
  CUSTOM: "a custom event",
};

function memberName(m: Pick<Member, "givenName" | "familyName">): string {
  return `${m.givenName} ${m.familyName}`.trim();
}

/**
 * "Waiting on: Michael's wedding." Every event trigger that has not yet fired
 * for a candidate recipient, as a to-do list for the Steward (or the living
 * author). Entry titles are redacted unless the viewer is the author.
 */
export async function pendingEventConfirmations(
  familyId: string,
  viewerMemberId: string,
): Promise<PendingConfirmation[]> {
  const [members, edges, liveEntries, confirmations, releases] = await Promise.all([
    prisma.member.findMany({ where: { familyId } }),
    loadEdges(familyId),
    prisma.entry.findMany({
      where: { familyId, status: { in: ["SCHEDULED", "RELEASED"] } },
      include: { rules: true },
    }),
    prisma.eventConfirmation.findMany({ where: { rule: { entry: { familyId } } } }),
    prisma.release.findMany({
      where: { entry: { familyId } },
      select: { entryId: true, recipientMemberId: true },
    }),
  ]);

  const membersById = new Map(members.map((m) => [m.id, m]));
  const graph = buildGraph(edges);
  const confirmedKeys = new Set(
    confirmations.map((c) => `${c.ruleId}:${c.subjectMemberId}`),
  );
  const releasedKeys = new Set(
    releases.map((r) => `${r.entryId}:${r.recipientMemberId}`),
  );

  const out: PendingConfirmation[] = [];

  for (const entry of liveEntries) {
    const author = membersById.get(entry.authorMemberId);
    const authorName = author ? memberName(author) : "the author";
    const titleForViewer =
      entry.authorMemberId === viewerMemberId ? entry.title : null;

    for (const rule of entry.rules) {
      if (rule.triggerType !== "EVENT") continue;

      if (rule.triggerEvent === "DEATH_OF_AUTHOR") {
        if (author?.dateOfDeath == null) {
          out.push({
            kind: "DEATH_OF_AUTHOR",
            ruleId: rule.id,
            entryId: entry.id,
            authorMemberId: entry.authorMemberId,
            entryTitle: titleForViewer,
            authorName,
          });
        }
        continue;
      }

      const candidates = candidateRecipientIds(
        toEngineRule(rule),
        entry.authorMemberId,
        members.map(toEngineMember),
        graph,
      );
      for (const candidateId of candidates) {
        if (releasedKeys.has(`${entry.id}:${candidateId}`)) continue;
        if (confirmedKeys.has(`${rule.id}:${candidateId}`)) continue;
        const subject = membersById.get(candidateId);
        if (!subject) continue;

        const eventName = rule.triggerEvent ?? "CUSTOM";
        out.push({
          kind: "EVENT",
          ruleId: rule.id,
          entryId: entry.id,
          authorMemberId: entry.authorMemberId,
          entryTitle: titleForViewer,
          authorName,
          event: eventName,
          label:
            eventName === "CUSTOM" && rule.triggerEventLabel
              ? rule.triggerEventLabel
              : EVENT_LABELS[eventName] ?? eventName,
          subjectMemberId: candidateId,
          subjectName: memberName(subject),
        });
      }
    }
  }

  return out;
}

/** Record that an event happened for a person, then re-evaluate. */
export async function confirmEvent(input: {
  familyId: string;
  ruleId: string;
  subjectMemberId: string;
  confirmedByMemberId: string;
}): Promise<EvaluationResult> {
  await prisma.eventConfirmation.upsert({
    where: {
      ruleId_subjectMemberId: {
        ruleId: input.ruleId,
        subjectMemberId: input.subjectMemberId,
      },
    },
    update: {},
    create: {
      ruleId: input.ruleId,
      subjectMemberId: input.subjectMemberId,
      confirmedByMemberId: input.confirmedByMemberId,
    },
  });
  return evaluateFamily(input.familyId);
}
