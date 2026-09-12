"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { RelationshipType } from "@prisma/client";
import { issueMemberInvite, requireMember } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evaluateFamily } from "@/lib/release";

async function currentOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

const RELATIONSHIP_TYPES = new Set<string>(Object.values(RelationshipType));

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/**
 * Any change to the family tree can make a role rule newly match someone (a
 * grandchild who didn't exist when the rule was written, a date of birth
 * finally recorded, a death confirmed). Re-run the release engine after each
 * one — spec §4.
 */
async function reevaluate(familyId: string) {
  try {
    await evaluateFamily(familyId);
  } catch (err) {
    console.error("evaluateFamily failed after tree change", err);
  }
}

export async function addMember(formData: FormData) {
  const { member } = await requireMember();

  const givenName = str(formData, "givenName");
  const surname = str(formData, "surname");
  const dateOfBirth = str(formData, "dateOfBirth");
  const dateOfDeath = str(formData, "dateOfDeath");
  const email = str(formData, "email").toLowerCase();

  if (!givenName || !surname) return;

  const created = await prisma.member.create({
    data: {
      familyId: member.familyId,
      givenName,
      familyName: surname,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      dateOfDeath: dateOfDeath ? new Date(dateOfDeath) : null,
    },
  });

  await reevaluate(member.familyId);
  revalidatePath("/family");

  if (email && email.includes("@")) {
    const result = await issueMemberInvite(created.id, email, await currentOrigin());
    redirect(result.ok ? "/family?invited=1" : `/family?inviteError=${result.reason}`);
  }
}

/** Invite (or re-invite) an existing, login-less member by email. */
export async function inviteMember(formData: FormData) {
  const { member } = await requireMember();
  const memberId = str(formData, "memberId");
  const email = str(formData, "email").toLowerCase();

  const target = await prisma.member.findFirst({
    where: { id: memberId, familyId: member.familyId },
    select: { id: true },
  });
  if (!target || !email || !email.includes("@")) {
    redirect("/family?inviteError=invalid");
  }

  const result = await issueMemberInvite(memberId, email, await currentOrigin());
  redirect(result.ok ? "/family?invited=1" : `/family?inviteError=${result.reason}`);
}

export async function updateMember(formData: FormData) {
  const { member } = await requireMember();
  const id = str(formData, "id");
  const dateOfBirth = str(formData, "dateOfBirth");
  const dateOfDeath = str(formData, "dateOfDeath");

  const target = await prisma.member.findFirst({
    where: { id, familyId: member.familyId },
    select: { id: true },
  });
  if (!target) return;

  await prisma.member.update({
    where: { id },
    data: {
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      dateOfDeath: dateOfDeath ? new Date(dateOfDeath) : null,
    },
  });

  await reevaluate(member.familyId);
  revalidatePath("/family");
}

const PARENT_KINDS = new Set(["BIOLOGICAL", "ADOPTIVE", "STEP", "GUARDIAN"]);

export async function setMemberStatus(formData: FormData) {
  const { member } = await requireMember();
  const id = str(formData, "id");
  const status = str(formData, "status") === "DEPARTED" ? "DEPARTED" : "ACTIVE";

  const target = await prisma.member.findFirst({
    where: { id, familyId: member.familyId },
    select: { id: true, userId: true },
  });
  if (!target) return;
  // A family always needs its steward present.
  if (status === "DEPARTED" && member.family.stewardMemberId === id) {
    redirect("/family?error=steward-departed");
  }

  await prisma.member.update({
    where: { id },
    data: {
      status,
      departedAt: status === "DEPARTED" ? new Date() : null,
    },
  });
  await reevaluate(member.familyId);
  revalidatePath("/family");
}

export async function addRelationship(formData: FormData) {
  const { member } = await requireMember();

  const fromMemberId = str(formData, "fromMemberId");
  const toMemberId = str(formData, "toMemberId");
  const type = str(formData, "type");
  const parentKindRaw = str(formData, "parentKind");

  if (!fromMemberId || !toMemberId || fromMemberId === toMemberId) return;
  if (!RELATIONSHIP_TYPES.has(type)) return;

  // Both members must belong to the acting user's family.
  const endpoints = await prisma.member.findMany({
    where: { id: { in: [fromMemberId, toMemberId] }, familyId: member.familyId },
    select: { id: true },
  });
  if (endpoints.length !== 2) return;

  const parentKind =
    type === "PARENT_OF" && PARENT_KINDS.has(parentKindRaw)
      ? (parentKindRaw as "BIOLOGICAL" | "ADOPTIVE" | "STEP" | "GUARDIAN")
      : type === "PARENT_OF"
        ? "BIOLOGICAL"
        : null;

  // Unique constraint on (from, to, type) makes re-adding a no-op.
  await prisma.relationship
    .create({
      data: {
        familyId: member.familyId,
        fromMemberId,
        toMemberId,
        type: type as RelationshipType,
        parentKind,
      },
    })
    .catch(() => {});

  await reevaluate(member.familyId);
  revalidatePath("/family");
}

/** Mark a marriage as ended (divorce). Lineage is unaffected. */
export async function endRelationship(formData: FormData) {
  const { member } = await requireMember();
  const id = str(formData, "id");
  if (!id) return;
  await prisma.relationship.updateMany({
    where: { id, familyId: member.familyId, type: "SPOUSE_OF" },
    data: { endedAt: new Date() },
  });
  await reevaluate(member.familyId);
  revalidatePath("/family");
}

export async function deleteRelationship(formData: FormData) {
  const { member } = await requireMember();
  const id = str(formData, "id");
  if (!id) return;

  // Scope the delete to the user's family.
  await prisma.relationship.deleteMany({
    where: { id, familyId: member.familyId },
  });

  // Deleting a relationship never removes an existing Release (those are
  // permanent) but keeps future evaluation consistent.
  await reevaluate(member.familyId);
  revalidatePath("/family");
}
