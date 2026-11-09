"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { uploadFile } from "../../_lib/upload-client";
import { askQuestion, createEntry } from "../actions";
import { MediaUpload } from "./media-upload";
import { Recorder, type RecordingKind } from "./recorder";

export interface ComposerPrompt {
  text: string;
  bucket: string | null;
  bucketTitle: string | null;
  subtopic: string | null;
  subtopicTitle: string | null;
  /** A family-written prompt (shared, or asked of this person). */
  promptId?: string | null;
  /** "Asked by Mom" / "From our family · Jared". */
  byline?: string | null;
}

export interface ComposerBucket {
  slug: string;
  title: string;
  optional: boolean;
  subtopics: { slug: string; title: string }[];
}

type Mode = "write" | RecordingKind;
type PromptPanel = null | "topics" | "custom";

/**
 * One place to add wisdom (Nov 2026): pick a prompt — or write your own, or
 * none — then write it, say it, or film it. Recordings upload with progress,
 * transcription starts, and the person lands on the review screen.
 */
export function Composer({
  initialPrompt,
  initialMode,
  buckets,
  familyPrompts,
  members,
}: {
  initialPrompt: ComposerPrompt | null;
  initialMode: Mode;
  buckets: ComposerBucket[];
  familyPrompts: ComposerPrompt[];
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState<ComposerPrompt | null>(initialPrompt);
  const [panel, setPanel] = useState<PromptPanel>(null);
  const [customText, setCustomText] = useState("");
  const [shareCustom, setShareCustom] = useState(false);
  const [askInstead, setAskInstead] = useState(false);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [topicBucket, setTopicBucket] = useState<string>(initialPrompt?.bucket ?? "");
  const [topicSubtopic, setTopicSubtopic] = useState<string>("");
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const usingCustom = panel === "custom" && customText.trim().length > 0;

  async function nextPrompt(opts: { bucket?: string; subtopic?: string; followUp?: boolean } = {}) {
    setLoadingPrompt(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      const bucket = opts.bucket ?? prompt?.bucket ?? "";
      const subtopic = opts.subtopic ?? (opts.bucket ? "" : prompt?.subtopic ?? "");
      if (bucket) q.set("bucket", bucket);
      if (subtopic) q.set("subtopic", subtopic);
      if (prompt?.text) q.set("exclude", prompt.text);
      if (opts.followUp) q.set("mode", "follow_up");
      const res = await fetch(`/api/prompts/next?${q}`);
      if (!res.ok) throw new Error();
      const next = (await res.json()) as ComposerPrompt;
      setPrompt({ ...next, promptId: null, byline: null });
      setPanel(null);
    } catch {
      setError("Couldn't get another question just now. Try again.");
    } finally {
      setLoadingPrompt(false);
    }
  }

  async function useRecording(blob: Blob, fileName: string) {
    setBusy(true);
    setError(null);
    setStatus("Saving your recording…");
    setProgress(0);
    try {
      const prefix = mode === "video" ? "raw-video" : "raw-audio";
      const uploaded = await uploadFile(blob, fileName, prefix, setProgress);
      setProgress(null);
      setStatus("Starting the transcript…");

      const form = formRef.current ? new FormData(formRef.current) : new FormData();
      const res = await fetch("/api/recordings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: mode,
          recordingUrl: uploaded.url,
          photoUrl: String(form.get("mediaUrl") ?? "") || null,
          promptText: usingCustom ? null : prompt?.text ?? null,
          promptBucket: usingCustom ? null : prompt?.bucket ?? null,
          promptSubtopic: usingCustom ? null : prompt?.subtopic ?? null,
          promptId: usingCustom ? null : prompt?.promptId ?? null,
          customPrompt: usingCustom ? customText.trim() : null,
          shareCustomPrompt: usingCustom && shareCustom,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        entryId?: string;
        transcribing?: boolean;
        error?: string;
      };
      if (!res.ok || !data.entryId) throw new Error(data.error ?? `Couldn't save (${res.status})`);

      if (!data.transcribing) {
        router.push(`/entries/${data.entryId}?new=1`);
        return;
      }
      setStatus("Transcribing — this usually takes a minute or two. You can leave; it's saved.");
      await waitForTranscript(data.entryId);
      router.push(`/entries/${data.entryId}?new=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong saving that.");
      setStatus(null);
      setProgress(null);
      setBusy(false);
    }
  }

  async function waitForTranscript(entryId: string) {
    const deadline = Date.now() + 5 * 60_000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`/api/entries/${entryId}/transcription`);
        const data = (await res.json()) as { state?: string };
        if (data.state && data.state !== "PROCESSING") return;
      } catch {
        // transient — keep polling
      }
      await new Promise((r) => setTimeout(r, 4000));
    }
  }

  const coreBuckets = buckets.filter((b) => !b.optional);
  const optionalBuckets = buckets.filter((b) => b.optional);
  const chosenBucket = buckets.find((b) => b.slug === topicBucket);

  return (
    <div className="space-y-8">
      {/* --- 1. The prompt ------------------------------------------------ */}
      <section aria-label="What you're answering" className="card card-feature">
        {panel === "custom" ? (
          <div className="space-y-3">
            <label className="block">
              <span className="eyebrow">Your own question</span>
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                rows={2}
                maxLength={300}
                autoFocus
                placeholder="e.g. What was Grandpa's hardware store like?"
                className="field prose-entry mt-2"
              />
            </label>
            {!askInstead ? (
              <>
                <label className="flex items-center gap-2 text-sm text-ink-soft">
                  <input
                    type="checkbox"
                    checked={shareCustom}
                    onChange={(e) => setShareCustom(e.target.checked)}
                  />
                  Add it to our family&rsquo;s prompts so others can answer it too
                </label>
                <div className="flex flex-wrap gap-4 text-sm">
                  <button type="button" className="btn-text" onClick={() => setAskInstead(true)}>
                    Ask someone else this instead &rarr;
                  </button>
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => {
                      setPanel(null);
                      setCustomText("");
                    }}
                  >
                    Back to suggestions
                  </button>
                </div>
              </>
            ) : (
              <form action={askQuestion} className="space-y-3 border-t border-mist pt-3">
                <input type="hidden" name="text" value={customText} />
                <label className="block text-sm text-ink-soft">
                  Who should answer it?
                  <select name="askedOfMemberId" required defaultValue="" className="field mt-1">
                    <option value="" disabled>
                      Choose someone&hellip;
                    </option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-ink-soft">
                  <input type="checkbox" name="shareWithFamily" />
                  Also add it to our family&rsquo;s prompts
                </label>
                <p className="text-sm text-ink-soft">
                  They&rsquo;ll see it under &ldquo;Questions for you&rdquo; and get an email.
                  Their answer comes to you by default &mdash; they can change who receives it.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button type="submit" className="btn btn-primary" disabled={!customText.trim()}>
                    Send the question
                  </button>
                  <button type="button" className="btn-text text-sm" onClick={() => setAskInstead(false)}>
                    I&rsquo;ll answer it myself
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : prompt ? (
          <div>
            <p className="eyebrow">
              {prompt.byline ||
                [prompt.bucketTitle, prompt.subtopicTitle].filter(Boolean).join(" · ") ||
                "A question for you"}
            </p>
            <p className="prose-entry mt-2 text-ink">{prompt.text}</p>
          </div>
        ) : (
          <div>
            <p className="eyebrow">No prompt</p>
            <p className="prose-entry mt-2 text-ink">Share whatever is on your mind.</p>
          </div>
        )}

        {panel !== "custom" ? (
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-sm">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={loadingPrompt}
              onClick={() => nextPrompt()}
            >
              {loadingPrompt ? "Thinking…" : "Ask me something different"}
            </button>
            <button
              type="button"
              className="btn-text"
              onClick={() => setPanel(panel === "topics" ? null : "topics")}
            >
              Choose a topic
            </button>
            <button type="button" className="btn-text" onClick={() => setPanel("custom")}>
              Write my own question
            </button>
            <button
              type="button"
              className="btn-text"
              onClick={() => {
                setPrompt(null);
                setPanel(null);
              }}
            >
              No prompt &mdash; just share
            </button>
          </div>
        ) : null}

        {panel === "topics" ? (
          <div className="mt-5 space-y-3 border-t border-mist pt-4">
            <label className="block text-sm text-ink-soft">
              Topic
              <select
                value={topicBucket}
                onChange={(e) => {
                  setTopicBucket(e.target.value);
                  setTopicSubtopic("");
                }}
                className="field mt-1"
              >
                <option value="">Choose a topic&hellip;</option>
                {coreBuckets.map((b) => (
                  <option key={b.slug} value={b.slug}>
                    {b.title}
                  </option>
                ))}
                {optionalBuckets.length > 0 ? (
                  <optgroup label="More topics (optional)">
                    {optionalBuckets.map((b) => (
                      <option key={b.slug} value={b.slug}>
                        {b.title}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {familyPrompts.length > 0 ? <option value="__family">From our family</option> : null}
              </select>
            </label>

            {topicBucket === "__family" ? (
              <ul className="divide-y divide-mist">
                {familyPrompts.map((p) => (
                  <li key={p.promptId ?? p.text}>
                    <button
                      type="button"
                      className="w-full py-2 text-left"
                      onClick={() => {
                        setPrompt(p);
                        setPanel(null);
                      }}
                    >
                      <span className="text-ink">{p.text}</span>
                      {p.byline ? <span className="block text-xs text-ink-soft">{p.byline}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : chosenBucket ? (
              <>
                {chosenBucket.subtopics.length > 1 ? (
                  <label className="block text-sm text-ink-soft">
                    Narrow it down (optional)
                    <select
                      value={topicSubtopic}
                      onChange={(e) => setTopicSubtopic(e.target.value)}
                      className="field mt-1"
                    >
                      <option value="">Anything in {chosenBucket.title}</option>
                      {chosenBucket.subtopics.map((s) => (
                        <option key={s.slug} value={s.slug}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={loadingPrompt}
                  onClick={() => nextPrompt({ bucket: chosenBucket.slug, subtopic: topicSubtopic })}
                >
                  {loadingPrompt ? "Thinking…" : "Give me a question"}
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* --- 2. The answer ------------------------------------------------ */}
      {!(panel === "custom" && askInstead) ? (
        <section aria-label="Your answer">
          <div role="tablist" aria-label="How to answer" className="grid grid-cols-3 gap-2">
            {(
              [
                ["write", "Write"],
                ["voice", "Voice"],
                ["video", "Video"],
              ] as [Mode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                disabled={busy}
                onClick={() => setMode(m)}
                className={`btn ${mode === m ? "btn-primary" : "btn-secondary"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <form ref={formRef} action={createEntry} className="mt-6 space-y-5">
            {/* What's being answered — read by both the write form and recordings. */}
            <input type="hidden" name="promptText" value={usingCustom ? "" : prompt?.text ?? ""} />
            <input type="hidden" name="promptBucket" value={usingCustom ? "" : prompt?.bucket ?? ""} />
            <input type="hidden" name="promptSubtopic" value={usingCustom ? "" : prompt?.subtopic ?? ""} />
            <input type="hidden" name="promptId" value={usingCustom ? "" : prompt?.promptId ?? ""} />
            <input type="hidden" name="customPrompt" value={usingCustom ? customText.trim() : ""} />
            {usingCustom && shareCustom ? <input type="hidden" name="shareCustomPrompt" value="on" /> : null}

            {mode === "write" ? (
              <>
                <label className="block space-y-1">
                  <span className="text-sm text-ink-soft">Title (optional)</span>
                  <input
                    name="title"
                    maxLength={140}
                    placeholder={prompt?.text ? prompt.text.replace(/[?.]$/, "") : "A title"}
                    className="field"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm text-ink-soft">Your answer</span>
                  <textarea
                    name="body"
                    rows={10}
                    required
                    className="field prose-entry"
                    placeholder="Tell it the way you'd tell it out loud."
                  />
                </label>
                <MediaUpload label="Add a photo or video file (optional)" />
                <button type="submit" className="btn btn-primary w-full sm:w-auto">
                  Save draft
                </button>
                <p className="text-sm text-ink-soft">
                  Next you&rsquo;ll choose who receives it, and when. It stays a private
                  draft until you publish it.
                </p>
              </>
            ) : (
              <>
                <MediaUpload
                  label="Add a photo (optional)"
                  accept="image/*"
                  mediaTypeField={false}
                />
                <Recorder kind={mode} busy={busy} onUse={useRecording} />
              </>
            )}
          </form>

          {status ? (
            <div className="card card-muted mt-6 space-y-2" aria-live="polite">
              <p className="text-ink">{status}</p>
              {progress !== null ? (
                <div className="h-2 w-full overflow-hidden rounded-full bg-mist">
                  <div
                    className="h-full bg-well transition-[width]"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p className="mt-4 rounded-field border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </section>
      ) : null}

      <p className="text-center text-sm text-ink-soft">
        <Link href="/entries">See your wisdom</Link>
      </p>
    </div>
  );
}
