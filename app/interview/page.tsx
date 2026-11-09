import { redirect } from "next/navigation";

// Recording now lives in the single "Add wisdom" screen (Nov 2026). Kept so
// old links and bookmarks still land somewhere useful.
export default function InterviewPage() {
  redirect("/entries/new?mode=voice");
}
