import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reconcileTranscript } from "./reconcile";

// These tests exercise the offline fallback path only — no network, no API key.
describe("reconcileTranscript — fallback (no Anthropic credential)", () => {
  let savedKey: string | undefined;
  let savedToken: string | undefined;

  beforeEach(() => {
    savedKey = process.env.ANTHROPIC_API_KEY;
    savedToken = process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
  });
  afterEach(() => {
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
    if (savedToken !== undefined) process.env.ANTHROPIC_AUTH_TOKEN = savedToken;
  });

  it("produces an editable draft without calling out", async () => {
    const result = await reconcileTranscript({
      transcriptRaw:
        "Speaker A: Um, well, you know, my daddy he worked the, uh, the night shift at the mill.",
      promptText: "What did your father do for a living?",
    });
    expect(result.reconciledByAI).toBe(false);
    expect(result.body.length).toBeGreaterThan(0);
    // Keeps the speaker's own words ("my daddy"), strips filler + the lone speaker tag.
    expect(result.body).toContain("my daddy");
    expect(result.body).not.toMatch(/^Speaker A:/);
    expect(result.body.toLowerCase()).not.toContain("um,");
  });

  it("derives a title from the prompt when there's no AI title", async () => {
    const result = await reconcileTranscript({
      transcriptRaw: "It was a hard winter.",
      promptText: "Tell me about a year when things were genuinely hard.",
    });
    expect(result.title).toMatch(/hard/i);
  });

  it("keeps both speakers' tags when a second person chimes in", async () => {
    const result = await reconcileTranscript({
      transcriptRaw:
        "Speaker A: We left in 1951.\n\nSpeaker B: It was 1952, dear.\n\nSpeaker A: Fifty-two, then.",
      promptText: null,
    });
    expect(result.body).toContain("Speaker A:");
    expect(result.body).toContain("Speaker B:");
    expect(result.title).toBe("A memory");
  });

  it("never invents content — the fallback body is derived only from the transcript", async () => {
    const raw = "I planted the walnut tree the year Sofia was born.";
    const result = await reconcileTranscript({ transcriptRaw: raw, promptText: null });
    // Every alphabetic token in the output also appears in the input.
    const inputWords = new Set(raw.toLowerCase().match(/[a-z']+/g));
    for (const w of result.body.toLowerCase().match(/[a-z']+/g) ?? []) {
      expect(inputWords.has(w)).toBe(true);
    }
  });
});
