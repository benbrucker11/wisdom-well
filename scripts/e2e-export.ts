/**
 * Data-export end-to-end check (spec §10).
 *
 * Builds a small family with a released entry (media attached) and a sealed
 * entry, runs `buildFamilyExport`, and asserts the ZIP contains the tree, the
 * visible entry with its media, and NOT the sealed entry.
 *
 *   npm run e2e:export
 */
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import JSZip from "jszip";

const PORT = 55436;
let passed = 0;
let failed = 0;
const check = (label: string, cond: boolean) => {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
};

async function main() {
  const workDir = mkdtempSync(path.join(tmpdir(), "ww-exp-"));
  process.env.STORAGE_DIR = path.join(workDir, "storage");

  const pg = new EmbeddedPostgres({
    databaseDir: path.join(workDir, "data"),
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: false,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("wisdom_well");
  process.env.DATABASE_URL = `postgresql://postgres:postgres@localhost:${PORT}/wisdom_well`;
  process.env.DATABASE_DIRECT_URL = process.env.DATABASE_URL;
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    stdio: "inherit",
    env: process.env,
  });

  const { prisma } = await import("../lib/db");
  const { putObject } = await import("../lib/storage");
  const { evaluateFamily } = await import("../lib/release");
  const { buildFamilyExport } = await import("../lib/export");

  try {
    const family = await prisma.family.create({ data: { name: "Export Test" } });
    const author = await prisma.member.create({
      data: { familyId: family.id, givenName: "Rosa", familyName: "T" },
    });
    const recipient = await prisma.member.create({
      data: { familyId: family.id, givenName: "Lena", familyName: "T" },
    });
    await prisma.family.update({
      where: { id: family.id },
      data: { stewardMemberId: author.id, founderMemberId: author.id },
    });
    await prisma.relationship.create({
      data: {
        familyId: family.id,
        fromMemberId: author.id,
        toMemberId: recipient.id,
        type: "PARENT_OF",
        parentKind: "ADOPTIVE",
      },
    });

    const media = await putObject(
      { name: "photo.png", type: "image/png", bytes: Buffer.from("fake-png-bytes") },
      { prefix: "entry-media" },
    );
    const openEntry = await prisma.entry.create({
      data: {
        familyId: family.id,
        authorMemberId: author.id,
        title: "The walnut tree",
        body: "I planted it the year you were born.",
        mediaType: "IMAGE",
        mediaUrl: media.url,
        status: "SCHEDULED",
      },
    });
    await prisma.releaseRule.create({
      data: { entryId: openEntry.id, targetType: "ROLE", targetRole: "ANY_DESCENDANT", triggerType: "NONE" },
    });

    const sealed = await prisma.entry.create({
      data: {
        familyId: family.id,
        authorMemberId: author.id,
        title: "SEALED — for 2099",
        body: "not for now",
        status: "SCHEDULED",
      },
    });
    await prisma.releaseRule.create({
      data: {
        entryId: sealed.id,
        targetType: "ROLE",
        targetRole: "ALL_FAMILY",
        triggerType: "DATE",
        triggerDate: new Date("2099-01-01"),
      },
    });

    await evaluateFamily(family.id);

    // Export as the recipient — they can see the open entry, not the sealed one.
    const { filename, bytes } = await buildFamilyExport(recipient.id);
    check("filename is a dated zip", /^wisdom-well-export-test-\d{4}-\d{2}-\d{2}\.zip$/.test(filename));

    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files).filter((n) => !n.endsWith("/"));

    check("bundle has the family tree", names.includes("family/tree.json"));
    check("bundle has the succession file", names.includes("family/succession.json"));
    check("bundle has a manifest", names.includes("manifest.txt"));

    const tree = JSON.parse(await zip.file("family/tree.json")!.async("string"));
    check(
      "the tree records the adoptive parent link",
      tree.relationships.some(
        (r: { type: string; parentKind: string }) => r.type === "PARENT_OF" && r.parentKind === "ADOPTIVE",
      ),
    );

    const entryFiles = names.filter((n) => n.startsWith("entries/") && n.endsWith(".json") && !n.includes("_index"));
    check("exactly one entry is included (the released one)", entryFiles.length === 1);
    const entry = JSON.parse(await zip.file(entryFiles[0])!.async("string"));
    check("the included entry is the released one", entry.title === "The walnut tree");
    check("the entry body is present", entry.body.includes("the year you were born"));

    check(
      "the sealed entry is NOT in the bundle",
      !names.some((n) => n.toLowerCase().includes("sealed")),
    );

    const mediaFiles = names.filter((n) => n.startsWith("media/"));
    check("the entry's media file is bundled", mediaFiles.length === 1);
    const mediaBytes = await zip.file(mediaFiles[0])!.async("uint8array");
    check(
      "the media bytes round-trip",
      Buffer.from(mediaBytes).toString() === "fake-png-bytes",
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
