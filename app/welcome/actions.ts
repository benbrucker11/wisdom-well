"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evaluateFamily } from "@/lib/release";

/** An invited person reviews (and can fix) their own name and birthday. */
export async function confirmDetails(formData: FormData) {
  const user = await requireUser();
  if (!user.member) redirect("/onboarding");

  const givenName = String(formData.get("givenName") ?? "").trim();
  const familyName = String(formData.get("familyName") ?? "").trim();
  const dateOfBirth = String(formData.get("dateOfBirth") ?? "").trim();
  if (!givenName || !familyName) redirect("/welcome?error=name");

  const dob = dateOfBirth ? new Date(dateOfBirth) : null;
  if (dob && Number.isNaN(dob.getTime())) redirect("/welcome?error=date");

  await prisma.member.update({
    where: { id: user.member.id },
    data: { givenName, familyName, dateOfBirth: dob, detailsConfirmedAt: new Date() },
  });

  // A birthday can make an age-based rule fire — re-run, as any tree edit does.
  await evaluateFamily(user.member.familyId).catch((err) =>
    console.error("evaluateFamily after confirmDetails failed", err),
  );
  redirect("/home");
}
