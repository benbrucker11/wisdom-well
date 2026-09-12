import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createEntry } from "../actions";
import { MediaUpload } from "../_components/media-upload";

export default async function NewEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireMember();
  const sp = await searchParams;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/entries" className="text-sm text-ink-soft">
        &larr; Entries
      </Link>
      <h1 className="mt-2 font-serif text-h2 text-ink">A new entry</h1>
      <p className="mt-2 text-ink-soft">
        Write it now; decide who receives it, and when, on the next screen. It
        stays a private draft until you publish it.
      </p>

      <form action={createEntry} className="mt-8 space-y-5">
        {sp.error === "title" ? (
          <p className="text-sm text-danger">Please give the entry a title.</p>
        ) : null}

        <label className="block space-y-1">
          <span className="text-sm text-ink-soft">Title</span>
          <input name="title" required autoFocus className="field" />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-ink-soft">The entry</span>
          <textarea
            name="body"
            rows={12}
            className="field prose-entry"
            placeholder="Tell it the way you'd tell it out loud."
          />
        </label>

        <MediaUpload />

        <button type="submit" className="btn btn-primary">
          Save draft
        </button>
      </form>
    </div>
  );
}
