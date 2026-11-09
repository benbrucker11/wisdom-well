// Server-only in practice (it uses the Prisma client), but deliberately not
// importing "server-only" so the seed script can reuse it under plain Node.
import type { Member } from "@prisma/client";
import { prisma } from "../db";
import {
  buildGraph,
  getDescendants as getDescendantsFromGraph,
  resolveRelationship as resolveRelationshipInGraph,
  type Edge,
} from "./graph";

export type { Descendant, RelationGraph } from "./graph";
export { buildGraph } from "./graph";

async function loadFamilyEdges(familyId: string): Promise<Edge[]> {
  const relationships = await prisma.relationship.findMany({ where: { familyId } });
  return relationships.map((r) => ({
    fromMemberId: r.fromMemberId,
    toMemberId: r.toMemberId,
    type: r.type,
    parentKind: r.parentKind,
    endedAt: r.endedAt,
  }));
}

async function memberOrThrow(memberId: string): Promise<Member> {
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) throw new Error(`Member ${memberId} not found`);
  return member;
}

/**
 * Describe `toMemberId` from `fromMemberId`'s point of view — "grandchild",
 * "sibling", "first cousin once removed", "spouse", "unrelated", etc.
 *
 * The release engine (Phase 2) depends on this. Both members must belong to
 * the same family.
 */
export async function resolveRelationship(
  fromMemberId: string,
  toMemberId: string,
): Promise<string> {
  const from = await memberOrThrow(fromMemberId);
  const edges = await loadFamilyEdges(from.familyId);
  return resolveRelationshipInGraph(buildGraph(edges), fromMemberId, toMemberId);
}

export interface DescendantMember {
  member: Member;
  /** 1 = child, 2 = grandchild, 3 = great-grandchild, ... */
  generation: number;
}

/**
 * Every descendant of `memberId` down to `generations` levels, via PARENT_OF.
 * `generations = 2` returns children and grandchildren.
 *
 * The release engine (Phase 2) depends on this for ROLE-targeted rules
 * (CHILD / GRANDCHILD / ANY_DESCENDANT).
 */
export async function getDescendants(
  memberId: string,
  generations: number,
): Promise<DescendantMember[]> {
  const root = await memberOrThrow(memberId);
  const edges = await loadFamilyEdges(root.familyId);
  const descendants = getDescendantsFromGraph(buildGraph(edges), memberId, generations);

  if (descendants.length === 0) return [];

  const members = await prisma.member.findMany({
    where: { id: { in: descendants.map((d) => d.memberId) } },
  });
  const byId = new Map(members.map((m) => [m.id, m]));

  return descendants
    .map((d) => {
      const member = byId.get(d.memberId);
      return member ? { member, generation: d.generation } : null;
    })
    .filter((x): x is DescendantMember => x !== null);
}

export interface FamilyRelationView {
  focus: Member;
  members: Member[];
  /** Every other family member, with their relationship to `focus`. */
  relations: { member: Member; relation: string }[];
  /** Convenience slice used by the tree UI: `focus`'s grandchildren. */
  grandchildren: Member[];
}

/**
 * One round-trip view of the whole family as seen from a single member. Used by
 * the family tree page so it can answer "who are X's grandchildren?" and label
 * every other person without N queries.
 */
export async function describeFamilyFrom(focusMemberId: string): Promise<FamilyRelationView> {
  const focus = await memberOrThrow(focusMemberId);

  const [members, relationships] = await Promise.all([
    prisma.member.findMany({
      where: { familyId: focus.familyId },
      orderBy: [{ dateOfBirth: "asc" }, { createdAt: "asc" }],
    }),
    prisma.relationship.findMany({ where: { familyId: focus.familyId } }),
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

  // CUSTOM links never affect lineage, but they describe the person better
  // than "unrelated" ("godfather", "like a sister").
  const customLabel = new Map<string, string>();
  for (const r of relationships) {
    if (r.type !== "CUSTOM" || !r.customLabel) continue;
    if (r.fromMemberId === focusMemberId) customLabel.set(r.toMemberId, r.customLabel);
    if (r.toMemberId === focusMemberId) customLabel.set(r.fromMemberId, r.customLabel);
  }

  const relations = members
    .filter((m) => m.id !== focusMemberId)
    .map((m) => {
      const lineage = resolveRelationshipInGraph(graph, focusMemberId, m.id);
      const custom = customLabel.get(m.id);
      const relation = !custom
        ? lineage
        : lineage === "unrelated"
          ? custom
          : `${lineage} · ${custom}`;
      return { member: m, relation };
    });

  const grandchildIds = new Set(
    getDescendantsFromGraph(graph, focusMemberId, 2)
      .filter((d) => d.generation === 2)
      .map((d) => d.memberId),
  );
  const grandchildren = members.filter((m) => grandchildIds.has(m.id));

  return { focus, members, relations, grandchildren };
}
