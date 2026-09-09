import { describe, expect, it } from "vitest";
import { buildGraph, getDescendants, resolveRelationship, type Edge } from "./graph";

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

/*
 * A five-generation family (spec §9 asks for at least three):
 *
 *   stan ═══ helena
 *          │
 *       andrzej ═══ maria
 *          │
 *     ┌────┴─────┐
 *   kasia ═ tomek   piotr ═ ola
 *     │                │
 *  ┌──┴──┐           zofia
 * lena   jan           │
 *                     adam
 */
const edges: Edge[] = [
  married("stan", "helena"),
  parent("stan", "andrzej"),
  parent("helena", "andrzej"),
  married("andrzej", "maria"),
  parent("andrzej", "kasia"),
  parent("maria", "kasia"),
  parent("andrzej", "piotr"),
  parent("maria", "piotr"),
  married("kasia", "tomek"),
  parent("kasia", "lena"),
  parent("tomek", "lena"),
  parent("kasia", "jan"),
  parent("tomek", "jan"),
  married("piotr", "ola"),
  parent("piotr", "zofia"),
  parent("ola", "zofia"),
  parent("zofia", "adam"),
];

const g = buildGraph(edges);
const ids = (list: { memberId: string }[]) => list.map((d) => d.memberId).sort();

describe("getDescendants", () => {
  it("returns children and grandchildren within the generation limit", () => {
    const d = getDescendants(g, "stan", 2);
    expect(ids(d)).toEqual(["andrzej", "kasia", "piotr"]);
    expect(d.find((x) => x.memberId === "andrzej")?.generation).toBe(1);
    expect(d.find((x) => x.memberId === "kasia")?.generation).toBe(2);
    expect(d.find((x) => x.memberId === "piotr")?.generation).toBe(2);
  });

  it("answers 'who are stan's grandchildren?'", () => {
    const grandchildren = getDescendants(g, "stan", 2)
      .filter((d) => d.generation === 2)
      .map((d) => d.memberId)
      .sort();
    expect(grandchildren).toEqual(["kasia", "piotr"]);
  });

  it("reaches great-grandchildren at generation 3", () => {
    const gen3 = getDescendants(g, "stan", 3).filter((d) => d.generation === 3);
    expect(ids(gen3)).toEqual(["jan", "lena", "zofia"]);
  });

  it("reaches great-great-grandchildren at generation 4", () => {
    const d = getDescendants(g, "stan", 4);
    expect(d.find((x) => x.memberId === "adam")?.generation).toBe(4);
  });

  it("returns nothing for generation 0", () => {
    expect(getDescendants(g, "stan", 0)).toEqual([]);
  });

  it("does not walk past a leaf", () => {
    expect(getDescendants(g, "lena", 5)).toEqual([]);
  });

  it("is safe against cyclic data", () => {
    const cyclic = buildGraph([
      parent("a", "b"),
      parent("b", "c"),
      parent("c", "a"),
    ]);
    expect(() => getDescendants(cyclic, "a", 10)).not.toThrow();
    expect(ids(getDescendants(cyclic, "a", 10))).toEqual(["b", "c"]);
  });
});

describe("resolveRelationship", () => {
  it("identifies self", () => {
    expect(resolveRelationship(g, "kasia", "kasia")).toBe("self");
  });

  it("identifies spouses, both directions", () => {
    expect(resolveRelationship(g, "stan", "helena")).toBe("spouse");
    expect(resolveRelationship(g, "helena", "stan")).toBe("spouse");
  });

  it("identifies parent and child", () => {
    expect(resolveRelationship(g, "kasia", "andrzej")).toBe("parent");
    expect(resolveRelationship(g, "andrzej", "kasia")).toBe("child");
  });

  it("identifies grandparent and grandchild", () => {
    expect(resolveRelationship(g, "lena", "andrzej")).toBe("grandparent");
    expect(resolveRelationship(g, "andrzej", "lena")).toBe("grandchild");
  });

  it("identifies great-grandparent and great-grandchild", () => {
    expect(resolveRelationship(g, "lena", "stan")).toBe("great-grandparent");
    expect(resolveRelationship(g, "stan", "lena")).toBe("great-grandchild");
  });

  it("identifies great-great-grandchild", () => {
    expect(resolveRelationship(g, "stan", "adam")).toBe("great-great-grandchild");
  });

  it("identifies siblings from shared parents", () => {
    expect(resolveRelationship(g, "kasia", "piotr")).toBe("sibling");
    expect(resolveRelationship(g, "lena", "jan")).toBe("sibling");
  });

  it("identifies aunt/uncle and niece/nephew", () => {
    expect(resolveRelationship(g, "lena", "piotr")).toBe("aunt/uncle");
    expect(resolveRelationship(g, "piotr", "lena")).toBe("niece/nephew");
  });

  it("identifies grand-aunt/uncle and grand-niece/nephew", () => {
    expect(resolveRelationship(g, "adam", "kasia")).toBe("grand-aunt/uncle");
    expect(resolveRelationship(g, "kasia", "adam")).toBe("grand-niece/nephew");
  });

  it("identifies first cousins", () => {
    expect(resolveRelationship(g, "lena", "zofia")).toBe("first cousin");
    expect(resolveRelationship(g, "zofia", "jan")).toBe("first cousin");
  });

  it("identifies a first cousin once removed", () => {
    expect(resolveRelationship(g, "lena", "adam")).toBe("first cousin once removed");
  });

  it("identifies in-laws", () => {
    expect(resolveRelationship(g, "andrzej", "tomek")).toBe("child-in-law");
    expect(resolveRelationship(g, "tomek", "andrzej")).toBe("parent-in-law");
    expect(resolveRelationship(g, "kasia", "ola")).toBe("sibling-in-law");
  });

  it("reports unrelated members", () => {
    const disjoint = buildGraph([parent("x", "y"), parent("m", "n")]);
    expect(resolveRelationship(disjoint, "y", "n")).toBe("unrelated");
  });

  it("prefers the closest relationship when several paths exist", () => {
    // andrzej is both a direct grandparent of lena AND (via the collateral
    // walk) could look like something more distant — lineal wins.
    expect(resolveRelationship(g, "andrzej", "lena")).toBe("grandchild");
  });
});

describe("parent kinds (spec §10)", () => {
  const kin = (
    from: string,
    to: string,
    parentKind: "BIOLOGICAL" | "ADOPTIVE" | "STEP" | "GUARDIAN",
  ): Edge => ({ fromMemberId: from, toMemberId: to, type: "PARENT_OF", parentKind });

  const edges: Edge[] = [
    kin("gp", "parent", "BIOLOGICAL"),
    kin("parent", "bio", "BIOLOGICAL"),
    kin("parent", "adopted", "ADOPTIVE"),
    kin("parent", "step", "STEP"),
    kin("parent", "ward", "GUARDIAN"),
  ];

  it("counts biological and adoptive children as lineage, always", () => {
    const g = buildGraph(edges);
    expect(getDescendants(g, "gp", 2).map((d) => d.memberId).sort()).toEqual([
      "adopted",
      "bio",
      "parent",
      "step",
    ]);
  });

  it("drops step children when includeStep is false", () => {
    const g = buildGraph(edges, { includeStep: false });
    expect(getDescendants(g, "gp", 2).map((d) => d.memberId).sort()).toEqual([
      "adopted",
      "bio",
      "parent",
    ]);
  });

  it("never follows guardian edges for lineage", () => {
    expect(
      getDescendants(buildGraph(edges), "gp", 5).map((d) => d.memberId),
    ).not.toContain("ward");
  });

  it("an absent parentKind reads as biological", () => {
    const g = buildGraph([{ fromMemberId: "a", toMemberId: "b", type: "PARENT_OF" }]);
    expect(getDescendants(g, "a", 1).map((d) => d.memberId)).toEqual(["b"]);
  });
});

describe("ended marriages", () => {
  it("a divorced spouse is no longer a 'spouse' and their kin are no longer in-laws", () => {
    const g = buildGraph([
      {
        fromMemberId: "a",
        toMemberId: "b",
        type: "SPOUSE_OF",
        endedAt: new Date("2020-01-01"),
      },
      { fromMemberId: "bparent", toMemberId: "b", type: "PARENT_OF" },
    ]);
    expect(resolveRelationship(g, "a", "b")).toBe("unrelated");
    expect(resolveRelationship(g, "a", "bparent")).toBe("unrelated");
  });
});
