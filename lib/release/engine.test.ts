import { describe, expect, it } from "vitest";
import type { Edge } from "../relationships/graph";
import {
  ageInYears,
  evaluateReleases,
  unrunnableRules,
  type EngineConfirmation,
  type EngineEntry,
  type EngineInput,
  type EngineMember,
  type EngineRule,
} from "./engine";

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

const NOW = new Date("2026-01-01T00:00:00Z");

/*
 *   gp                       <- author of the entries under test
 *   │
 *   dad ═══ mom
 *   │
 *  ┌┴───┐
 * sarah  son
 */
function baseMembers(): EngineMember[] {
  return [
    { id: "gp", dateOfBirth: new Date("1945-03-02"), dateOfDeath: null, status: "ACTIVE" },
    { id: "dad", dateOfBirth: new Date("1972-08-10"), dateOfDeath: null, status: "ACTIVE" },
    { id: "mom", dateOfBirth: new Date("1974-01-05"), dateOfDeath: null, status: "ACTIVE" },
    { id: "sarah", dateOfBirth: new Date("2010-06-01"), dateOfDeath: null, status: "ACTIVE" }, // 15 on NOW
    { id: "son", dateOfBirth: new Date("2005-01-01"), dateOfDeath: null, status: "ACTIVE" }, // 21 on NOW
  ];
}
const baseEdges: Edge[] = [
  parent("gp", "dad"),
  married("dad", "mom"),
  parent("dad", "sarah"),
  parent("mom", "sarah"),
  parent("dad", "son"),
  parent("mom", "son"),
];

function makeInput(over: Partial<EngineInput> & { rules: EngineRule[] }): EngineInput {
  const entries: EngineEntry[] =
    over.entries ??
    [...new Set(over.rules.map((r) => r.entryId))].map((id) => ({
      id,
      authorMemberId: "gp",
      status: "SCHEDULED" as const,
    }));

  return {
    members: over.members ?? baseMembers(),
    edges: over.edges ?? baseEdges,
    entries,
    rules: over.rules,
    confirmations: over.confirmations ?? [],
    existingReleases: over.existingReleases ?? [],
    now: over.now ?? NOW,
  };
}

const rule = (r: Partial<EngineRule> & { id: string; entryId: string }): EngineRule => ({
  targetType: "IMMEDIATE",
  targetMemberId: null,
  targetRole: null,
  triggerType: "NONE",
  triggerAge: null,
  triggerDate: null,
  triggerEvent: null,
  includeStepDescendants: true,
  ...r,
});

const mem = (
  id: string,
  over: Partial<EngineMember> = {},
): EngineMember => ({
  id,
  dateOfBirth: new Date("2005-01-01"),
  dateOfDeath: null,
  status: "ACTIVE",
  ...over,
});

const recipients = (input: EngineInput) =>
  evaluateReleases(input)
    .map((r) => r.recipientMemberId)
    .sort();

describe("ageInYears", () => {
  it("counts whole years, not yet past the birthday", () => {
    expect(ageInYears(new Date("2010-06-01"), new Date("2026-01-01"))).toBe(15);
    expect(ageInYears(new Date("2010-06-01"), new Date("2028-05-31"))).toBe(17);
    expect(ageInYears(new Date("2010-06-01"), new Date("2028-06-01"))).toBe(18);
  });
});

describe("the six rule shapes (spec §3)", () => {
  it("1. IMMEDIATE + NONE — everyone, now", () => {
    const input = makeInput({ rules: [rule({ id: "r", entryId: "e", targetType: "IMMEDIATE" })] });
    expect(recipients(input)).toEqual(["dad", "gp", "mom", "sarah", "son"]);
  });

  it("2. SPECIFIC_MEMBER + AGE — for Sarah at 18", () => {
    const r = rule({
      id: "r",
      entryId: "e",
      targetType: "SPECIFIC_MEMBER",
      targetMemberId: "sarah",
      triggerType: "AGE",
      triggerAge: 18,
    });
    expect(recipients(makeInput({ rules: [r] }))).toEqual([]); // Sarah is 15 on NOW
    expect(
      recipients(makeInput({ rules: [r], now: new Date("2028-07-01") })),
    ).toEqual(["sarah"]);
  });

  it("3. ROLE(GRANDCHILD) + AGE — for any grandchild when they turn 18", () => {
    const r = rule({
      id: "r",
      entryId: "e",
      targetType: "ROLE",
      targetRole: "GRANDCHILD",
      triggerType: "AGE",
      triggerAge: 18,
    });
    // grandchildren of gp are sarah (15) and son (21) -> only son qualifies now
    expect(recipients(makeInput({ rules: [r] }))).toEqual(["son"]);
    expect(
      recipients(makeInput({ rules: [r], now: new Date("2028-07-01") })),
    ).toEqual(["sarah", "son"]);
  });

  it("4. ROLE(ALL_FAMILY) + DATE — the whole family on a date", () => {
    const r = rule({
      id: "r",
      entryId: "e",
      targetType: "ROLE",
      targetRole: "ALL_FAMILY",
      triggerType: "DATE",
      triggerDate: new Date("2040-01-01"),
    });
    expect(recipients(makeInput({ rules: [r] }))).toEqual([]);
    expect(
      recipients(makeInput({ rules: [r], now: new Date("2040-02-01") })),
    ).toEqual(["dad", "gp", "mom", "sarah", "son"]);
  });

  it("5. SPECIFIC_MEMBER + EVENT — for my son when he marries", () => {
    const r = rule({
      id: "r",
      entryId: "e",
      targetType: "SPECIFIC_MEMBER",
      targetMemberId: "son",
      triggerType: "EVENT",
      triggerEvent: "MARRIAGE",
    });
    expect(recipients(makeInput({ rules: [r] }))).toEqual([]);

    const confirmed: EngineConfirmation[] = [{ ruleId: "r", subjectMemberId: "son" }];
    expect(recipients(makeInput({ rules: [r], confirmations: confirmed }))).toEqual([
      "son",
    ]);
  });

  it("6. ROLE(ANY_DESCENDANT) + NONE — every descendant, forever", () => {
    const r = rule({
      id: "r",
      entryId: "e",
      targetType: "ROLE",
      targetRole: "ANY_DESCENDANT",
    });
    // descendants of gp: dad, sarah, son (not gp, not mom who married in)
    expect(recipients(makeInput({ rules: [r] }))).toEqual(["dad", "sarah", "son"]);
  });
});

describe("role rules and recipients who did not exist when the rule was written", () => {
  it("fires for a grandchild added years later (spec §4 explicit test)", () => {
    const r = rule({
      id: "r",
      entryId: "e",
      targetType: "ROLE",
      targetRole: "GRANDCHILD",
      triggerType: "AGE",
      triggerAge: 18,
    });

    // The rule is written when gp has one child and one grandchild, aged 15.
    const before = makeInput({
      rules: [r],
      members: [
        { id: "gp", dateOfBirth: new Date("1945-03-02"), dateOfDeath: null, status: "ACTIVE" },
        { id: "dad", dateOfBirth: new Date("1972-08-10"), dateOfDeath: null, status: "ACTIVE" },
        { id: "sarah", dateOfBirth: new Date("2010-06-01"), dateOfDeath: null, status: "ACTIVE" },
      ],
      edges: [parent("gp", "dad"), parent("dad", "sarah")],
    });
    expect(evaluateReleases(before)).toEqual([]);

    // Later, a new grandchild is added to the tree with a DOB making them 18.
    const after = makeInput({
      rules: [r],
      members: [
        { id: "gp", dateOfBirth: new Date("1945-03-02"), dateOfDeath: null, status: "ACTIVE" },
        { id: "dad", dateOfBirth: new Date("1972-08-10"), dateOfDeath: null, status: "ACTIVE" },
        { id: "sarah", dateOfBirth: new Date("2010-06-01"), dateOfDeath: null, status: "ACTIVE" },
        { id: "newgrandchild", dateOfBirth: new Date("2005-05-05"), dateOfDeath: null, status: "ACTIVE" },
      ],
      edges: [
        parent("gp", "dad"),
        parent("dad", "sarah"),
        parent("dad", "newgrandchild"),
      ],
    });

    const fired = evaluateReleases(after);
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({
      entryId: "e",
      ruleId: "r",
      recipientMemberId: "newgrandchild",
    });
  });
});

describe("age triggers require a date of birth", () => {
  const noDob: EngineMember[] = [
    { id: "gp", dateOfBirth: new Date("1945-03-02"), dateOfDeath: null, status: "ACTIVE" },
    { id: "kid", dateOfBirth: null, dateOfDeath: null, status: "ACTIVE" },
  ];
  const r = rule({
    id: "r",
    entryId: "e",
    targetType: "SPECIFIC_MEMBER",
    targetMemberId: "kid",
    triggerType: "AGE",
    triggerAge: 18,
  });

  it("does not fire and does not throw", () => {
    const input = makeInput({ rules: [r], members: noDob, edges: [] });
    expect(evaluateReleases(input)).toEqual([]);
  });

  it("is surfaced by unrunnableRules", () => {
    const flagged = unrunnableRules({
      members: noDob,
      entries: [{ id: "e", authorMemberId: "gp", status: "SCHEDULED" }],
      rules: [r],
    });
    expect(flagged).toHaveLength(1);
    expect(flagged[0].ruleId).toBe("r");
  });
});

describe("DEATH_OF_AUTHOR", () => {
  const r = rule({
    id: "r",
    entryId: "e",
    targetType: "ROLE",
    targetRole: "ALL_FAMILY",
    triggerType: "EVENT",
    triggerEvent: "DEATH_OF_AUTHOR",
  });

  it("waits until the author's date of death is set", () => {
    expect(recipients(makeInput({ rules: [r] }))).toEqual([]);

    const members = baseMembers().map((m) =>
      m.id === "gp" ? { ...m, dateOfDeath: new Date("2026-01-01") } : m,
    );
    expect(recipients(makeInput({ rules: [r], members }))).toEqual([
      "dad",
      "gp",
      "mom",
      "sarah",
      "son",
    ]);
  });
});

describe("releases are irreversible and idempotent", () => {
  it("never re-emits an existing release", () => {
    const r = rule({ id: "r", entryId: "e", targetType: "IMMEDIATE" });
    const first = evaluateReleases(makeInput({ rules: [r] }));
    expect(first).toHaveLength(5);

    const second = evaluateReleases(
      makeInput({
        rules: [r],
        existingReleases: first.map((x) => ({
          entryId: x.entryId,
          recipientMemberId: x.recipientMemberId,
        })),
      }),
    );
    expect(second).toEqual([]);
  });

  it("keeps a recipient even if their data later stops matching", () => {
    const r = rule({
      id: "r",
      entryId: "e",
      targetType: "SPECIFIC_MEMBER",
      targetMemberId: "son",
      triggerType: "AGE",
      triggerAge: 18,
    });
    // son already has a release; now imagine his DOB was cleared by mistake.
    const members = baseMembers().map((m) =>
      m.id === "son" ? { ...m, dateOfBirth: null } : m,
    );
    const result = evaluateReleases(
      makeInput({
        rules: [r],
        members,
        existingReleases: [{ entryId: "e", recipientMemberId: "son" }],
      }),
    );
    // Nothing new to emit, and crucially nothing is removed — the engine only
    // ever adds rows.
    expect(result).toEqual([]);
  });
});

describe("one entry, many rules", () => {
  it("releases to a person at most once", () => {
    const rules = [
      rule({ id: "r1", entryId: "e", targetType: "IMMEDIATE" }),
      rule({
        id: "r2",
        entryId: "e",
        targetType: "SPECIFIC_MEMBER",
        targetMemberId: "sarah",
      }),
    ];
    const fired = evaluateReleases(makeInput({ rules }));
    const forSarah = fired.filter((f) => f.recipientMemberId === "sarah");
    expect(forSarah).toHaveLength(1);
    expect(forSarah[0].ruleId).toBe("r1"); // first rule wins the row
  });
});

describe("DRAFT entries are never passed to the engine", () => {
  it("only evaluates SCHEDULED/RELEASED entries the caller provides", () => {
    // The engine trusts its input: callers must exclude DRAFTs. This test
    // documents that contract — an empty entries list yields nothing.
    const input = makeInput({
      rules: [rule({ id: "r", entryId: "e", targetType: "IMMEDIATE" })],
      entries: [],
    });
    expect(evaluateReleases(input)).toEqual([]);
  });
});

describe("adoption and step-relationships (spec §10)", () => {
  const kinEdge = (
    from: string,
    to: string,
    parentKind: "BIOLOGICAL" | "ADOPTIVE" | "STEP" | "GUARDIAN",
  ): Edge => ({ fromMemberId: from, toMemberId: to, type: "PARENT_OF", parentKind });

  //   gp
  //   ├── dad ── adoptedKid (ADOPTIVE)
  //   └── aunt ── stepKid (STEP), ward (GUARDIAN)
  const members = [
    mem("gp", { dateOfBirth: new Date("1945-01-01") }),
    mem("dad", { dateOfBirth: new Date("1972-01-01") }),
    mem("aunt", { dateOfBirth: new Date("1975-01-01") }),
    mem("adoptedKid", { dateOfBirth: new Date("2000-01-01") }),
    mem("stepKid", { dateOfBirth: new Date("2001-01-01") }),
    mem("ward", { dateOfBirth: new Date("2002-01-01") }),
  ];
  const edges: Edge[] = [
    kinEdge("gp", "dad", "BIOLOGICAL"),
    kinEdge("gp", "aunt", "BIOLOGICAL"),
    kinEdge("dad", "adoptedKid", "ADOPTIVE"),
    kinEdge("aunt", "stepKid", "STEP"),
    kinEdge("aunt", "ward", "GUARDIAN"),
  ];

  it("an adopted grandchild is a grandchild", () => {
    const r = rule({
      id: "r",
      entryId: "e",
      targetType: "ROLE",
      targetRole: "GRANDCHILD",
    });
    expect(recipients(makeInput({ rules: [r], members, edges }))).toEqual([
      "adoptedKid",
      "stepKid",
    ]);
  });

  it("a step-grandchild is excluded when the rule opts out", () => {
    const r = rule({
      id: "r",
      entryId: "e",
      targetType: "ROLE",
      targetRole: "GRANDCHILD",
      includeStepDescendants: false,
    });
    expect(recipients(makeInput({ rules: [r], members, edges }))).toEqual([
      "adoptedKid",
    ]);
  });

  it("a guardian's ward is never counted as a descendant", () => {
    const r = rule({
      id: "r",
      entryId: "e",
      targetType: "ROLE",
      targetRole: "ANY_DESCENDANT",
    });
    const got = recipients(makeInput({ rules: [r], members, edges }));
    expect(got).not.toContain("ward");
    expect(got).toEqual(["adoptedKid", "aunt", "dad", "stepKid"]);
  });
});

describe("departed members (spec §10, family splits)", () => {
  it("drop out of ROLE / IMMEDIATE / ALL_FAMILY targeting", () => {
    const members = baseMembers().map((m) =>
      m.id === "sarah" ? { ...m, status: "DEPARTED" as const } : m,
    );
    const immediate = rule({ id: "r", entryId: "e", targetType: "IMMEDIATE" });
    expect(recipients(makeInput({ rules: [immediate], members }))).toEqual([
      "dad",
      "gp",
      "mom",
      "son",
    ]);

    const anyDesc = rule({
      id: "r2",
      entryId: "e2",
      targetType: "ROLE",
      targetRole: "ANY_DESCENDANT",
    });
    expect(recipients(makeInput({ rules: [anyDesc], members }))).toEqual([
      "dad",
      "son",
    ]);
  });

  it("can still be reached by an explicit SPECIFIC_MEMBER rule", () => {
    const members = baseMembers().map((m) =>
      m.id === "sarah" ? { ...m, status: "DEPARTED" as const } : m,
    );
    const r = rule({
      id: "r",
      entryId: "e",
      targetType: "SPECIFIC_MEMBER",
      targetMemberId: "sarah",
    });
    expect(recipients(makeInput({ rules: [r], members }))).toEqual(["sarah"]);
  });
});

describe("divorce (spec §10)", () => {
  it("an ended marriage does not change lineage", () => {
    const edges: Edge[] = [
      { fromMemberId: "dad", toMemberId: "mom", type: "SPOUSE_OF", endedAt: new Date("2020-01-01") },
      { fromMemberId: "dad", toMemberId: "son", type: "PARENT_OF" },
      { fromMemberId: "mom", toMemberId: "son", type: "PARENT_OF" },
    ];
    const members = [mem("dad"), mem("mom"), mem("son")];
    const r = rule({
      id: "r",
      entryId: "e",
      targetType: "ROLE",
      targetRole: "CHILD",
    });
    // author is dad; son is still dad's child regardless of the divorce
    const input = makeInput({ rules: [r], members, edges });
    input.entries[0].authorMemberId = "dad";
    expect(recipients(input)).toEqual(["son"]);
  });
});
