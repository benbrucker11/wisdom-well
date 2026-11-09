import { describe, expect, it } from "vitest";
import { cleanQuestion } from "./prompt-generation";

describe("cleanQuestion", () => {
  it("accepts one plain question", () => {
    expect(cleanQuestion("  What did your father keep in his toolbox?  ", [])).toBe(
      "What did your father keep in his toolbox?",
    );
  });

  it("strips wrapping quotes", () => {
    expect(cleanQuestion("“Who taught you to drive?”", [])).toBe("Who taught you to drive?");
  });

  it("rejects non-questions, compound questions, and junk", () => {
    expect(cleanQuestion("Tell me about your father.", [])).toBeNull();
    expect(cleanQuestion("Who was it? And why?", [])).toBeNull();
    expect(cleanQuestion("Why?", [])).toBeNull();
    expect(cleanQuestion(42, [])).toBeNull();
    expect(cleanQuestion(`${"x".repeat(220)}?`, [])).toBeNull();
  });

  it("rejects a repeat, ignoring case and punctuation", () => {
    expect(cleanQuestion("How did you know?", ["how did you KNOW"])).toBeNull();
  });
});
