/**
 * Pure layout for the family tree diagram. No rendering, no database — takes
 * members and lineage edges and returns a row (generation) and a horizontal
 * slot for each person, plus the connectors to draw between them.
 *
 * This is a simplified layered-graph layout (generation rows, barycenter-ish
 * ordering within a row) — not full crossing-minimization, which is more than
 * a family tree of a few dozen people needs.
 */
import { buildGraph, type Edge } from "../relationships/graph";

export interface TreeLayoutMember {
  id: string;
  /** Used to order siblings/spouses when no lineage position is known. */
  dateOfBirth: Date | null;
  name: string;
}

export interface TreeLayoutNode {
  id: string;
  generation: number;
  /** 0-based horizontal slot within its generation row. */
  order: number;
}

export interface TreeLayoutResult {
  nodes: TreeLayoutNode[];
  /** Number of generation rows (0 if there are no members). */
  rowCount: number;
  /** The widest row's slot count — for sizing a canvas. */
  maxRowWidth: number;
  /** child id -> parent ids (only parents also present in `members`). */
  parentsOf: Map<string, string[]>;
  /** Deduped spouse pairs where both members are present. */
  spousePairs: [string, string][];
}

function groupBySpouse(
  ids: string[],
  spousesOf: (id: string) => string[],
): string[][] {
  const idSet = new Set(ids);
  const seen = new Set<string>();
  const groups: string[][] = [];

  for (const id of ids) {
    if (seen.has(id)) continue;
    const group: string[] = [];
    const stack = [id];
    seen.add(id);
    while (stack.length > 0) {
      const current = stack.pop()!;
      group.push(current);
      for (const spouse of spousesOf(current)) {
        if (!idSet.has(spouse) || seen.has(spouse)) continue;
        seen.add(spouse);
        stack.push(spouse);
      }
    }
    groups.push(group);
  }
  return groups;
}

/** generation 0 = no recorded parents; otherwise 1 + the deepest parent. */
function computeGenerations(
  ids: string[],
  graph: ReturnType<typeof buildGraph>,
): Map<string, number> {
  const idSet = new Set(ids);
  const memo = new Map<string, number>();
  const visiting = new Set<string>();

  function gen(id: string): number {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // malformed cycle — don't recurse forever
    visiting.add(id);
    const parents = graph.parentsOf(id).filter((p) => idSet.has(p));
    const value = parents.length === 0 ? 0 : 1 + Math.max(...parents.map(gen));
    visiting.delete(id);
    memo.set(id, value);
    return value;
  }

  for (const id of ids) gen(id);

  // A person with no recorded parents who married into the family (e.g. a
  // spouse) defaults to generation 0. Pull them down to sit with their spouse
  // instead, so couples land on the same row.
  for (const group of groupBySpouse(ids, graph.spousesOf)) {
    const withLineage = group.filter(
      (id) => graph.parentsOf(id).filter((p) => idSet.has(p)).length > 0,
    );
    if (withLineage.length === 0) continue;
    const target = Math.max(...withLineage.map((id) => memo.get(id) ?? 0));
    for (const id of group) {
      if (!withLineage.includes(id)) memo.set(id, target);
    }
  }

  return memo;
}

export function computeFamilyTreeLayout(
  members: TreeLayoutMember[],
  edges: Edge[],
): TreeLayoutResult {
  const ids = members.map((m) => m.id);
  if (ids.length === 0) {
    return { nodes: [], rowCount: 0, maxRowWidth: 0, parentsOf: new Map(), spousePairs: [] };
  }

  const graph = buildGraph(edges);
  const idSet = new Set(ids);
  const byId = new Map(members.map((m) => [m.id, m]));
  const generations = computeGenerations(ids, graph);

  const parentsOf = new Map<string, string[]>();
  for (const id of ids) {
    parentsOf.set(
      id,
      graph.parentsOf(id).filter((p) => idSet.has(p)),
    );
  }

  const spousePairSet = new Set<string>();
  const spousePairs: [string, string][] = [];
  for (const id of ids) {
    for (const spouse of graph.spousesOf(id)) {
      if (!idSet.has(spouse)) continue;
      const key = [id, spouse].sort().join("|");
      if (spousePairSet.has(key)) continue;
      spousePairSet.add(key);
      spousePairs.push(id < spouse ? [id, spouse] : [spouse, id]);
    }
  }

  const rowCount = Math.max(...ids.map((id) => generations.get(id) ?? 0)) + 1;
  const rows: string[][] = Array.from({ length: rowCount }, () => []);
  for (const id of ids) rows[generations.get(id) ?? 0].push(id);

  const orderOf = new Map<string, number>();
  const birthKey = (id: string) => byId.get(id)?.dateOfBirth?.getTime() ?? Number.POSITIVE_INFINITY;
  const nameKey = (id: string) => byId.get(id)?.name ?? "";

  for (let g = 0; g < rowCount; g++) {
    const rowIds = rows[g];
    const spouseInRow = new Map<string, string>();
    for (const [a, b] of spousePairs) {
      if (rowIds.includes(a) && rowIds.includes(b)) {
        spouseInRow.set(a, b);
        spouseInRow.set(b, a);
      }
    }

    // Group into units: a couple (both present in this row) or a single person.
    const placed = new Set<string>();
    const units: string[][] = [];
    for (const id of rowIds) {
      if (placed.has(id)) continue;
      const spouse = spouseInRow.get(id);
      if (spouse && !placed.has(spouse)) {
        units.push([id, spouse].sort((a, b) => birthKey(a) - birthKey(b)));
        placed.add(id);
        placed.add(spouse);
      } else {
        units.push([id]);
        placed.add(id);
      }
    }

    // Sort units by the average horizontal position of their parents in the
    // row above (already assigned, since we process rows top-down) — this is
    // what keeps siblings and their descendants roughly together. Units with
    // no positioned parent fall back to birth date, then name.
    const parentAnchor = (unit: string[]): number => {
      const parentOrders = unit
        .flatMap((id) => parentsOf.get(id) ?? [])
        .map((p) => orderOf.get(p))
        .filter((o): o is number => o !== undefined);
      if (parentOrders.length === 0) return Number.POSITIVE_INFINITY;
      return parentOrders.reduce((a, b) => a + b, 0) / parentOrders.length;
    };

    units.sort((a, b) => {
      const pa = parentAnchor(a);
      const pb = parentAnchor(b);
      if (pa !== pb) return pa - pb;
      const ba = Math.min(...a.map(birthKey));
      const bb = Math.min(...b.map(birthKey));
      if (ba !== bb) return ba - bb;
      return nameKey(a[0]).localeCompare(nameKey(b[0]));
    });

    let slot = 0;
    for (const unit of units) {
      for (const id of unit) {
        orderOf.set(id, slot);
        slot += 1;
      }
    }
  }

  const nodes: TreeLayoutNode[] = ids.map((id) => ({
    id,
    generation: generations.get(id) ?? 0,
    order: orderOf.get(id) ?? 0,
  }));

  const maxRowWidth = Math.max(...rows.map((r) => r.length));

  return { nodes, rowCount, maxRowWidth, parentsOf, spousePairs };
}
