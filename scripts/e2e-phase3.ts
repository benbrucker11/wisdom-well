/**
 * Phase 3 end-to-end check against a real Postgres.
 *
 * Drives the database-backed succession engine through inactivity detection,
 * the grace period, completion, "the steward came back", and an explicit
 * decline — and asserts that completing a handover exposes **no sealed entry
 * content** to the incoming steward (the Phase 3 "done when").
 *
 *   npm run e2e:phase3
 */
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const PORT = 55434;
const DAY = 24 * 60 * 60 * 1000;
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
  const workDir = mkdtempSync(path.join(tmpdir(), "ww-e2e3-"));
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

  console.log("Pushing schema…");
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    stdio: "inherit",
    env: process.env,
  });

  const { prisma } = await import("../lib/db");
  const { visibleEntriesFor } = await import("../lib/release");
  const {
    processFamilySuccession,
    addSuccessor,
    declineTransfer,
    assumeStewardship,
    assessSteward,
  } = await import("../lib/succession");

  try {
    // --- Build a family with a sealed entry --------------------------
    const family = await prisma.family.create({
      data: { name: "Succession Test", inactivityThresholdDays: 365, successionGraceDays: 30 },
    });

    const makePerson = async (name: string, withLogin: boolean) => {
      const user = withLogin
        ? await prisma.user.create({ data: { email: `${name}@test.local` } })
        : null;
      return prisma.member.create({
        data: {
          familyId: family.id,
          givenName: name,
          familyName: "Test",
          userId: user?.id ?? null,
        },
      });
    };

    const steward = await makePerson("Steward", true);
    const heir = await makePerson("Heir", true);
    const author = await makePerson("Author", true);
    const child = await makePerson("Child", false); // recipient of a sealed entry, no login

    await prisma.family.update({
      where: { id: family.id },
      data: { stewardMemberId: steward.id },
    });
    await prisma.relationship.create({
      data: { familyId: family.id, fromMemberId: author.id, toMemberId: child.id, type: "PARENT_OF" },
    });

    // A sealed entry: released to nobody (AGE 18 on a child with no DOB).
    const sealed = await prisma.entry.create({
      data: {
        familyId: family.id,
        authorMemberId: author.id,
        title: "SECRET — a letter for my child",
        body: "The contents of this entry must never reach the steward.",
        status: "SCHEDULED",
      },
    });
    await prisma.releaseRule.create({
      data: {
        entryId: sealed.id,
        targetType: "SPECIFIC_MEMBER",
        targetMemberId: child.id,
        triggerType: "AGE",
        triggerAge: 18,
      },
    });

    const heirVisibleBefore = (await visibleEntriesFor(heir.id)).map((v) => v.entry.id).sort();
    const stewardVisibleBefore = (await visibleEntriesFor(steward.id)).map((v) => v.entry.id).sort();
    const releaseCountBefore = await prisma.release.count();

    check("setup: the sealed entry is not visible to the heir", !heirVisibleBefore.includes(sealed.id));
    check("setup: the sealed entry is not visible to the current steward", !stewardVisibleBefore.includes(sealed.id));

    // --- No successors yet → nothing happens even if inactive ------
    await prisma.user.update({
      where: { id: steward.userId! },
      data: { lastSeenAt: new Date(Date.now() - 400 * DAY) },
    });
    let outcome = await processFamilySuccession(family.id);
    check("inactive steward + no successors → NONE", outcome.action === "NONE");

    // --- Name a successor ----------------------------------------
    await addSuccessor({ familyId: family.id, actingMemberId: steward.id, memberId: heir.id });

    // Adding a successor reactivated the steward's lastSeenAt? No — only decline
    // does. Re-set it stale for the test.
    await prisma.user.update({
      where: { id: steward.userId! },
      data: { lastSeenAt: new Date(Date.now() - 400 * DAY) },
    });

    const assessment = await assessSteward(family.id);
    check("assessSteward reports the steward as inactive", assessment.isInactive);

    // --- Inactivity → INITIATE ----------------------------------
    outcome = await processFamilySuccession(family.id);
    check("inactive steward + successor → INITIATE", outcome.action === "INITIATE");
    const transfer = await prisma.stewardTransfer.findFirstOrThrow({
      where: { familyId: family.id, status: "PENDING" },
    });
    check("a PENDING transfer to the heir now exists", transfer.toMemberId === heir.id);

    // --- Grace period still running → NONE ----------------------
    outcome = await processFamilySuccession(family.id);
    check("second run during grace period → NONE", outcome.action === "NONE");

    // --- assumeStewardship too early → rejected ----------------
    let threw = false;
    try {
      await assumeStewardship({ familyId: family.id, actingMemberId: heir.id });
    } catch {
      threw = true;
    }
    check("heir cannot assume stewardship before the grace period ends", threw);

    // --- Grace elapsed → COMPLETE -----------------------------
    const afterGrace = new Date(transfer.graceEndsAt.getTime() + DAY);
    outcome = await processFamilySuccession(family.id, afterGrace);
    check("after the grace period → COMPLETE", outcome.action === "COMPLETE");

    const familyAfter = await prisma.family.findUniqueOrThrow({ where: { id: family.id } });
    check("the heir is now the steward", familyAfter.stewardMemberId === heir.id);
    check(
      "the new steward has been removed from the line of succession",
      (await prisma.successor.count({ where: { familyId: family.id, memberId: heir.id } })) === 0,
    );

    // --- THE KEY ASSERTION: no sealed content exposed --------
    const heirVisibleAfter = (await visibleEntriesFor(heir.id)).map((v) => v.entry.id).sort();
    check(
      "the new steward's visible entries are exactly unchanged by the handover",
      JSON.stringify(heirVisibleAfter) === JSON.stringify(heirVisibleBefore),
    );
    check("the sealed entry is still invisible to the new steward", !heirVisibleAfter.includes(sealed.id));
    check(
      "no Release rows were created by the handover",
      (await prisma.release.count()) === releaseCountBefore,
    );
    check(
      "the sealed entry's title never appears in the new steward's view",
      !(await visibleEntriesFor(heir.id)).some((v) => v.entry.title.includes("SECRET")),
    );

    // --- Steward-return cancels an in-flight handover --------
    const family2 = await prisma.family.create({
      data: { name: "Return Test", inactivityThresholdDays: 365, successionGraceDays: 30 },
    });
    const s2user = await prisma.user.create({ data: { email: "s2@test.local" } });
    const s2 = await prisma.member.create({
      data: { familyId: family2.id, givenName: "S2", familyName: "T", userId: s2user.id },
    });
    const h2user = await prisma.user.create({ data: { email: "h2@test.local" } });
    const h2 = await prisma.member.create({
      data: { familyId: family2.id, givenName: "H2", familyName: "T", userId: h2user.id },
    });
    await prisma.family.update({ where: { id: family2.id }, data: { stewardMemberId: s2.id } });
    await addSuccessor({ familyId: family2.id, actingMemberId: s2.id, memberId: h2.id });
    await prisma.user.update({
      where: { id: s2user.id },
      data: { lastSeenAt: new Date(Date.now() - 400 * DAY) },
    });
    check("family 2: INITIATE", (await processFamilySuccession(family2.id)).action === "INITIATE");

    // Steward signs back in.
    await prisma.user.update({ where: { id: s2user.id }, data: { lastSeenAt: new Date() } });
    const returned = await processFamilySuccession(family2.id);
    check("steward signing back in → CANCEL", returned.action === "CANCEL");
    check(
      "the cancelled transfer is marked STEWARD_RETURNED",
      (await prisma.stewardTransfer.findFirstOrThrow({
        where: { familyId: family2.id, status: "CANCELLED" },
      })).cancelReason === "STEWARD_RETURNED",
    );
    check(
      "family 2 steward is unchanged",
      (await prisma.family.findUniqueOrThrow({ where: { id: family2.id } })).stewardMemberId === s2.id,
    );

    // --- Explicit decline -----------------------------------
    await prisma.user.update({
      where: { id: s2user.id },
      data: { lastSeenAt: new Date(Date.now() - 400 * DAY) },
    });
    await processFamilySuccession(family2.id); // INITIATE again
    await declineTransfer({ familyId: family2.id, actingMemberId: s2.id });
    check(
      "declineTransfer marks the handover STEWARD_DECLINED",
      (await prisma.stewardTransfer.findFirstOrThrow({
        where: { familyId: family2.id, status: "CANCELLED", cancelReason: "STEWARD_DECLINED" },
      })) != null,
    );
    check(
      "declining bumps the steward's lastSeenAt so it doesn't immediately re-initiate",
      !(await processFamilySuccession(family2.id)).action.includes("INITIATE"),
    );
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
