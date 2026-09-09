import { describe, expect, it } from "vitest";
import { PROMPT_THEMES, findTheme, promptAt } from "./prompts";

describe("the guided prompt library (spec §7)", () => {
  it("has all seven themes from the brief", () => {
    const titles = PROMPT_THEMES.map((t) => t.title);
    expect(titles).toEqual([
      "Origins",
      "Hard Times",
      "Work and Craft",
      "Love and Marriage",
      "What I Believe",
      "Advice I'd Give",
      "Things I Got Wrong",
    ]);
  });

  it("gives every theme several prompts", () => {
    for (const theme of PROMPT_THEMES) {
      expect(theme.prompts.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("keeps prompts short and specific — single open questions, not essay topics", () => {
    for (const theme of PROMPT_THEMES) {
      for (const prompt of theme.prompts) {
        // A single question: at most one sentence, ends with "?", not a "Describe..." directive.
        expect(prompt.length).toBeLessThanOrEqual(120);
        expect(prompt).not.toMatch(/^\s*(describe|tell me about your (childhood|life)\b)/i);
      }
    }
  });

  it("has unique theme slugs", () => {
    const slugs = PROMPT_THEMES.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("promptAt wraps around the list", () => {
    const theme = PROMPT_THEMES[0];
    expect(promptAt(theme, 0)).toBe(theme.prompts[0]);
    expect(promptAt(theme, theme.prompts.length)).toBe(theme.prompts[0]);
    expect(promptAt(theme, -1)).toBe(theme.prompts[theme.prompts.length - 1]);
  });

  it("findTheme resolves by slug", () => {
    expect(findTheme("origins")?.title).toBe("Origins");
    expect(findTheme("nope")).toBeUndefined();
    expect(findTheme(undefined)).toBeUndefined();
  });
});
