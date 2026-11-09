"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export async function confirmUnsubscribe(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (token) {
    await prisma.user.updateMany({
      where: { unsubscribeToken: token },
      data: { reminderFrequency: "OFF" },
    });
  }
  redirect(`/unsubscribe/${encodeURIComponent(token)}?done=1`);
}
