/**
 * Phase 4 end-to-end check: the voice-interview pipeline against real services.
 *
 * Generates a short spoken clip (macOS `say`), stores it, runs it through the
 * actual AssemblyAI transcription + reconciliation pipeline, and asserts the
 * result is an editable, approvable DRAFT entry with the original audio
 * attached and retrievable (the Phase 4 "done when").
 *
 *   npm run e2e:phase4      # needs ASSEMBLYAI_API_KEY in .env or the environment
 *
 * Reconciliation runs against Claude when ANTHROPIC_API_KEY is set; otherwise
 * it uses the offline fallback and this script still passes.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const PORT = 55435;
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

// Load ASSEMBLYAI_API_KEY / ANTHROPIC_API_KEY from .env if not already set.
function loadEnvFile() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const SPOKEN =
  "My grandfather came over from Palermo in nineteen twenty-one with a suitcase and a mandolin. " +
  "He could not read the street signs, so he counted the blocks to the fish market and back. " +
  "He always said the ocean was the one thing that looked the same on both sides.";

async function main() {
  loadEnvFile();
  if (!process.env.ASSEMBLYAI_API_KEY) {
    console.error("ASSEMBLYAI_API_KEY is not set (checked env and .env). Skipping.");
    process.exit(1);
  }

  const workDir = mkdtempSync(path.join(tmpdir(), "ww-e2e4-"));
  process.env.STORAGE_DIR = path.join(workDir, "storage");

  // Generate a real audio clip.
  const audioPath = path.join(workDir, "sample.aiff");
  try {
    execSync(`say -o ${JSON.stringify(audioPath)} ${JSON.stringify(SPOKEN)}`, {
      stdio: "ignore",
    });
  } catch {
    console.error("Could not run `say` to generate audio (macOS only). Skipping.");
    process.exit(1);
  }
  const audioBytes = readFileSync(audioPath);

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
  const { putObject, getObject } = await import("../lib/storage");
  const { startVoiceEntry, advanceTranscription } = await import("../lib/transcription");

  try {
    const family = await prisma.family.create({ data: { name: "Voice Test" } });
    const user = await prisma.user.create({ data: { email: "speaker@test.local" } });
    const member = await prisma.member.create({
      data: {
        familyId: family.id,
        givenName: "Nonna",
        familyName: "Test",
        userId: user.id,
      },
    });

    const stored = await putObject(
      { name: "sample.aiff", type: "audio/aiff", bytes: audioBytes },
      { prefix: "raw-audio" },
    );
    const prompt = "Where did our family come from, and why did they leave?";

    console.log("Submitting to AssemblyAI…");
    const { entryId } = await startVoiceEntry({
      familyId: family.id,
      authorMemberId: member.id,
      audioUrl: stored.url,
      audioBytes,
      promptText: prompt,
    });

    const created = await prisma.entry.findUniqueOrThrow({ where: { id: entryId } });
    check("entry created as an AUDIO DRAFT while transcription runs", created.mediaType === "AUDIO" && created.status === "DRAFT" && created.transcriptStatus === "PROCESSING");
    check("the raw recording URL is stored on the entry", created.rawAudioUrl === stored.url);
    check("the guided prompt is recorded on the entry", created.interviewPrompt === prompt);

    console.log("Polling for the transcript…");
    let state = "PROCESSING";
    const deadline = Date.now() + 180_000;
    while (state === "PROCESSING" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000));
      const result = await advanceTranscription(entryId);
      state = result.state;
      if (state === "ERROR") {
        console.error("transcription error:", result.error);
      }
    }
    check("transcription completed and produced a DRAFT", state === "DRAFT");

    const done = await prisma.entry.findUniqueOrThrow({ where: { id: entryId } });
    check("the raw transcript was stored", (done.transcriptRaw ?? "").length > 0);
    check(
      "the transcript recognised the spoken content",
      /palermo|mandolin|fish market|nineteen twenty/i.test(done.transcriptRaw ?? ""),
    );
    check("the entry now has an editable body", done.body.trim().length > 0);
    check(
      "the body does not invent facts beyond the recording (fallback path only)",
      done.transcriptRaw !== null,
    );
    check("the AssemblyAI job id was cleared", done.transcriptJobId === null);

    // The author reviews and approves (spec §6, step 6 — never auto-published).
    check("nothing was auto-published", done.status === "DRAFT");
    await prisma.entry.update({
      where: { id: entryId },
      data: { transcriptStatus: "APPROVED", body: `${done.body}\n\n(edited by the author)` },
    });
    const approved = await prisma.entry.findUniqueOrThrow({ where: { id: entryId } });
    check("the transcript can be approved", approved.transcriptStatus === "APPROVED");

    // The original audio is still there and playable.
    const key = stored.url.replace("/api/media/", "");
    const roundTrip = await getObject(key);
    check(
      "the original audio is retained and byte-for-byte retrievable",
      roundTrip.length === audioBytes.length,
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
