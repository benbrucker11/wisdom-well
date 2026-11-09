"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function createFamily(formData: FormData) {
  const user = await requireUser();
  if (user.member) redirect("/home");

  const familyName = String(formData.get("familyName") ?? "").trim();
  const givenName = String(formData.get("givenName") ?? "").trim();
  const surname = String(formData.get("surname") ?? "").trim();
  const dateOfBirth = String(formData.get("dateOfBirth") ?? "").trim();

  if (!familyName || !givenName || !surname) {
    redirect("/onboarding?error=missing");
  }

  await prisma.$transaction(async (tx) => {
    const family = await tx.family.create({ data: { name: familyName } });

    const member = await tx.member.create({
      data: {
        familyId: family.id,
        givenName,
        familyName: surname,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        userId: user.id,
        // They typed these themselves just now.
        detailsConfirmedAt: new Date(),
      },
    });

    // The creator is the founding Steward (spec §2) and the founder — the root
    // for policy-based succession (spec §10).
    await tx.family.update({
      where: { id: family.id },
      data: { stewardMemberId: member.id, founderMemberId: member.id },
    });
  });

  redirect("/home");
}
