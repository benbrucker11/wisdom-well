/**
 * Pure relationship-graph logic. No database, no framework — everything here
 * operates on a plain list of asserted edges so it can be exhaustively unit
 * tested (see graph.test.ts).
 *
 * The database-backed wrappers with the signatures the rest of the app uses
 * (`resolveRelationship(fromMemberId, toMemberId)` and
 * `getDescendants(memberId, generations)`) live in ./index.ts.
 */

export type RelType = "PARENT_OF" | "SPOUSE_OF" | "SIBLING_OF" | "CUSTOM";
export type ParentKind = "BIOLOGICAL" | "ADOPTIVE" | "STEP" | "GUARDIAN";

export interface Edge {
  fromMemberId: string;
  toMemberId: string;
  type: RelType;
  /** For PARENT_OF edges. Absent is read as BIOLOGICAL. */
  parentKind?: ParentKind | null;
  /** For SPOUSE_OF edges. Set once the marriage has ended (divorce). */
  endedAt?: Date | null;
}

export interface RelationGraph {
  parentsOf(id: string): string[];
  childrenOf(id: string): string[];
  spousesOf(id: string): string[];
}

export interface GraphOptions {
  /**
   * Whether STEP parent edges count as lineage. Default true — the product's
   * spirit is inclusive; a ReleaseRule may build a stricter graph.
   */
  includeStep?: boolean;
}

/** Does this PARENT_OF edge carry heritable lineage under these options? */
function isLineage(edge: Edge, includeStep: boolean): boolean {
  const kind = edge.parentKind ?? "BIOLOGICAL";
  if (kind === "GUARDIAN") return false; // a caregiving fact, never lineage
  if (kind === "STEP") return includeStep;
  return true; // BIOLOGICAL, ADOPTIVE
}

function addTo(map: Map<string, Set<string>>, key: string, value: string): void {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(value);
}

/**
 * Build an adjacency view over a family's edges.
 *
 * - PARENT_OF is directional: `from` is the parent, `to` is the child. Only
 *   edges that carry lineage are followed (BIOLOGICAL / ADOPTIVE always; STEP
 *   per `opts.includeStep`, default true; GUARDIAN never).
 * - SPOUSE_OF is treated as symmetric regardless of which way it was stored.
 *   Ended marriages are dropped, so "spouse" and in-law derivations reflect the
 *   present.
 * - SIBLING_OF is deliberately ignored here: sibling relationships are derived
 *   from shared parents so the tree has a single source of truth for lineage.
 * - CUSTOM ("Godfather", "Like a sister") is descriptive only and is never
 *   followed: not lineage, not a spouse, never a release-rule or succession
 *   path.
 */
export function buildGraph(edges: Edge[], opts: GraphOptions = {}): RelationGraph {
  const includeStep = opts.includeStep ?? true;
  const parents = new Map<string, Set<string>>();
  const children = new Map<string, Set<string>>();
  const spouses = new Map<string, Set<string>>();

  for (const edge of edges) {
    switch (edge.type) {
      case "PARENT_OF":
        if (!isLineage(edge, includeStep)) break;
        addTo(parents, edge.toMemberId, edge.fromMemberId);
        addTo(children, edge.fromMemberId, edge.toMemberId);
        break;
      case "SPOUSE_OF":
        if (edge.endedAt) break;
        addTo(spouses, edge.fromMemberId, edge.toMemberId);
        addTo(spouses, edge.toMemberId, edge.fromMemberId);
        break;
      case "SIBLING_OF":
        // Stored as a user-asserted fact but not used for traversal.
        break;
      case "CUSTOM":
        // Descriptive label only — never traversed.
        break;
    }
  }

  return {
    parentsOf: (id) => [...(parents.get(id) ?? [])],
    childrenOf: (id) => [...(children.get(id) ?? [])],
    spousesOf: (id) => [...(spouses.get(id) ?? [])],
  };
}

// --- Descendants ----------------------------------------------------------

export interface Descendant {
  memberId: string;
  /** 1 = child, 2 = grandchild, 3 = great-grandchild, ... */
  generation: number;
}

/**
 * Every descendant of `memberId` down to `generations` levels, via PARENT_OF.
 * `generations = 2` returns children and grandchildren.
 *
 * Safe against malformed cyclic data — each member is reported at most once, at
 * the shallowest generation it is reached.
 */
export function getDescendants(
  graph: RelationGraph,
  memberId: string,
  generations: number,
): Descendant[] {
  const out: Descendant[] = [];
  const seen = new Set<string>([memberId]);
  let frontier = [memberId];

  for (let generation = 1; generation <= generations; generation++) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const child of graph.childrenOf(current)) {
        if (seen.has(child)) continue;
        seen.add(child);
        out.push({ memberId: child, generation });
        next.push(child);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }

  return out;
}

// --- Relationship resolution --------------------------------------------

/**
 * BFS from `id` over PARENT_OF edges, returning each strict ancestor mapped to
 * its shortest distance (1 = parent, 2 = grandparent, ...). Cycle-safe.
 */
function ancestorDistances(graph: RelationGraph, id: string): Map<string, number> {
  const distances = new Map<string, number>();
  const seen = new Set<string>([id]);
  let frontier = [id];
  let distance = 0;

  while (frontier.length > 0) {
    distance++;
    const next: string[] = [];
    for (const current of frontier) {
      for (const parent of graph.parentsOf(current)) {
        if (seen.has(parent)) continue;
        seen.add(parent);
        distances.set(parent, distance);
        next.push(parent);
      }
    }
    frontier = next;
  }

  return distances;
}

const ORDINALS = [
  "zeroth", "first", "second", "third", "fourth", "fifth",
  "sixth", "seventh", "eighth", "ninth", "tenth",
];

function ordinal(n: number): string {
  return ORDINALS[n] ?? `${n}th`;
}

function greatPrefix(count: number): string {
  return "great-".repeat(Math.max(0, count));
}

/** distance: 1 = parent/child, 2 = grandparent/grandchild, 3 = great-, ... */
function linealLabel(distance: number, direction: "up" | "down"): string {
  const immediate = direction === "up" ? "parent" : "child";
  const grand = direction === "up" ? "grandparent" : "grandchild";
  if (distance === 1) return immediate;
  if (distance === 2) return grand;
  return greatPrefix(distance - 2) + grand;
}

/** Sibling of an ancestor `a` levels above `from` (the target sits 1 below the LCA). */
function auntUncleLabel(a: number): string {
  if (a === 2) return "aunt/uncle";
  if (a === 3) return "grand-aunt/uncle";
  return greatPrefix(a - 3) + "grand-aunt/uncle";
}

/** Child of a sibling, `b` levels below the LCA (the LCA is `from`'s parent). */
function nieceNephewLabel(b: number): string {
  if (b === 2) return "niece/nephew";
  if (b === 3) return "grand-niece/nephew";
  return greatPrefix(b - 3) + "grand-niece/nephew";
}

function cousinLabel(a: number, b: number): string {
  const degree = Math.min(a, b) - 1; // 1 => first cousin
  const removed = Math.abs(a - b);
  let label = `${ordinal(degree)} cousin`;
  if (removed === 1) label += " once removed";
  else if (removed === 2) label += " twice removed";
  else if (removed > 2) label += ` ${removed}x removed`;
  return label;
}

/**
 * `a` = steps from `from` up to the lowest common ancestor.
 * `b` = steps from `to` up to the lowest common ancestor.
 */
function collateralLabel(a: number, b: number): string {
  if (a === 1 && b === 1) return "sibling";
  if (b === 1) return auntUncleLabel(a); // target is above from's level
  if (a === 1) return nieceNephewLabel(b); // target is below from's level
  return cousinLabel(a, b);
}

/** Blood relationship only — no spouse / in-law handling. Returns null if unrelated. */
function bloodRelationship(
  graph: RelationGraph,
  fromId: string,
  toId: string,
): string | null {
  if (fromId === toId) return "self";

  const fromAncestors = ancestorDistances(graph, fromId);
  const toAncestors = ancestorDistances(graph, toId);

  // `to` is a direct ancestor of `from`.
  const upDistance = fromAncestors.get(toId);
  if (upDistance !== undefined) return linealLabel(upDistance, "up");

  // `to` is a direct descendant of `from`.
  const downDistance = toAncestors.get(fromId);
  if (downDistance !== undefined) return linealLabel(downDistance, "down");

  // Collateral: find the lowest common ancestor, minimising total distance and
  // then preferring the most balanced split.
  let best: { a: number; b: number } | null = null;
  for (const [ancestor, a] of fromAncestors) {
    const b = toAncestors.get(ancestor);
    if (b === undefined) continue;
    if (
      best === null ||
      a + b < best.a + best.b ||
      (a + b === best.a + best.b && Math.abs(a - b) < Math.abs(best.a - best.b))
    ) {
      best = { a, b };
    }
  }
  if (best) return collateralLabel(best.a, best.b);

  return null;
}

/**
 * Describe `toId` from `fromId`'s point of view: "child", "grandparent",
 * "sibling", "aunt/uncle", "first cousin once removed", "child-in-law",
 * "spouse", "self", or "unrelated".
 *
 * This is the pure form. The app calls the database-backed
 * `resolveRelationship(fromMemberId, toMemberId)` in ./index.ts.
 */
export function resolveRelationship(
  graph: RelationGraph,
  fromId: string,
  toId: string,
): string {
  if (fromId === toId) return "self";

  if (graph.spousesOf(fromId).includes(toId)) return "spouse";

  const blood = bloodRelationship(graph, fromId, toId);
  if (blood) return blood;

  // In-law: `to` is married to a blood relative of `from` ...
  for (const spouse of graph.spousesOf(toId)) {
    const relation = bloodRelationship(graph, fromId, spouse);
    if (relation && relation !== "self") return `${relation}-in-law`;
  }
  // ... or `to` is a blood relative of `from`'s spouse.
  for (const spouse of graph.spousesOf(fromId)) {
    const relation = bloodRelationship(graph, spouse, toId);
    if (relation && relation !== "self") return `${relation}-in-law`;
  }

  return "unrelated";
}
