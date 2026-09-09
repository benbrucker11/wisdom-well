"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { confirmEvent, evaluateFamily } from "@/lib/release";

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** Steward, or the still-living author of the entry the rule belongs to. */
async function assertCanConfirm(ruleId: string) {
  const { user, member } = await requireMember();
  const rule = await prisma.releaseRule.findUnique({
    where: { id: ruleId },
    include: { entry: { include: { author: true, family: true } } },
  });
  if (!rule || rule.entry.familyId !== member.familyId) redirect("/confirmations");

  const isSteward = rule.entry.family.stewardMemberId === member.id;
  const isLivingAuthor =
    rule.entry.authorMemberId === member.id && rule.entry.author.dateOfDeath == null;

  if (!isSteward && !isLivingAuthor) redirect("/confirmations?error=forbidden");
  return { user, member, rule };
}

export async function confirmEventAction(formData: FormData) {
  const ruleId = str(formData, "ruleId");
  const subjectMemberId = str(formData, "subjectMemberId");
  const { member, rule } = await assertCanConfirm(ruleId);

  const subject = await prisma.member.findFirst({
    where: { id: subjectMemberId, familyId: member.familyId },
    select: { id: true },
  });
  if (!subject) redirect("/confirmations");

  await confirmEvent({
    familyId: member.familyId,
    ruleId,
    subjectMemberId,
    confirmedByMemberId: member.id,
  });

  revalidatePath("/confirmations");
  revalidatePath(`/entries/${rule.entryId}`);
}

/**
 * DEATH_OF_AUTHOR is confirmed by recording the author's date of death
 * (spec §4). Steward only.
 */
export async function confirmAuthorDeathAction(formData: FormData) {
  const { member } = await requireMember();
  const authorMemberId = str(formData, "authorMemberId");
  const dateRaw = str(formData, "date");

  const family = await prisma.family.findUnique({
    where: { id: member.familyId },
    select: { stewardMemberId: true },
  });
  if (family?.stewardMemberId !== member.id) {
    redirect("/confirmations?error=forbidden");
  }

  const author = await prisma.member.findFirst({
    where: { id: authorMemberId, familyId: member.familyId },
  });
  if (!author) redirect("/confirmations");
  if (author.dateOfDeath == null) {
    const date = dateRaw ? new Date(dateRaw) : new Date();
    await prisma.member.update({
      where: { id: author.id },
      data: { dateOfDeath: Number.isNaN(date.getTime()) ? new Date() : date },
    });
  }

  await evaluateFamily(member.familyId);
  revalidatePath("/confirmations");
}
