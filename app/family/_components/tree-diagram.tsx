import Link from "next/link";
import { computeFamilyTreeLayout, type TreeLayoutMember } from "@/lib/family-tree/layout";

export interface TreeDiagramMember {
  id: string;
  name: string;
  dateOfBirth: Date | null;
  lifespan: string | null;
  isFocus: boolean;
  isYou: boolean;
  isSteward: boolean;
  hasLogin: boolean;
  departed: boolean;
}

export interface TreeDiagramRelationship {
  fromMemberId: string;
  toMemberId: string;
  type: "PARENT_OF" | "SPOUSE_OF" | "SIBLING_OF";
  parentKind: "BIOLOGICAL" | "ADOPTIVE" | "STEP" | "GUARDIAN" | null;
  endedAt: Date | null;
}

const NODE_W = 176;
const NODE_H = 72;
const COL_GAP = 32;
const ROW_GAP = 92;
const PAD = 28;

/** Stroke treatment per parent-child edge kind — brand guidelines §10 (adoption/step). */
function lineStyleFor(kind: TreeDiagramRelationship["parentKind"]): {
  dasharray?: string;
  opacity: number;
} {
  switch (kind) {
    case "STEP":
      return { dasharray: "6 5", opacity: 0.85 };
    case "GUARDIAN":
      return { dasharray: "1.5 5", opacity: 0.6 };
    default: // BIOLOGICAL, ADOPTIVE, or unset (read as biological)
      return { opacity: 1 };
  }
}

/**
 * A quiet, generation-by-generation rendering of the family tree, styled per
 * the Wisdom Well brand system: soft curves (echoing the well's oval rim),
 * Water/Mist connectors, and restrained node cards rather than a technical
 * org-chart look. Every node is a real link to `?focus=<id>`, so exploring the
 * tree here and reading the "Seen from …" panel below are the same action.
 */
export function FamilyTreeDiagram({
  members,
  relationships,
}: {
  members: TreeDiagramMember[];
  relationships: TreeDiagramRelationship[];
}) {
  const layoutMembers: TreeLayoutMember[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    dateOfBirth: m.dateOfBirth,
  }));
  const layout = computeFamilyTreeLayout(layoutMembers, relationships);

  if (layout.nodes.length === 0) {
    return (
      <p className="text-ink-soft">
        Add a second person and a relationship below to see the tree.
      </p>
    );
  }

  const memberById = new Map(members.map((m) => [m.id, m]));
  const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));

  const rows: { id: string; order: number }[][] = Array.from(
    { length: layout.rowCount },
    () => [],
  );
  for (const n of layout.nodes) rows[n.generation].push(n);

  const contentWidth = layout.maxRowWidth * (NODE_W + COL_GAP) - COL_GAP;
  const canvasWidth = contentWidth + PAD * 2;
  const canvasHeight = layout.rowCount * NODE_H + (layout.rowCount - 1) * ROW_GAP + PAD * 2;

  const rowTop = (g: number) => PAD + g * (NODE_H + ROW_GAP);
  const rowLeftOffset = (g: number) => (contentWidth - rows[g].length * (NODE_W + COL_GAP) + COL_GAP) / 2;

  const centerOf = (id: string) => {
    const n = nodeById.get(id);
    if (!n) return null;
    const x = PAD + rowLeftOffset(n.generation) + n.order * (NODE_W + COL_GAP) + NODE_W / 2;
    const y = rowTop(n.generation) + NODE_H / 2;
    return { x, y, top: rowTop(n.generation), bottom: rowTop(n.generation) + NODE_H };
  };

  const parentEdges = relationships.filter(
    (r) => r.type === "PARENT_OF" && nodeById.has(r.fromMemberId) && nodeById.has(r.toMemberId),
  );

  return (
    <div className="overflow-x-auto rounded-card border border-mist bg-white p-2">
      <div
        className="relative"
        style={{ width: canvasWidth, height: canvasHeight, minWidth: "100%" }}
      >
        <svg
          aria-hidden="true"
          width={canvasWidth}
          height={canvasHeight}
          className="absolute left-0 top-0"
        >
          {parentEdges.map((edge) => {
            const parent = centerOf(edge.fromMemberId);
            const child = centerOf(edge.toMemberId);
            if (!parent || !child) return null;
            const midY = (parent.bottom + child.top) / 2;
            const style = lineStyleFor(edge.parentKind);
            return (
              <path
                key={`${edge.fromMemberId}-${edge.toMemberId}`}
                d={`M ${parent.x} ${parent.bottom} C ${parent.x} ${midY}, ${child.x} ${midY}, ${child.x} ${child.top}`}
                fill="none"
                stroke="var(--color-water)"
                strokeWidth={2}
                strokeDasharray={style.dasharray}
                opacity={style.opacity}
              />
            );
          })}
          {layout.spousePairs.map(([a, b]) => {
            const ca = centerOf(a);
            const cb = centerOf(b);
            if (!ca || !cb || ca.y !== cb.y) return null;
            const [left, right] = ca.x < cb.x ? [ca, cb] : [cb, ca];
            return (
              <line
                key={`${a}-${b}`}
                x1={left.x + NODE_W / 2}
                y1={left.y}
                x2={right.x - NODE_W / 2}
                y2={right.y}
                stroke="var(--color-mist)"
                strokeWidth={3}
              />
            );
          })}
        </svg>

        {layout.nodes.map((n) => {
          const m = memberById.get(n.id);
          if (!m) return null;
          const c = centerOf(n.id);
          if (!c) return null;
          return (
            <Link
              key={n.id}
              href={`/family?focus=${n.id}`}
              aria-current={m.isFocus ? "true" : undefined}
              className={`absolute flex flex-col justify-center rounded-[14px] border px-3 py-2 text-left no-underline transition-colors ${
                m.isFocus
                  ? "border-well bg-water/40"
                  : "border-mist bg-ivory hover:border-water hover:bg-white"
              } ${m.departed ? "opacity-55" : ""}`}
              style={{
                left: c.x - NODE_W / 2,
                top: c.top,
                width: NODE_W,
                height: NODE_H,
              }}
            >
              <span className="truncate text-sm font-semibold text-ink">{m.name}</span>
              <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-ink-soft">
                {m.lifespan ?? "—"}
                {m.isYou ? <span className="text-accent">· you</span> : null}
                {m.isSteward ? <span>· steward</span> : null}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
