"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  MediaType,
  ReleaseTargetRole,
  ReleaseTargetType,
  ReleaseTriggerEvent,
  ReleaseTriggerType,
  type Prisma,
} from "@prisma/client";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evaluateFamily } from "@/lib/release";

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

async function authorEntry(entryId: string) {
  const { member } = await requireMember();
  const entry = await prisma.entry.findFirst({
    where: { id: entryId, familyId: member.familyId },
    include: { rules: true, releases: { select: { id: true } } },
  });
  if (!entry || entry.authorMemberId !== member.id) {
    // Same response whether it doesn't exist or isn't theirs.
    redirect("/entries");
  }
  return { member, entry };
}

// --- Entry CRUD ------------------------------------------------------

export async function createEntry(formData: FormData) {
  const { member } = await requireMember();

  const title = str(formData, "title");
  const body = str(formData, "body");
  const mediaTypeRaw = str(formData, "mediaType");
  const mediaUrl = str(formData, "mediaUrl");

  if (!title) redirect("/entries/new?error=title");

  const mediaType = (Object.values(MediaType) as string[]).includes(mediaTypeRaw)
    ? (mediaTypeRaw as MediaType)
    : MediaType.TEXT;

  const entry = await prisma.entry.create({
    data: {
      familyId: member.familyId,
      authorMemberId: member.id,
      title,
      body,
      mediaType,
      mediaUrl: mediaUrl || null,
      status: "DRAFT",
    },
  });

  redirect(`/entries/${entry.id}`);
}

export async function updateEntry(formData: FormData) {
  const entryId = str(formData, "entryId");
  const { entry } = await authorEntry(entryId);

  const title = str(formData, "title");
  const body = str(formData, "body");
  const mediaUrl = str(formData, "mediaUrl");
  const mediaTypeRaw = str(formData, "mediaType");

  const data: Prisma.EntryUpdateInput = {};
  if (title) data.title = title;
  data.body = body;
  if ((Object.values(MediaType) as string[]).includes(mediaTypeRaw)) {
    data.mediaType = mediaTypeRaw as MediaType;
  }
  if (formData.has("mediaUrl")) data.mediaUrl = mediaUrl || null;

  await prisma.entry.update({ where: { id: entry.id }, data });
  revalidatePath(`/entries/${entry.id}`);
}

export async function deleteEntry(formData: FormData) {
  const entryId = str(formData, "entryId");
  const { entry } = await authorEntry(entryId);

  // Releases are irreversible (spec §4): once anyone has received an entry it
  // cannot be deleted, because that would revoke their access.
  if (entry.releases.length > 0 || entry.status === "RELEASED") {
    redirect(`/entries/${entry.id}?error=released`);
  }

  await prisma.entry.delete({ where: { id: entry.id } });
  redirect("/entries");
}

// --- Voice transcript approval (spec §6) ---------------------------

export async function approveTranscript(formData: FormData) {
  const entryId = str(formData, "entryId");
  const { entry } = await authorEntry(entryId);

  // Only a reviewed DRAFT transcript can be approved. Never auto-approve.
  if (entry.transcriptStatus !== "DRAFT") redirect(`/entries/${entry.id}`);

  await prisma.entry.update({
    where: { id: entry.id },
    data: { transcriptStatus: "APPROVED" },
  });
  revalidatePath(`/entries/${entry.id}`);
}

export async function reopenTranscript(formData: FormData) {
  const entryId = str(formData, "entryId");
  const { entry } = await authorEntry(entryId);
  if (entry.transcriptStatus !== "APPROVED" || entry.status !== "DRAFT") {
    redirect(`/entries/${entry.id}`);
  }
  await prisma.entry.update({
    where: { id: entry.id },
    data: { transcriptStatus: "DRAFT" },
  });
  revalidatePath(`/entries/${entry.id}`);
}

// --- Publishing -----------------------------------------------------

export async function publishEntry(formData: FormData) {
  const entryId = str(formData, "entryId");
  const { member, entry } = await authorEntry(entryId);

  if (entry.status !== "DRAFT") redirect(`/entries/${entry.id}`);
  if (entry.rules.length === 0) redirect(`/entries/${entry.id}?error=norules`);
  // Voice entries must be approved before they can leave DRAFT (spec §6).
  if (entry.transcriptStatus === "DRAFT" || entry.transcriptStatus === "PROCESSING") {
    redirect(`/entries/${entry.id}?error=transcript`);
  }

  await prisma.entry.update({
    where: { id: entry.id },
    data: { status: "SCHEDULED" },
  });

  // Fires IMMEDIATE rules straight away; everything else waits for its trigger.
  await evaluateFamily(member.familyId);

  redirect(`/entries/${entry.id}`);
}

export async function unscheduleEntry(formData: FormData) {
  const entryId = str(formData, "entryId");
  const { entry } = await authorEntry(entryId);

  // Can only pull it back while nothing has been released.
  if (entry.status !== "SCHEDULED" || entry.releases.length > 0) {
    redirect(`/entries/${entry.id}?error=released`);
  }

  await prisma.entry.update({
    where: { id: entry.id },
    data: { status: "DRAFT" },
  });
  redirect(`/entries/${entry.id}`);
}

// --- Release rules --------------------------------------------------

const TARGET_ROLES = new Set<string>(Object.values(ReleaseTargetRole));
const TRIGGER_EVENTS = new Set<string>(Object.values(ReleaseTriggerEvent));

export async function addRule(formData: FormData) {
  const entryId = str(formData, "entryId");
  const { member, entry } = await authorEntry(entryId);

  const targetTypeRaw = str(formData, "targetType");
  const triggerTypeRaw = str(formData, "triggerType") || "NONE";

  if (!(Object.values(ReleaseTargetType) as string[]).includes(targetTypeRaw)) {
    redirect(`/entries/${entry.id}?error=rule`);
  }
  if (!(Object.values(ReleaseTriggerType) as string[]).includes(triggerTypeRaw)) {
    redirect(`/entries/${entry.id}?error=rule`);
  }
  const targetType = targetTypeRaw as ReleaseTargetType;
  const triggerType = triggerTypeRaw as ReleaseTriggerType;

  const data: Prisma.ReleaseRuleUncheckedCreateInput = {
    entryId: entry.id,
    targetType,
    triggerType,
  };

  // --- target ---
  if (targetType === "SPECIFIC_MEMBER") {
    const targetMemberId = str(formData, "targetMemberId");
    const ok = await prisma.member.findFirst({
      where: { id: targetMemberId, familyId: member.familyId },
      select: { id: true },
    });
    if (!ok) redirect(`/entries/${entry.id}?error=rule`);
    data.targetMemberId = targetMemberId;
  } else if (targetType === "ROLE") {
    const targetRole = str(formData, "targetRole");
    if (!TARGET_ROLES.has(targetRole)) redirect(`/entries/${entry.id}?error=rule`);
    data.targetRole = targetRole as ReleaseTargetRole;
  }

  // --- trigger ---
  if (targetType === "IMMEDIATE" && triggerType !== "NONE") {
    // "IMMEDIATE" means now. A conditional release to everyone is
    // ROLE(ALL_FAMILY) + <trigger>.
    redirect(`/entries/${entry.id}?error=immediate`);
  }
  if (triggerType === "AGE") {
    const age = Number.parseInt(str(formData, "triggerAge"), 10);
    if (!Number.isInteger(age) || age < 0 || age > 130) {
      redirect(`/entries/${entry.id}?error=rule`);
    }
    data.triggerAge = age;
  } else if (triggerType === "DATE") {
    const raw = str(formData, "triggerDate");
    const date = raw ? new Date(raw) : null;
    if (!date || Number.isNaN(date.getTime())) {
      redirect(`/entries/${entry.id}?error=rule`);
    }
    data.triggerDate = date;
  } else if (triggerType === "EVENT") {
    const event = str(formData, "triggerEvent");
    if (!TRIGGER_EVENTS.has(event)) redirect(`/entries/${entry.id}?error=rule`);
    data.triggerEvent = event as ReleaseTriggerEvent;
    if (event === "CUSTOM") {
      const label = str(formData, "triggerEventLabel");
      if (!label) redirect(`/entries/${entry.id}?error=rule`);
      data.triggerEventLabel = label;
    }
  }

  await prisma.releaseRule.create({ data });

  // A new rule on an already-scheduled entry can fire immediately.
  if (entry.status !== "DRAFT") {
    await evaluateFamily(member.familyId);
  }
  revalidatePath(`/entries/${entry.id}`);
}

export async function deleteRule(formData: FormData) {
  const entryId = str(formData, "entryId");
  const ruleId = str(formData, "ruleId");
  const { entry } = await authorEntry(entryId);

  const rule = await prisma.releaseRule.findFirst({
    where: { id: ruleId, entryId: entry.id },
    include: { releases: { select: { id: true } } },
  });
  if (!rule) redirect(`/entries/${entry.id}`);

  // A rule that has already released to someone can't be removed — that access
  // is permanent.
  if (rule.releases.length > 0) {
    redirect(`/entries/${entry.id}?error=rulefired`);
  }

  await prisma.releaseRule.delete({ where: { id: rule.id } });
  revalidatePath(`/entries/${entry.id}`);
}
