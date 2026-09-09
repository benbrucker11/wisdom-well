/**
 * The guided prompt library (spec §7).
 *
 * The goal is not a questionnaire. Each prompt is a single, concrete, open
 * question meant to unlock a memory the person wasn't already thinking about —
 * "What did your mother do when money was tight?", not "Describe your
 * childhood". The interview flow shows one at a time, lets the person skip
 * freely, and never tracks completion.
 */

export interface PromptTheme {
  slug: string;
  title: string;
  blurb: string;
  prompts: string[];
}

export const PROMPT_THEMES: PromptTheme[] = [
  {
    slug: "origins",
    title: "Origins",
    blurb: "Where the family came from, and how.",
    prompts: [
      "Where did our family come from, and why did they leave?",
      "What's the story of how your parents met?",
      "What was the house you grew up in like — the rooms, the smell, the noise?",
      "Who were you named after, and did the name fit?",
      "What did your grandparents do for a living?",
      "What language was spoken at home when you were small?",
      "What's the oldest thing you remember?",
    ],
  },
  {
    slug: "hard-times",
    title: "Hard Times",
    blurb: "The years that tested us.",
    prompts: [
      "What did your mother do when money was tight?",
      "Tell me about a year when things were genuinely hard.",
      "Was there ever a time you thought the family might not make it?",
      "Who helped us when we needed it, and were we ever able to pay it back?",
      "What did you go without, and did you mind at the time?",
      "What got you through a loss you didn't think you'd get through?",
    ],
  },
  {
    slug: "work-and-craft",
    title: "Work and Craft",
    blurb: "What we made, fixed, and knew how to do.",
    prompts: [
      "What was your first real job, and what did it teach you?",
      "What's something you know how to do with your hands that few people can anymore?",
      "Who taught you your trade, and what were they like to learn from?",
      "What's a piece of work you're still proud of?",
      "Tell me about a boss or a mentor who changed how you worked.",
      "What did a normal working day look like for you at 30?",
    ],
  },
  {
    slug: "love-and-marriage",
    title: "Love and Marriage",
    blurb: "The people we chose.",
    prompts: [
      "How did you know?",
      "What was the first year of marriage actually like?",
      "What's something you argued about for years and eventually let go of?",
      "What did you learn about love from watching your own parents?",
      "Tell me about a small ordinary day together that you'd live again.",
      "What advice about marriage did you ignore, and were they right?",
    ],
  },
  {
    slug: "what-i-believe",
    title: "What I Believe",
    blurb: "The convictions that held.",
    prompts: [
      "What do you believe now that you didn't believe at 25?",
      "What's a rule you've tried to live by?",
      "What do you think happens when we die?",
      "What's worth spending money on, and what isn't?",
      "What did faith — or the absence of it — give you?",
      "What would you defend even if it cost you?",
    ],
  },
  {
    slug: "advice",
    title: "Advice I'd Give",
    blurb: "What we'd want the next one to know.",
    prompts: [
      "What do you wish someone had told you at eighteen?",
      "How do you know when to walk away from something?",
      "What's the right way to treat people who can do nothing for you?",
      "What should you never borrow, and what should you never lend?",
      "What's the difference between being careful and being afraid?",
      "If a grandchild came to you broke and ashamed, what would you say first?",
    ],
  },
  {
    slug: "things-i-got-wrong",
    title: "Things I Got Wrong",
    blurb: "The mistakes worth passing on.",
    prompts: [
      "What's a decision you'd make differently, knowing what you know now?",
      "Who did you misjudge, and how did you find out?",
      "What did you hold onto for too long?",
      "Tell me about a time your pride cost you something.",
      "What did you get wrong about one of your own children?",
      "What apology did you never make?",
    ],
  },
];

export function findTheme(slug: string | undefined): PromptTheme | undefined {
  return PROMPT_THEMES.find((t) => t.slug === slug);
}

/** A stable pick of one prompt within a theme, by index (wraps). */
export function promptAt(theme: PromptTheme, index: number): string {
  const n = theme.prompts.length;
  return theme.prompts[((index % n) + n) % n];
}
