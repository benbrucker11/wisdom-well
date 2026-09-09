/**
 * Family data export (spec §10, "data durability over decades").
 *
 * A self-describing ZIP of plain files: the family tree, the line of
 * succession, and every entry the requester is entitled to see — routed
 * through `visibleEntriesFor`, so the trust boundary (spec §5) is automatic —
 * together with the original media and audio. No proprietary format: the bundle
 * can be read by a person, handed to a digital-estate service, or printed.
 */
import JSZip from "jszip";
import { prisma } from "../db";
import { visibleEntriesFor } from "../release";
import { describeRule } from "../release/describe";
import { getObject } from "../storage";

function memberName(m: { givenName: string; familyName: string }): string {
  return `${m.givenName} ${m.familyName}`.trim();
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "entry";
}

function keyFromMediaUrl(url: string): string | null {
  const m = url.match(/^\/api\/media\/(.+)$/);
  return m ? m[1] : null;
}

export interface FamilyExport {
  filename: string;
  bytes: Uint8Array;
}

export async function buildFamilyExport(memberId: string): Promise<FamilyExport> {
  const member = await prisma.member.findUniqueOrThrow({
    where: { id: memberId },
    include: { family: true },
  });
  const familyId = member.familyId;

  const [members, relationships, successors, visible] = await Promise.all([
    prisma.member.findMany({ where: { familyId }, orderBy: [{ dateOfBirth: "asc" }] }),
    prisma.relationship.findMany({ where: { familyId }, orderBy: { createdAt: "asc" } }),
    prisma.successor.findMany({
      where: { familyId },
      orderBy: { position: "asc" },
      include: { member: true },
    }),
    visibleEntriesFor(memberId),
  ]);

  const nameById = new Map(members.map((m) => [m.id, memberName(m)]));
  const nameFor = (id: string) => nameById.get(id) ?? id;

  const zip = new JSZip();

  // --- Tree ----------------------------------------------------------
  zip.file(
    "family/tree.json",
    JSON.stringify(
      {
        family: {
          name: member.family.name,
          founder: member.family.founderMemberId
            ? nameFor(member.family.founderMemberId)
            : null,
          steward: member.family.stewardMemberId
            ? nameFor(member.family.stewardMemberId)
            : null,
        },
        members: members.map((m) => ({
          id: m.id,
          name: memberName(m),
          dateOfBirth: m.dateOfBirth?.toISOString().slice(0, 10) ?? null,
          dateOfDeath: m.dateOfDeath?.toISOString().slice(0, 10) ?? null,
          status: m.status,
          hasLogin: m.userId != null,
        })),
        relationships: relationships.map((r) => ({
          from: nameFor(r.fromMemberId),
          type: r.type,
          to: nameFor(r.toMemberId),
          parentKind: r.parentKind,
          endedAt: r.endedAt?.toISOString().slice(0, 10) ?? null,
        })),
      },
      null,
      2,
    ),
  );

  zip.file(
    "family/succession.json",
    JSON.stringify(
      {
        policy: member.family.successionPolicy,
        inactivityThresholdDays: member.family.inactivityThresholdDays,
        successionGraceDays: member.family.successionGraceDays,
        namedSuccessors: successors.map((s) => ({
          position: s.position,
          name: memberName(s.member),
          accepted: s.acceptedAt != null,
        })),
      },
      null,
      2,
    ),
  );

  // --- Entries + media --------------------------------------------
  let mediaCount = 0;
  for (const { entry, reason, releasedToViewer } of visible) {
    const base = `entries/${slug(entry.title)}-${entry.id}`;
    zip.file(
      `${base}.json`,
      JSON.stringify(
        {
          title: entry.title,
          author: memberName(entry.author),
          createdAt: entry.createdAt.toISOString(),
          releasedAt: entry.releasedAt?.toISOString() ?? null,
          status: entry.status,
          mediaType: entry.mediaType,
          visibleBecause: reason, // "author" | "released"
          releasedToYou: releasedToViewer,
          body: entry.body,
          transcriptRaw: entry.transcriptRaw ?? null,
        },
        null,
        2,
      ),
    );

    for (const url of [entry.mediaUrl, entry.rawAudioUrl]) {
      if (!url) continue;
      const key = keyFromMediaUrl(url);
      if (!key) continue;
      try {
        const bytes = await getObject(key);
        const ext = key.split(".").pop() ?? "bin";
        const label = url === entry.rawAudioUrl ? "audio" : "media";
        zip.file(`media/${slug(entry.title)}-${entry.id}-${label}.${ext}`, bytes);
        mediaCount += 1;
      } catch (err) {
        // A missing file shouldn't sink the whole export.
        console.warn(`export: could not read media ${key}:`, err);
      }
    }
  }

  // --- Manifest ----------------------------------------------------
  const now = new Date();
  zip.file(
    "manifest.txt",
    [
      `Wisdom Well export`,
      `Family: ${member.family.name}`,
      `Prepared for: ${memberName(member)}`,
      `Date: ${now.toISOString()}`,
      ``,
      `Contents:`,
      `  family/tree.json        the family tree as of this date`,
      `  family/succession.json  the line of succession`,
      `  entries/*.json          ${visible.length} entr${visible.length === 1 ? "y" : "ies"} you can see`,
      `  media/*                 ${mediaCount} media / audio file${mediaCount === 1 ? "" : "s"}`,
      ``,
      `Entries you cannot yet see (sealed for a future date, person, or event)`,
      `are not included — they are released to their recipients when the time`,
      `comes, not before.`,
      ``,
      `This bundle is plain JSON and media files. It is meant to outlive the`,
      `software that made it.`,
    ].join("\n"),
  );

  if (visible.length > 0) {
    zip.file(
      "entries/_index.txt",
      visible
        .map(({ entry }) => `${entry.title} — ${memberName(entry.author)}`)
        .join("\n"),
    );
  }

  // Author-authored entries: include the release rules in plain language.
  for (const { entry, reason } of visible) {
    if (reason !== "author") continue;
    const rules = await prisma.releaseRule.findMany({ where: { entryId: entry.id } });
    if (rules.length === 0) continue;
    zip.file(
      `entries/${slug(entry.title)}-${entry.id}.rules.txt`,
      rules.map((r) => `- ${describeRule(r, nameFor)}`).join("\n"),
    );
  }

  const bytes = await zip.generateAsync({ type: "uint8array" });
  const stamp = now.toISOString().slice(0, 10);
  return {
    filename: `wisdom-well-${slug(member.family.name)}-${stamp}.zip`,
    bytes,
  };
}
