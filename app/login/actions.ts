"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { issueMagicLink } from "@/lib/auth";

export async function requestMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email || !email.includes("@")) {
    redirect("/login?error=invalid");
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";

  await issueMagicLink(email, `${proto}://${host}`);
  redirect("/login?sent=1");
}
