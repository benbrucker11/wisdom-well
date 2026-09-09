/**
 * Phase 2 end-to-end check against a real Postgres.
 *
 * Spins up a throwaway embedded Postgres, pushes the Prisma schema, and drives
 * the actual database-backed release engine and `visibleEntriesFor` through
 * every rule shape in spec §3 plus the unborn-grandchild and
 * hidden-until-release scenarios from the Phase 2 "done when".
 *
 *   npm run e2e
 *
 * This is a scripted integration check, not part of `npm test` (which stays
 * pure and DB-free). Requires the optional `embedded-postgres` dev dependency.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import EmbeddedPostgres from "embedded-postgres";

type RuleSeed = Omit<Prisma.ReleaseRuleUncheckedCreateInput, "id" | "entryId">;

const PORT = 55433;
let passed = 0;
let failed = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

async function main() {
  const workDir = mkdtempSync(path.join(tmpdir(), "ww-e2e-"));
  const pg = new EmbeddedPostgres({
    databaseDir: path.join(workDir, "data"),
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: false,
  });

  console.log("Starting embedded Postgres…");
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("wisdom_well");

  process.env.DATABASE_URL = `postgresql://postgres:postgres@localhost:${PORT}/wisdom_well`;
  process.env.DATABASE_DIRECT_URL = process.env.DATABASE_URL;

  console.log("Pushing schema…");
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    stdio: "inherit",
    env: process.env,
  });

  const { prisma } = await import("../lib/db");
  const {
    evaluateFamily,
    visibleEntriesFor,
    pendingEventConfirmations,
    confirmEvent,
  } = await import("../lib/release");

  try {
    // --- Build a family ------------------------------------------------
    const family = await prisma.family.create({ data: { name: "Test Family" } });
    const person = (givenName: string, dob?: string) =>
      prisma.member.create({
        data: {
          familyId: family.id,
          givenName,
          familyName: "Test",
          dateOfBirth: dob ? new Date(dob) : null,
        },
      });

    const gp = await person("Grandparent", "1945-01-01");
    const dad = await person("Parent", "1972-01-01");
    const mom = await person("Parent-in-law", "1974-01-01");
    const sarah = await person("Sarah", "2010-06-01"); // ~16 today
    const son = await person("Son", "2005-01-01"); // ~21 today

    await prisma.family.update({
      where: { id: family.id },
      data: { stewardMemberId: gp.id },
    });

    const rel = (from: string, to: string, type: "PARENT_OF" | "SPOUSE_OF") =>
      prisma.relationship.create({
        data: { familyId: family.id, fromMemberId: from, toMemberId: to, type },
      });
    await rel(gp.id, dad.id, "PARENT_OF");
    await rel(dad.id, mom.id, "SPOUSE_OF");
    await rel(dad.id, sarah.id, "PARENT_OF");
    await rel(mom.id, sarah.id, "PARENT_OF");
    await rel(dad.id, son.id, "PARENT_OF");
    await rel(mom.id, son.id, "PARENT_OF");

    // --- Helper: publish an entry with rules -------------------------
    const publish = async (title: string, rules: RuleSeed[]) => {
      const entry = await prisma.entry.create({
        data: {
          familyId: family.id,
          authorMemberId: gp.id,
          title,
          body: "…",
          status: "SCHEDULED",
        },
      });
      for (const r of rules) {
        await prisma.releaseRule.create({ data: { ...r, entryId: entry.id } });
      }
      return entry;
    };

    const canSee = async (memberId: string, entryId: string) => {
      const visible = await visibleEntriesFor(memberId);
      return visible.some((v) => v.entry.id === entryId);
    };

    // --- Shape 1: IMMEDIATE + NONE ----------------------------------
    const e1 = await publish("Shape 1 — everyone now", [
      { targetType: "IMMEDIATE", triggerType: "NONE" },
    ]);
    await evaluateFamily(family.id);
    check("1. IMMEDIATE+NONE reaches Sarah", await canSee(sarah.id, e1.id));
    check(
      "1. entry is now RELEASED",
      (await prisma.entry.findUnique({ where: { id: e1.id } }))?.status ===
        "RELEASED",
    );

    // --- Shape 2: SPECIFIC_MEMBER + AGE(18) ------------------------
    const e2 = await publish("Shape 2 — Sarah at 18", [
      {
        targetType: "SPECIFIC_MEMBER",
        targetMemberId: sarah.id,
        triggerType: "AGE",
        triggerAge: 18,
      },
    ]);
    await evaluateFamily(family.id);
    check("2. SPECIFIC+AGE(18) is hidden from 16-year-old Sarah", !(await canSee(sarah.id, e2.id)));
    check("2. …but visible to its author", await canSee(gp.id, e2.id));
    check(
      "2. no Release row exists for Sarah (hidden under direct query)",
      (await prisma.release.count({
        where: { entryId: e2.id, recipientMemberId: sarah.id },
      })) === 0,
    );

    // --- Shape 3: ROLE(GRANDCHILD) + AGE(18) ----------------------
    const e3 = await publish("Shape 3 — any grandchild at 18", [
      {
        targetType: "ROLE",
        targetRole: "GRANDCHILD",
        triggerType: "AGE",
        triggerAge: 18,
      },
    ]);
    await evaluateFamily(family.id);
    check("3. ROLE(GRANDCHILD)+AGE reaches 21-year-old grandchild", await canSee(son.id, e3.id));
    check("3. …but not the 16-year-old grandchild", !(await canSee(sarah.id, e3.id)));

    // --- Shape 4: ROLE(ALL_FAMILY) + DATE(2040) -------------------
    const e4 = await publish("Shape 4 — whole family in 2040", [
      {
        targetType: "ROLE",
        targetRole: "ALL_FAMILY",
        triggerType: "DATE",
        triggerDate: new Date("2040-01-01"),
      },
    ]);
    await evaluateFamily(family.id);
    check("4. ROLE(ALL_FAMILY)+future DATE reaches no one yet", !(await canSee(dad.id, e4.id)));

    // --- Shape 5: SPECIFIC_MEMBER + EVENT(MARRIAGE) --------------
    const e5 = await publish("Shape 5 — Son when he marries", [
      {
        targetType: "SPECIFIC_MEMBER",
        targetMemberId: son.id,
        triggerType: "EVENT",
        triggerEvent: "MARRIAGE",
      },
    ]);
    await evaluateFamily(family.id);
    check("5. EVENT rule does not fire before confirmation", !(await canSee(son.id, e5.id)));
    const pending = await pendingEventConfirmations(family.id, gp.id);
    const marriageItem = pending.find(
      (p) => p.kind === "EVENT" && p.ruleId && p.subjectMemberId === son.id,
    );
    check("5. the wedding appears in the confirmation queue", Boolean(marriageItem));
    if (marriageItem && marriageItem.kind === "EVENT") {
      await confirmEvent({
        familyId: family.id,
        ruleId: marriageItem.ruleId,
        subjectMemberId: son.id,
        confirmedByMemberId: gp.id,
      });
    }
    check("5. after confirmation the entry reaches Son", await canSee(son.id, e5.id));

    // --- Shape 6: ROLE(ANY_DESCENDANT) + NONE --------------------
    const e6 = await publish("Shape 6 — every descendant, forever", [
      { targetType: "ROLE", targetRole: "ANY_DESCENDANT", triggerType: "NONE" },
    ]);
    await evaluateFamily(family.id);
    check("6. ANY_DESCENDANT reaches dad, Sarah and Son", (await Promise.all([
      canSee(dad.id, e6.id),
      canSee(sarah.id, e6.id),
      canSee(son.id, e6.id),
    ])).every(Boolean));
    check("6. …but not the parent who married in", !(await canSee(mom.id, e6.id)));

    // --- Unborn grandchild (spec §4 explicit test) --------------
    const gil = await person("Later Grandchild", "2005-05-05"); // 21 today, added now
    await rel(dad.id, gil.id, "PARENT_OF");
    await evaluateFamily(family.id);
    check(
      "unborn grandchild: Shape 3's AGE(18) rule fires for a grandchild added after it was written",
      (await prisma.release.count({
        where: { entryId: e3.id, recipientMemberId: gil.id },
      })) === 1,
    );
    check("unborn grandchild: the entry is now visible to them", await canSee(gil.id, e3.id));

    // --- Hidden-until-release holds under a direct entry query ---
    const totalEntries = await prisma.entry.count({ where: { familyId: family.id } });
    const sarahVisible = await visibleEntriesFor(sarah.id);
    check(
      `hidden query: ${totalEntries} entries exist, Sarah can see ${sarahVisible.length}, and none of them are gated`,
      sarahVisible.every((v) => v.entry.id !== e2.id && v.entry.id !== e5.id),
    );

    // --- Irreversibility ---------------------------------------
    const before = await prisma.release.count();
    await prisma.member.update({ where: { id: son.id }, data: { dateOfBirth: null } });
    await evaluateFamily(family.id);
    const after = await prisma.release.count();
    check("irreversibility: clearing a DOB never removes an existing Release", after >= before);
  } finally {
    await prisma.$disconnect();
    await pg.stop();
    rmSync(workDir, { recursive: true, force: true });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
