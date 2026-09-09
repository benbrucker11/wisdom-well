/**
 * The release engine — pure logic, no database, no framework.
 *
 * Given a snapshot of a family (members, lineage edges, published entries,
 * their rules, and the event confirmations recorded so far) it returns the set
 * of (entry, recipient) pairs that should now have a Release row.
 *
 * The rules are declarative and this function is re-run from scratch on every
 * relevant change (daily job, tree edit, entry publish, event confirmation).
 * That is what makes a rule written today fire in thirty years for a
 * grandchild who does not exist yet — see engine.test.ts.
 *
 * Design note (spec §4): "Build it as an isolated, heavily tested module. Do
 * not scatter this logic across route handlers." The database wrapper in
 * ./index.ts only loads the snapshot, calls this, and writes the result.
 */
import { buildGraph, getDescendants, type Edge } from "../relationships/graph";

export { buildGraph } from "../relationships/graph";
export type { Edge } from "../relationships/graph";

export type TargetType = "IMMEDIATE" | "SPECIFIC_MEMBER" | "ROLE";
export type TargetRole =
  | "CHILD"
  | "GRANDCHILD"
  | "GREAT_GRANDCHILD"
  | "ANY_DESCENDANT"
  | "ALL_FAMILY";
export type TriggerType = "NONE" | "AGE" | "DATE" | "EVENT";
export type TriggerEvent =
  | "MARRIAGE"
  | "GRADUATION"
  | "BIRTH_OF_FIRST_CHILD"
  | "DEATH_OF_AUTHOR"
  | "CUSTOM";

export interface EngineMember {
  id: string;
  dateOfBirth: Date | null;
  dateOfDeath: Date | null;
}

export interface EngineEntry {
  id: string;
  authorMemberId: string;
  /** Only SCHEDULED and RELEASED entries are ever passed in. DRAFTs are invisible. */
  status: "SCHEDULED" | "RELEASED";
}

export interface EngineRule {
  id: string;
  entryId: string;
  targetType: TargetType;
  targetMemberId: string | null;
  targetRole: TargetRole | null;
  triggerType: TriggerType;
  triggerAge: number | null;
  triggerDate: Date | null;
  triggerEvent: TriggerEvent | null;
}

/** One recorded "the event happened for this person" confirmation. */
export interface EngineConfirmation {
  ruleId: string;
  subjectMemberId: string;
}

export interface EngineRelease {
  entryId: string;
  recipientMemberId: string;
}

export interface EngineInput {
  members: EngineMember[];
  edges: Edge[];
  entries: EngineEntry[];
  rules: EngineRule[];
  confirmations: EngineConfirmation[];
  /** Releases that already exist — never revoked, and used to skip work. */
  existingReleases: EngineRelease[];
  now: Date;
}

export interface NewRelease {
  entryId: string;
  ruleId: string;
  recipientMemberId: string;
}

const ANY_DESCENDANT_DEPTH = 100;

/** Whole years between `dob` and `asOf`, UTC. */
export function ageInYears(dob: Date, asOf: Date): number {
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = asOf.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/**
 * Everyone a rule *could* release to, before applying the trigger. Roles are
 * resolved relative to the entry's author.
 */
export function candidateRecipientIds(
  rule: EngineRule,
  authorMemberId: string,
  members: EngineMember[],
  graph: ReturnType<typeof buildGraph>,
): string[] {
  switch (rule.targetType) {
    case "IMMEDIATE":
      return members.map((m) => m.id);

    case "SPECIFIC_MEMBER":
      return rule.targetMemberId ? [rule.targetMemberId] : [];

    case "ROLE": {
      switch (rule.targetRole) {
        case "ALL_FAMILY":
          return members.map((m) => m.id);
        case "CHILD":
          return descendantsAtDepth(graph, authorMemberId, 1);
        case "GRANDCHILD":
          return descendantsAtDepth(graph, authorMemberId, 2);
        case "GREAT_GRANDCHILD":
          return descendantsAtDepth(graph, authorMemberId, 3);
        case "ANY_DESCENDANT":
          return getDescendants(graph, authorMemberId, ANY_DESCENDANT_DEPTH).map(
            (d) => d.memberId,
          );
        default:
          return [];
      }
    }

    default:
      return [];
  }
}

function descendantsAtDepth(
  graph: ReturnType<typeof buildGraph>,
  rootId: string,
  depth: number,
): string[] {
  return getDescendants(graph, rootId, depth)
    .filter((d) => d.generation === depth)
    .map((d) => d.memberId);
}

/** Is this rule's trigger satisfied for this specific candidate, right now? */
function isTriggerMet(
  rule: EngineRule,
  recipient: EngineMember,
  author: EngineMember | undefined,
  confirmedKeys: Set<string>,
  now: Date,
): boolean {
  switch (rule.triggerType) {
    case "NONE":
      return true;

    case "AGE":
      if (rule.triggerAge == null || recipient.dateOfBirth == null) return false;
      return ageInYears(recipient.dateOfBirth, now) >= rule.triggerAge;

    case "DATE":
      if (rule.triggerDate == null) return false;
      return now.getTime() >= rule.triggerDate.getTime();

    case "EVENT":
      if (rule.triggerEvent === "DEATH_OF_AUTHOR") {
        // Confirmed by setting the author's date of death (spec §4), or by an
        // explicit confirmation row against the author.
        if (author?.dateOfDeath != null) return true;
        return confirmedKeys.has(`${rule.id}:${author?.id ?? ""}`);
      }
      return confirmedKeys.has(`${rule.id}:${recipient.id}`);

    default:
      return false;
  }
}

/**
 * Evaluate every rule against every candidate and return the Release rows that
 * do not exist yet. Deterministic and idempotent: calling it again with the
 * new releases folded into `existingReleases` returns `[]`.
 */
export function evaluateReleases(input: EngineInput): NewRelease[] {
  const membersById = new Map(input.members.map((m) => [m.id, m]));
  const graph = buildGraph(input.edges);

  const confirmedKeys = new Set(
    input.confirmations.map((c) => `${c.ruleId}:${c.subjectMemberId}`),
  );

  const alreadyReleased = new Set(
    input.existingReleases.map((r) => `${r.entryId}:${r.recipientMemberId}`),
  );

  const rulesByEntry = new Map<string, EngineRule[]>();
  for (const rule of input.rules) {
    const list = rulesByEntry.get(rule.entryId);
    if (list) list.push(rule);
    else rulesByEntry.set(rule.entryId, [rule]);
  }

  const results: NewRelease[] = [];
  // Within a single run, the first rule to reach a recipient wins the row.
  const claimedThisRun = new Set<string>();

  for (const entry of input.entries) {
    const rules = rulesByEntry.get(entry.id) ?? [];
    const author = membersById.get(entry.authorMemberId);

    for (const rule of rules) {
      const candidateIds = candidateRecipientIds(
        rule,
        entry.authorMemberId,
        input.members,
        graph,
      );

      for (const candidateId of candidateIds) {
        const pairKey = `${entry.id}:${candidateId}`;
        if (alreadyReleased.has(pairKey) || claimedThisRun.has(pairKey)) continue;

        const recipient = membersById.get(candidateId);
        if (!recipient) continue;

        if (isTriggerMet(rule, recipient, author, confirmedKeys, input.now)) {
          claimedThisRun.add(pairKey);
          results.push({
            entryId: entry.id,
            ruleId: rule.id,
            recipientMemberId: candidateId,
          });
        }
      }
    }
  }

  return results;
}

/**
 * Rules that can never fire as written until something changes — surfaced in
 * the Steward's dashboard as "rules that can't run yet" (spec §4). Currently:
 * an AGE trigger against a specific member with no date of birth.
 */
export function unrunnableRules(input: {
  members: EngineMember[];
  entries: EngineEntry[];
  rules: EngineRule[];
}): { ruleId: string; entryId: string; reason: string }[] {
  const membersById = new Map(input.members.map((m) => [m.id, m]));
  const liveEntryIds = new Set(input.entries.map((e) => e.id));
  const out: { ruleId: string; entryId: string; reason: string }[] = [];

  for (const rule of input.rules) {
    if (!liveEntryIds.has(rule.entryId)) continue;
    if (rule.triggerType !== "AGE") continue;

    if (rule.targetType === "SPECIFIC_MEMBER") {
      const target = rule.targetMemberId
        ? membersById.get(rule.targetMemberId)
        : undefined;
      if (target && target.dateOfBirth == null) {
        out.push({
          ruleId: rule.id,
          entryId: rule.entryId,
          reason: "age trigger, but the target member has no date of birth",
        });
      }
    }
  }

  return out;
}
