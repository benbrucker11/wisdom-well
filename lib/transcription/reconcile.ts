// Server-only in practice (env-gated API keys, vendor SDKs); not importing "server-only"
// so the e2e script can drive it under plain Node.
import Anthropic from "@anthropic-ai/sdk";

/**
 * Turn a raw spoken transcript into a readable written entry, in the speaker's
 * own voice (spec §6, step 4).
 *
 * The model is told, explicitly, not to smooth the speaker into generic prose
 * and not to add anything that wasn't said. If the Anthropic API isn't
 * configured or the call fails, we fall back to a light mechanical cleanup so
 * the pipeline still produces an editable draft — the author reviews it either
 * way, and the original audio is always attached.
 */

export interface Reconciled {
  title: string;
  body: string;
  reconciledByAI: boolean;
}

const SYSTEM = `You are helping a family preserve someone's spoken memory as a written entry for a private family archive.

You will receive a raw, automatically generated transcript of someone speaking — usually rambling, with false starts, repetition, tangents, and often a second person (a spouse, a child, whoever is asking the questions) chiming in.

Turn it into a clean, readable, first-person written entry WITHOUT changing whose voice it is.

Rules:
- Keep the speaker's own words, idiom, and rhythm. If they say "my daddy", keep "my daddy" — do not upgrade it to "my father". A slightly uneven, personal voice is the whole point.
- Do NOT rewrite them into smooth, generic prose.
- Remove only the mechanical debris of speech: filler words, stutters, repeated false starts, transcription noise, and interjections from the other speaker that aren't part of the story.
- Keep the speaker's order. Only join passages where they clearly circled back to the same thread.
- NEVER add a fact, name, date, place, or detail that is not in the transcript. If something is unclear, leave it as they said it or leave it out. Do not invent.
- Write a short, plain title in the speaker's own register — not a headline. Three to eight words.

Return ONLY a JSON object of the form {"title": "...", "body": "..."} with no other text. The body is the cleaned entry as plain paragraphs separated by blank lines.`;

function anthropicConfigured(): boolean {
  return Boolean(
    process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
  );
}

export function reconciliationConfigured(): boolean {
  return anthropicConfigured();
}

/** Strip interviewer lines and speaker tags when there's really one speaker. */
function lightClean(transcriptRaw: string): string {
  const lines = transcriptRaw.split("\n");
  const speakerTags = new Set(
    lines
      .map((l) => l.match(/^Speaker ([A-Z]):/)?.[1])
      .filter((x): x is string => Boolean(x)),
  );

  let text = transcriptRaw;
  if (speakerTags.size <= 1) {
    text = lines.map((l) => l.replace(/^Speaker [A-Z]:\s*/, "")).join("\n");
  }
  return text
    .replace(/\b(um+|uh+|erm|hmm)\b[,.]?\s+/gi, "")
    .replace(/\b(you know|i mean)\b[,.]?\s+/gi, "")
    .replace(/^\s*[,.]\s*/gm, "")
    .replace(/\s+([,.])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function titleFromPrompt(promptText: string | null): string {
  if (promptText) {
    return promptText.replace(/[?.]$/, "").slice(0, 70);
  }
  return "A memory";
}

/** The offline cleanup — a mechanical draft the author always gets, fast. */
export function mechanicalReconcile(
  transcriptRaw: string,
  promptText: string | null,
): { title: string; body: string } {
  return { title: titleFromPrompt(promptText), body: lightClean(transcriptRaw) };
}

function extractJson(text: string): { title?: unknown; body?: unknown } | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function reconcileTranscript(input: {
  transcriptRaw: string;
  promptText: string | null;
}): Promise<Reconciled> {
  const fallback = (): Reconciled => ({
    ...mechanicalReconcile(input.transcriptRaw, input.promptText),
    reconciledByAI: false,
  });

  if (!anthropicConfigured()) return fallback();

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      // Reformatting a transcript into readable prose is not a high-reasoning
      // task; low effort keeps the call fast enough to finish inside a
      // serverless request window.
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            input.promptText
              ? `The speaker was answering this question: "${input.promptText}"`
              : "The speaker was recording an open memory.",
            "",
            "Raw transcript:",
            '"""',
            input.transcriptRaw,
            '"""',
          ].join("\n"),
        },
      ],
    });

    if (response.stop_reason === "refusal") return fallback();

    const textBlock = response.content.find((b) => b.type === "text");
    const parsed = textBlock && "text" in textBlock ? extractJson(textBlock.text) : null;

    const title = typeof parsed?.title === "string" ? parsed.title.trim() : "";
    const body = typeof parsed?.body === "string" ? parsed.body.trim() : "";
    if (!body) return fallback();

    return {
      title: title || titleFromPrompt(input.promptText),
      body,
      reconciledByAI: true,
    };
  } catch (err) {
    console.error("reconcileTranscript: Anthropic call failed, using fallback", err);
    return fallback();
  }
}
