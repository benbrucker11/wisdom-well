import { describe, expect, it } from "vitest";
import {
  CORE_BUCKETS,
  PROMPT_BUCKETS,
  daySeed,
  findBucket,
  findSubtopic,
  locatePrompt,
  promptAt,
  promptsIn,
  suggestPrompts,
} from "./prompts";

describe("the prompt library", () => {
  it("has the 14 core buckets plus optional Politics & Current Events", () => {
    expect(CORE_BUCKETS.map((b) => b.title)).toEqual([
      "Family History & Origins",
      "Relationships",
      "Faith & Beliefs",
      "Rites of Passage & Milestones",
      "Loss & Hard Times",
      "Money & Financial Habits",
      "Health & Wellness",
      "School & Education",
      "Work & Career",
      "Hobbies & Interests",
      "Fear & Excitement",
      "Things I Wish You Knew About Me",
      "Lessons & Regrets",
      "Encouragement for Future Generations",
    ]);
    const optional = PROMPT_BUCKETS.filter((b) => b.optional).map((b) => b.title);
    expect(optional).toEqual(["Politics & Current Events"]);
  });

  it("keeps Faith core (decided Nov 2026)", () => {
    expect(findBucket("faith-and-beliefs")?.optional).toBeFalsy();
  });

  it("marks Loss & Hard Times gentle and only it", () => {
    expect(PROMPT_BUCKETS.filter((b) => b.gentle).map((b) => b.slug)).toEqual([
      "loss-and-hard-times",
    ]);
  });

  it("suggests a release age only for Growing up", () => {
    const withAge = PROMPT_BUCKETS.flatMap((b) =>
      b.subtopics.filter((s) => s.suggestedReleaseAge).map((s) => `${b.slug}/${s.slug}`),
    );
    expect(withAge).toEqual(["rites-of-passage-and-milestones/growing-up"]);
    expect(
      findSubtopic(findBucket("rites-of-passage-and-milestones"), "growing-up")
        ?.suggestedReleaseAge,
    ).toBe(13);
  });

  it("gives every subtopic at least three questions, ~280 overall", () => {
    let total = 0;
    for (const b of PROMPT_BUCKETS) {
      for (const s of b.subtopics) {
        expect(s.prompts.length, `${b.slug}/${s.slug}`).toBeGreaterThanOrEqual(3);
        total += s.prompts.length;
      }
    }
    expect(total).toBeGreaterThanOrEqual(250);
  });

  it("keeps prompts short and specific — single open questions, not essay topics", () => {
    for (const prompt of PROMPT_BUCKETS.flatMap((b) => promptsIn(b))) {
      expect(prompt.length).toBeLessThanOrEqual(120);
      expect(prompt).toMatch(/[?.]$/);
      expect(prompt).not.toMatch(/^\s*(describe|tell me about your (childhood|life)\b)/i);
    }
  });

  it("keeps every original prompt from the first seven themes", () => {
    for (const original of [
      "What did your mother do when money was tight?",
      "How did you know?",
      "What apology did you never make?",
      "If a grandchild came to you broke and ashamed, what would you say first?",
    ]) {
      expect(locatePrompt(original), original).toBeDefined();
    }
  });

  it("has unique slugs", () => {
    const slugs = PROMPT_BUCKETS.map((b) => b.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const b of PROMPT_BUCKETS) {
      const sub = b.subtopics.map((s) => s.slug);
      expect(new Set(sub).size).toBe(sub.length);
    }
  });

  it("promptAt wraps around the list", () => {
    const list = ["a?", "b?", "c?"];
    expect(promptAt(list, 0)).toBe("a?");
    expect(promptAt(list, 3)).toBe("a?");
    expect(promptAt(list, -1)).toBe("c?");
  });

  it("findBucket / findSubtopic resolve by slug", () => {
    expect(findBucket("relationships")?.title).toBe("Relationships");
    expect(findBucket("nope")).toBeUndefined();
    expect(findBucket(undefined)).toBeUndefined();
    expect(findSubtopic(findBucket("relationships"), "the-one")?.title).toBe(
      "The One (White Buffalo)",
    );
  });
});

describe("suggestPrompts", () => {
  const none = { bucketCounts: {}, answered: new Set<string>() };

  it("never raises gentle or optional buckets unprompted", () => {
    for (let seed = 0; seed < 200; seed++) {
      const [s] = suggestPrompts({ ...none, seed, count: 14 });
      expect(s.bucket.gentle).toBeFalsy();
      expect(s.bucket.optional).toBeFalsy();
    }
  });

  it("allows them once the person has opened them", () => {
    const picks = suggestPrompts({
      bucketCounts: Object.fromEntries(
        CORE_BUCKETS.filter((b) => !b.gentle).map((b) => [b.slug, 10]),
      ),
      answered: new Set(),
      seed: 1,
      count: 20,
    });
    expect(picks.some((p) => p.bucket.gentle)).toBe(false);

    const opened = suggestPrompts({
      bucketCounts: { "loss-and-hard-times": 1, ...Object.fromEntries(
        CORE_BUCKETS.filter((b) => !b.gentle).map((b) => [b.slug, 10]),
      ) },
      answered: new Set(),
      seed: 1,
      count: 1,
    });
    expect(opened[0].bucket.slug).toBe("loss-and-hard-times");
  });

  it("favours the least-explored bucket", () => {
    const counts = Object.fromEntries(CORE_BUCKETS.map((b) => [b.slug, 5]));
    counts["money-and-financial-habits"] = 0;
    const [pick] = suggestPrompts({ bucketCounts: counts, answered: new Set(), seed: 7 });
    expect(pick.bucket.slug).toBe("money-and-financial-habits");
  });

  it("skips questions already answered", () => {
    const money = findBucket("money-and-financial-habits")!;
    const answered = new Set(promptsIn(money).slice(1));
    const counts = Object.fromEntries(CORE_BUCKETS.map((b) => [b.slug, 5]));
    counts[money.slug] = 0;
    const [pick] = suggestPrompts({ bucketCounts: counts, answered, seed: 3 });
    expect(pick.text).toBe(promptsIn(money)[0]);
  });

  it("returns distinct buckets and is stable for a seed", () => {
    const a = suggestPrompts({ ...none, seed: 42, count: 3 });
    const b = suggestPrompts({ ...none, seed: 42, count: 3 });
    expect(a.map((p) => p.text)).toEqual(b.map((p) => p.text));
    expect(new Set(a.map((p) => p.bucket.slug)).size).toBe(3);
  });

  it("daySeed changes by day and by salt", () => {
    const d = new Date("2026-11-09T12:00:00Z");
    expect(daySeed(d, "x")).toBe(daySeed(new Date("2026-11-09T01:00:00Z"), "x"));
    expect(daySeed(d, "x")).not.toBe(daySeed(d, "y"));
  });
});
