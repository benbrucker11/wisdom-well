import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { PROMPT_THEMES, findTheme, promptAt } from "@/lib/prompts";
import { transcriptionConfigured } from "@/lib/transcription";
import { Recorder } from "./_components/recorder";

export default async function InterviewPage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string; i?: string }>;
}) {
  await requireMember();
  const sp = await searchParams;
  const theme = findTheme(sp.theme);
  const index = Number.parseInt(sp.i ?? "0", 10) || 0;

  const configured = transcriptionConfigured();

  if (!theme) {
    return (
      <div>
        <h1 className="font-serif text-h1 text-ink">Speak a memory</h1>
        <p className="mt-3 max-w-xl text-ink-soft">
          Pick something to talk about. You&rsquo;ll get one question at a time —
          skip any of them, and don&rsquo;t worry about staying on topic. When
          you&rsquo;re done, we&rsquo;ll turn the recording into a written entry
          you can edit. Your voice is kept too.
        </p>

        {!configured ? (
          <p className="card card-muted mt-4 text-sm text-ink-soft">
            Transcription isn&rsquo;t configured on this server yet
            (<code>ASSEMBLYAI_API_KEY</code>). You can still record, but the
            entry won&rsquo;t be transcribed.
          </p>
        ) : null}

        <ul className="mt-8 divide-y divide-mist border-y border-mist">
          {PROMPT_THEMES.map((t) => (
            <li key={t.slug}>
              <Link
                href={`/interview?theme=${t.slug}`}
                className="flex items-baseline justify-between py-4 no-underline"
              >
                <span className="font-serif text-xl text-ink">{t.title}</span>
                <span className="text-sm text-ink-soft">{t.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const prompt = promptAt(theme, index);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-baseline justify-between text-sm text-ink-soft">
        <Link href="/interview">&larr; All themes</Link>
        <span>{theme.title}</span>
      </div>

      <h1 className="mt-6 font-serif text-h2 leading-snug text-ink">{prompt}</h1>

      <div className="mt-4 flex gap-4 text-sm">
        <Link href={`/interview?theme=${theme.slug}&i=${index + 1}`}>
          Ask me something else
        </Link>
        <Link href="/interview" className="text-ink-soft">
          Different theme
        </Link>
      </div>

      <Recorder promptText={prompt} />

      <p className="mt-6 text-sm text-ink-soft">
        Nothing is published automatically. After transcribing, you&rsquo;ll get
        a draft to read, edit, and approve — with the original audio attached.
      </p>
    </div>
  );
}
