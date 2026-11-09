import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";

// Placeholder until the dashboard lands (Phase 5).
export default async function HomePage() {
  await requireMember();
  redirect("/family");
}
