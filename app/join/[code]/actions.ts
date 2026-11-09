"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { sendJoinRequestToSteward } from "@/lib/mail";
import { requestOrigin } from "@/lib/request-origin";

const MAX_PENDING_PER_EMAIL = 1;

/**
 * Someone followed a family's join link and asked to be added. Nothing about
 * the family is revealed beyond its name; the steward decides.
 */
export async function submitJoinRequest(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const givenName = String(formData.get("givenName") ?? "").trim().slice(0, 80);
  const familyName = String(formData.get("familyName") ?? "").trim().slice(0, 80);
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const relationNote = String(formData.get("relationNote") ?? "").trim().slice(0, 500);

  const family = code
    ? await prisma.family.findUnique({
        where: { joinCode: code },
        include: { stewardMember: { include: { user: true } } },
      })
    : null;
  if (!family) redirect("/");

  const back = `/join/${encodeURIComponent(code)}`;
  if (!givenName || !familyName || !relationNote || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect(`${back}?error=missing`);
  }

  // One pending request per email per family — re-submitting is a no-op.
  const pending = await prisma.joinRequest.count({
    where: { familyId: family.id, email, status: "PENDING" },
  });
  if (pending >= MAX_PENDING_PER_EMAIL) redirect(`${back}?sent=1`);

  await prisma.joinRequest.create({
    data: { familyId: family.id, givenName, familyName, email, relationNote },
  });

  const stewardEmail = family.stewardMember?.user?.email;
  if (stewardEmail) {
    await sendJoinRequestToSteward(stewardEmail, {
      requesterName: `${givenName} ${familyName}`,
      relationNote,
      familyName: family.name,
      reviewUrl: `${await requestOrigin()}/family#join-requests`,
    }).catch((err) => console.error("join request email failed", err));
  }

  redirect(`${back}?sent=1`);
}
