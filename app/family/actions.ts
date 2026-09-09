"use server";

import { revalidatePath } from "next/cache";
import { RelationshipType } from "@prisma/client";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/db";

const RELATIONSHIP_TYPES = new Set<string>(Object.values(RelationshipType));

export async function addMember(formData: FormData) {
  const { member } = await requireMember();

  const givenName = String(formData.get("givenName") ?? "").trim();
  const surname = String(formData.get("surname") ?? "").trim();
  const dateOfBirth = String(formData.get("dateOfBirth") ?? "").trim();
  const dateOfDeath = String(formData.get("dateOfDeath") ?? "").trim();

  if (!givenName || !surname) return;

  await prisma.member.create({
    data: {
      familyId: member.familyId,
      givenName,
      familyName: surname,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      dateOfDeath: dateOfDeath ? new Date(dateOfDeath) : null,
    },
  });

  revalidatePath("/family");
}

export async function addRelationship(formData: FormData) {
  const { member } = await requireMember();

  const fromMemberId = String(formData.get("fromMemberId") ?? "");
  const toMemberId = String(formData.get("toMemberId") ?? "");
  const type = String(formData.get("type") ?? "");

  if (!fromMemberId || !toMemberId || fromMemberId === toMemberId) return;
  if (!RELATIONSHIP_TYPES.has(type)) return;

  // Both members must belong to the acting user's family.
  const endpoints = await prisma.member.findMany({
    where: { id: { in: [fromMemberId, toMemberId] }, familyId: member.familyId },
    select: { id: true },
  });
  if (endpoints.length !== 2) return;

  // Unique constraint on (from, to, type) makes re-adding a no-op.
  await prisma.relationship
    .create({
      data: {
        familyId: member.familyId,
        fromMemberId,
        toMemberId,
        type: type as RelationshipType,
      },
    })
    .catch(() => {});

  revalidatePath("/family");
}

export async function deleteRelationship(formData: FormData) {
  const { member } = await requireMember();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Scope the delete to the user's family.
  await prisma.relationship.deleteMany({
    where: { id, familyId: member.familyId },
  });

  revalidatePath("/family");
}
