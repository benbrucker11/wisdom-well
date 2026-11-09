"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/db";

const FREQUENCIES = new Set(["WEEKLY", "BIWEEKLY", "MONTHLY", "OFF"]);

export async function setReminderFrequency(formData: FormData) {
  const { user } = await requireMember();
  const value = String(formData.get("frequency") ?? "");
  if (!FREQUENCIES.has(value)) redirect("/settings");
  await prisma.user.update({
    where: { id: user.id },
    data: { reminderFrequency: value as "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "OFF" },
  });
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}
