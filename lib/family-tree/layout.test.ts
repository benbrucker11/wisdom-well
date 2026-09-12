import { describe, expect, it } from "vitest";
import type { Edge } from "../relationships/graph";
import { computeFamilyTreeLayout, type TreeLayoutMember } from "./layout";

const parent = (from: string, to: string): Edge => ({
  fromMemberId: from,
  toMemberId: to,
  type: "PARENT_OF",
});
const married = (a: string, b: string): Edge => ({
  fromMemberId: a,
  toMemberId: b,
  type: "SPOUSE_OF",
});

const mem = (id: string, dob?: string): TreeLayoutMember => ({
  id,
  name: id,
  dateOfBirth: dob ? new Date(dob) : null,
});

describe("computeFamilyTreeLayout", () => {
  it("returns nothing for an empty family", () => {
    const result = computeFamilyTreeLayout([], []);
    expect(result).toEqual({
      nodes: [],
      rowCount: 0,
      maxRowWidth: 0,
      parentsOf: new Map(),
      spousePairs: [],
    });
  });

  /*
   *   gp1 == gp2
   *      |
   *    dad == mom          (mom married in, no recorded parents)
   *      |
   *   ┌──┴──┐
   *  kid1  kid2
   */
  const members = [
    mem("gp1", "1945-01-01"),
    mem("gp2", "1946-01-01"),
    mem("dad", "1972-01-01"),
    mem("mom", "1974-01-01"),
    mem("kid1", "2005-01-01"),
    mem("kid2", "2008-01-01"),
  ];
  const edges: Edge[] = [
    married("gp1", "gp2"),
    parent("gp1", "dad"),
    parent("gp2", "dad"),
    married("dad", "mom"),
    parent("dad", "kid1"),
    parent("mom", "kid1"),
    parent("dad", "kid2"),
    parent("mom", "kid2"),
  ];

  const result = computeFamilyTreeLayout(members, edges);
  const genOf = (id: string) => result.nodes.find((n) => n.id === id)?.generation;
  const orderOf = (id: string) => result.nodes.find((n) => n.id === id)?.order;

  it("assigns generation 0 to the rootmost couple", () => {
    expect(genOf("gp1")).toBe(0);
    expect(genOf("gp2")).toBe(0);
  });

  it("pulls a married-in spouse down to sit with their partner", () => {
    // mom has no recorded parents, but should land on dad's row, not row 0.
    expect(genOf("mom")).toBe(1);
    expect(genOf("dad")).toBe(1);
  });

  it("puts grandchildren two rows below the grandparents", () => {
    expect(genOf("kid1")).toBe(2);
    expect(genOf("kid2")).toBe(2);
  });

  it("has three generation rows", () => {
    expect(result.rowCount).toBe(3);
  });

  it("seats spouses in adjacent slots", () => {
    expect(Math.abs(orderOf("gp1")! - orderOf("gp2")!)).toBe(1);
    expect(Math.abs(orderOf("dad")! - orderOf("mom")!)).toBe(1);
  });

  it("orders children by birth date under their parents", () => {
    expect(orderOf("kid1")).toBeLessThan(orderOf("kid2")!);
  });

  it("records both parents for a child", () => {
    expect(new Set(result.parentsOf.get("kid1"))).toEqual(new Set(["dad", "mom"]));
  });

  it("dedupes spouse pairs regardless of which side the edge was stored on", () => {
    expect(result.spousePairs).toHaveLength(2);
    expect(result.spousePairs).toContainEqual(["dad", "mom"]);
    expect(result.spousePairs).toContainEqual(["gp1", "gp2"]);
  });

  it("is safe against malformed cyclic data", () => {
    const cyclic = [mem("a"), mem("b"), mem("c")];
    const cyclicEdges: Edge[] = [parent("a", "b"), parent("b", "c"), parent("c", "a")];
    expect(() => computeFamilyTreeLayout(cyclic, cyclicEdges)).not.toThrow();
  });

  it("only counts parents who are actually in the member set", () => {
    // A parent that exists in the edges but wasn't passed in `members` (e.g. a
    // departed/filtered member) must not be reported as a lineage parent.
    const partial = computeFamilyTreeLayout(
      [mem("dad", "1972-01-01"), mem("kid1", "2005-01-01")],
      [parent("dad", "kid1"), parent("mom", "kid1")],
    );
    expect(partial.parentsOf.get("kid1")).toEqual(["dad"]);
  });
});
