/**
 * The prompt library — buckets → subtopics → sample questions.
 *
 * Merged (Nov 2026) from Ben's, Jared's and Gabe's lists plus the original
 * seven themes; the reviewed source is docs/specs/prompt-library-draft.md.
 * Every prompt is one concrete, open question meant to unlock a specific
 * memory — "What did your mother do when money was tight?", not "Describe your
 * childhood."
 *
 * Pure data + pure helpers; no database, safe to import anywhere.
 *
 * - `optional` buckets (Politics & Current Events) sit under "More topics" and
 *   are never suggested unless the person has already answered one.
 * - `gentle` buckets (Loss & Hard Times) are never suggested in reminders or on
 *   the dashboard unless the person has opened them themselves.
 * - `suggestedReleaseAge` on a subtopic (Growing up) pre-suggests a release
 *   rule; the author can change it.
 */

export interface PromptSubtopic {
  slug: string;
  title: string;
  prompts: string[];
  /** Suggest "release when the recipient turns N" for wisdom on this subtopic. */
  suggestedReleaseAge?: number;
}

export interface PromptBucket {
  slug: string;
  title: string;
  blurb: string;
  optional?: boolean;
  gentle?: boolean;
  subtopics: PromptSubtopic[];
}

export const PROMPT_BUCKETS: PromptBucket[] = [
  {
    slug: "family-history-and-origins",
    title: "Family History & Origins",
    blurb: "Where we came from, and the home that made us.",
    subtopics: [
      {
        slug: "where-we-came-from",
        title: "Where we came from",
        prompts: [
          "Where did our family come from, and why did they leave?",
          "What do you know about the first of our family to come to this country or this town?",
          "Which ancestor do you wish you could have met, and why?",
          "What family story gets told at every gathering — and how much of it is true?",
          "Is there a family heirloom, and what's the story behind it?",
        ],
      },
      {
        slug: "your-parents-story",
        title: "Your parents' story",
        prompts: [
          "What's the story of how your parents met?",
          "What did your grandparents do for a living?",
          "What was your father like when no one else was around?",
          "What was your mother's kitchen like?",
          "What did your parents sacrifice that you didn't understand until later?",
        ],
      },
      {
        slug: "the-home-you-grew-up-in",
        title: "The home you grew up in",
        prompts: [
          "What was the house you grew up in like — the rooms, the smell, the noise?",
          "What's the oldest thing you remember?",
          "What language was spoken at home when you were small?",
          "Who were you named after, and did the name fit?",
          "What did a Sunday look like in your house growing up?",
        ],
      },
      {
        slug: "traditions",
        title: "Traditions",
        prompts: [
          "What tradition from your childhood do you hope never dies?",
          "How did our family celebrate Christmas (or the holidays) when you were young?",
          "What's a family recipe, and who taught it to you?",
          "What's a tradition you started yourself, and why?",
          "What did our family do that you thought every family did, until you found out they didn't?",
        ],
      },
    ],
  },
  {
    slug: "relationships",
    title: "Relationships",
    blurb: "The people who shaped us — and the ones we chose.",
    subtopics: [
      {
        slug: "parents-as-a-child",
        title: "Parents — as a child",
        prompts: [
          "What's something your father taught you without ever saying it?",
          "What's something your mother said that still comes back to you?",
          "When did you first see your parents as people, not just parents?",
          "How were you disciplined, and what do you think of it now?",
          "What did you learn about love from watching your own parents?",
        ],
      },
      {
        slug: "parents-as-a-parent",
        title: "Parents — as a parent",
        prompts: [
          "What was the moment you first felt like a parent?",
          "What did you do differently from your own parents, on purpose?",
          "What did you get wrong about one of your own children?",
          "What's the hardest conversation you ever had with one of your kids?",
          "What do you hope your children say about how they were raised?",
          "What did your kids teach you?",
        ],
      },
      {
        slug: "siblings",
        title: "Siblings",
        prompts: [
          "What was your role among your brothers and sisters?",
          "What's the worst trouble you and a sibling got into together?",
          "Who in the family were you closest to growing up, and did that change?",
          "Tell me about a fight with a sibling you still think about.",
          "What do you wish you'd said to a brother or sister while you could?",
        ],
      },
      {
        slug: "grandparents-and-grandchildren",
        title: "Grandparents & grandchildren",
        prompts: [
          "What do you remember about your grandparents' house?",
          "What did a grandparent teach you that your parents didn't?",
          "What's a saying or habit you picked up from a grandparent?",
          "What do you want your grandchildren to know about you that your children might forget to tell them?",
          "What does being a grandparent give you that being a parent didn't?",
        ],
      },
      {
        slug: "extended-family",
        title: "Extended family — aunts, uncles, cousins",
        prompts: [
          "Which aunt or uncle shaped you the most, and how?",
          "Who was the character of the extended family?",
          "What were big family gatherings like when you were a kid?",
          "Which cousin were you closest to, and what did you get up to?",
          "Who in the extended family held everyone together?",
        ],
      },
      {
        slug: "childhood-friendships",
        title: "Childhood friendships",
        prompts: [
          "Who was your best friend as a kid, and what did you do all day?",
          "Where did you and your friends go when you didn't want adults around?",
          "Tell me about a friend you lost touch with and still wonder about.",
          "What did you and your friends get away with that you'd never tell your parents?",
          "Who was the first friend who really knew you?",
        ],
      },
      {
        slug: "lifelong-friendships",
        title: "Lifelong friendships",
        prompts: [
          "Who is the friend who's been there the longest, and how did it start?",
          "What has kept that friendship alive through the years?",
          "Tell me about a time a friend showed up when you needed it most.",
          "What's a friendship you let go of, and was it the right call?",
          "What makes someone worth keeping as a friend?",
        ],
      },
      {
        slug: "first-love",
        title: "First love",
        prompts: [
          "Who was your first crush, and did they ever know?",
          "Tell me about your first date.",
          "What did your first love teach you?",
          "What did you think love was at sixteen?",
        ],
      },
      {
        slug: "bad-breakups",
        title: "Bad breakups",
        prompts: [
          "What's a breakup that hurt more than you let on?",
          "What did a relationship ending teach you about yourself?",
          "How did you get over someone?",
          "What would you tell a grandchild going through their first heartbreak?",
        ],
      },
      {
        slug: "the-one",
        title: "The One (White Buffalo)",
        prompts: [
          "How did you know?",
          "What's the story of how you met?",
          "What did you notice first, and what did you notice last?",
          "What made you sure enough to commit?",
          "Was there a moment you almost missed each other?",
        ],
      },
      {
        slug: "marriage",
        title: "Marriage",
        prompts: [
          "What was the first year of marriage actually like?",
          "What's something you argued about for years and eventually let go of?",
          "Tell me about a small ordinary day together that you'd live again.",
          "What advice about marriage did you ignore, and were they right?",
          "What keeps a marriage going when the feelings run thin?",
          "How did you two handle money, in-laws, and who does the dishes?",
        ],
      },
      {
        slug: "community",
        title: "Community",
        prompts: [
          "Who helped us when we needed it, and were we ever able to pay it back?",
          "What did your church or community look like growing up?",
          "Who was a neighbor you'll never forget?",
          "How have you tried to serve the people around you?",
          "What does a good neighbor do?",
        ],
      },
      {
        slug: "pets",
        title: "Pets",
        prompts: [
          "Tell me about the first pet you loved.",
          "What's the funniest thing a family pet ever did?",
          "What did losing a pet teach you?",
          "Which animal in your life do you still miss?",
        ],
      },
    ],
  },
  {
    slug: "faith-and-beliefs",
    title: "Faith & Beliefs",
    blurb: "What we believe, and the ideals that guide this family.",
    subtopics: [
      {
        slug: "faith",
        title: "Faith",
        prompts: [
          "How did your faith begin — was there a moment, or was it always there?",
          "What did faith — or the absence of it — give you?",
          "Tell me about a season when your faith was tested.",
          "What prayer did you pray the most, and how was it answered?",
          "What do you think happens when we die?",
          "Which verse, hymn, or teaching has carried you, and why?",
          "How did you pass your faith on to your children, and what would you do differently?",
        ],
      },
      {
        slug: "the-ideals-that-guide-our-family",
        title: "The ideals that guide our family",
        prompts: [
          "What's a rule you've tried to live by?",
          "What do you believe now that you didn't believe at 25?",
          "What would you defend even if it cost you?",
          "What does our family stand for, in one sentence?",
          "What's the right way to treat people who can do nothing for you?",
          "What value do you hope every generation of this family keeps?",
        ],
      },
    ],
  },
  {
    slug: "rites-of-passage-and-milestones",
    title: "Rites of Passage & Milestones",
    blurb: "The firsts and the big days.",
    subtopics: [
      {
        slug: "first-times",
        title: "First times",
        prompts: [
          "What was your first car, and where did you drive it?",
          "Tell me about the first time you lived on your own.",
          "What was the first thing you bought with your own money?",
          "What's a first time you'll never forget?",
          "When did you first feel like an adult?",
        ],
      },
      {
        slug: "growing-up",
        title: "Growing up",
        suggestedReleaseAge: 13,
        prompts: [
          "What do you remember about the years your body and your mind were changing?",
          "Who explained growing up to you, and how did it go?",
          "What do you wish someone had told you about growing up?",
          "How did you handle feeling awkward or out of place as a teenager?",
          "What would you want a grandchild to know as they go through it?",
        ],
      },
      {
        slug: "graduation",
        title: "Graduation",
        prompts: [
          "What do you remember about your graduation day?",
          "What did you think your life would look like after graduating?",
          "Who made it possible for you to finish?",
          "What's one thing you'd tell yourself on the day you graduated?",
        ],
      },
      {
        slug: "the-proposal",
        title: "The proposal",
        prompts: [
          "Tell me the story of the proposal — every detail you remember.",
          "How long did you know before you asked (or were asked)?",
          "Who did you tell first?",
          "What were you most nervous about?",
        ],
      },
      {
        slug: "the-wedding",
        title: "The wedding",
        prompts: [
          "What do you remember most about your wedding day?",
          "What went wrong on the day, and does it matter now?",
          "What did your vows mean to you then, and what do they mean now?",
          "What advice would you give a grandchild the night before their wedding?",
        ],
      },
      {
        slug: "having-a-child",
        title: "Having a child",
        prompts: [
          "What was the day your first child was born like?",
          "What surprised you most about becoming a parent?",
          "How did you choose your children's names?",
          "What did you worry about most in those first months?",
          "What do you want each of your children to know about the day they arrived?",
        ],
      },
    ],
  },
  {
    slug: "loss-and-hard-times",
    title: "Loss & Hard Times",
    blurb: "The years that tested us, and what carried us through.",
    gentle: true,
    subtopics: [
      {
        slug: "losing-a-grandparent",
        title: "Losing a grandparent",
        prompts: [
          "Which grandparent's death was the first loss you remember?",
          "What did you learn about grief from how your family handled it?",
          "What do you still carry from them?",
          "What do you wish you'd asked them?",
        ],
      },
      {
        slug: "losing-a-parent",
        title: "Losing a parent",
        prompts: [
          "What were the last good conversations you had with your mother or father?",
          "What did you learn about them after they were gone?",
          "How did losing a parent change you?",
          "What did they leave you that wasn't in the will?",
          "What got you through a loss you didn't think you'd get through?",
        ],
      },
      {
        slug: "losing-a-spouse",
        title: "Losing a spouse",
        prompts: [
          "What do you miss most in an ordinary day?",
          "What did they teach you that you still use?",
          "How did you find your way forward?",
          "What would you want someone newly widowed to know?",
        ],
      },
      {
        slug: "losing-a-child",
        title: "Losing a child",
        prompts: [
          "What do you want the family to remember about them?",
          "What has helped you carry it, even a little?",
          "What would you want someone walking this road to hear from you?",
          "How has your faith, or your view of life, changed since?",
        ],
      },
      {
        slug: "divorce",
        title: "Divorce",
        prompts: [
          "What do you understand now about why it ended?",
          "How did you protect the kids, and what would you do differently?",
          "What did you have to rebuild, and how?",
          "What would you tell a grandchild whose marriage is in trouble?",
        ],
      },
      {
        slug: "lean-years",
        title: "Lean years",
        prompts: [
          "What did your mother do when money was tight?",
          "Tell me about a year when things were genuinely hard.",
          "Was there ever a time you thought the family might not make it?",
          "What did you go without, and did you mind at the time?",
        ],
      },
    ],
  },
  {
    slug: "money-and-financial-habits",
    title: "Money & Financial Habits",
    blurb: "Earning, saving, spending, and what it taught us.",
    subtopics: [
      {
        slug: "earning",
        title: "Earning",
        prompts: [
          "What was your first paycheck, and what did you do with it?",
          "How did your family talk about money growing up — or did they?",
          "What's the most important thing you've learned about earning a living?",
          "When did you first feel financially secure, if ever?",
          "What's worth spending money on, and what isn't?",
        ],
      },
      {
        slug: "budgeting",
        title: "Budgeting",
        prompts: [
          "How did you and your spouse decide where the money went?",
          "What's a money habit you wish you'd started at 20?",
          "What should you never borrow, and what should you never lend?",
          "What's the biggest financial mistake you made, and what did it cost?",
          "How did you teach your kids about money?",
        ],
      },
      {
        slug: "investing",
        title: "Investing",
        prompts: [
          "What was your first investment, and how did it go?",
          "What do you wish you'd known about investing earlier?",
          "What's the best financial advice you ever got?",
          "What's a financial risk you took — and would you take it again?",
        ],
      },
      {
        slug: "real-estate",
        title: "Real estate",
        prompts: [
          "Tell me about buying your first home.",
          "What did you learn about owning property that no one tells you?",
          "Which home did you love most, and why did you leave it?",
          "What would you look for in a house if you were buying today?",
        ],
      },
      {
        slug: "retirement",
        title: "Retirement",
        prompts: [
          "When did you start planning for retirement, and was it soon enough?",
          "What did retirement turn out to be like, compared to what you pictured?",
          "What do you wish you'd saved for — or spent on — sooner?",
          "How do you think about leaving something behind for your family?",
        ],
      },
    ],
  },
  {
    slug: "health-and-wellness",
    title: "Health & Wellness",
    blurb: "Taking care of the mind and the body.",
    subtopics: [
      {
        slug: "mindset",
        title: "Mindset",
        prompts: [
          "How do you get yourself out of a dark mood?",
          "What's the difference between being careful and being afraid?",
          "What thought pattern did you have to unlearn?",
          "How do you handle worry about things you can't control?",
          "What does a good day feel like for you?",
        ],
      },
      {
        slug: "journaling",
        title: "Journaling",
        prompts: [
          "Did you ever keep a journal or diary? What was in it?",
          "What do you write down that you want to remember?",
          "If you could read one page from your younger self, which year would it be?",
          "What habit helps you make sense of your own life?",
        ],
      },
      {
        slug: "meditation-and-prayer",
        title: "Meditation & prayer",
        prompts: [
          "How do you quiet your mind?",
          "Where do you go to think?",
          "What does stillness look like in your day?",
          "What daily practice keeps you steady?",
        ],
      },
      {
        slug: "diet-and-recipes",
        title: "Diet & recipes",
        prompts: [
          "What's a family recipe that should never be lost — and how exactly is it made?",
          "What did you eat growing up that you can't find anymore?",
          "What's your go-to meal when someone needs comfort?",
          "What did you learn about food and health the hard way?",
          "Who taught you to cook?",
        ],
      },
      {
        slug: "exercise",
        title: "Exercise",
        prompts: [
          "What kept you moving through the years?",
          "What did you learn about your body as you got older?",
          "What would you tell a grandchild about taking care of themselves?",
          "What's a physical accomplishment you're proud of?",
        ],
      },
      {
        slug: "sleep",
        title: "Sleep",
        prompts: [
          "What helps you sleep when your mind won't stop?",
          "How has rest changed for you over the years?",
          "What did you sacrifice sleep for, and was it worth it?",
        ],
      },
      {
        slug: "advice-from-doctors",
        title: "Advice from doctors",
        prompts: [
          "What's the best health advice a doctor ever gave you?",
          "What health issue runs in our family that the next generation should know about?",
          "What do you wish you'd gotten checked sooner?",
          "How did you face a hard diagnosis?",
        ],
      },
    ],
  },
  {
    slug: "school-and-education",
    title: "School & Education",
    blurb: "Classrooms, teachers, and what we learned outside them.",
    subtopics: [
      {
        slug: "middle-school",
        title: "Middle school",
        prompts: [
          "What were you like at twelve?",
          "Who was the teacher you remember from those years, good or bad?",
          "What did you care about most in middle school?",
          "What's a moment from those years you still think about?",
        ],
      },
      {
        slug: "high-school",
        title: "High school",
        prompts: [
          "What group were you in during high school, and did it fit?",
          "Which teacher changed the way you thought?",
          "What's the dumbest thing you did in high school?",
          "What did you want to be when you graduated?",
          "What would you tell a grandchild starting high school?",
        ],
      },
      {
        slug: "college-and-beyond",
        title: "College & beyond",
        prompts: [
          "How did you choose what came after high school — college, a trade, work, service?",
          "What did you learn outside the classroom?",
          "Who did you meet there that mattered?",
          "Was the education worth the cost, looking back?",
          "What do you wish you'd studied?",
        ],
      },
    ],
  },
  {
    slug: "work-and-career",
    title: "Work & Career",
    blurb: "What we made, fixed, and knew how to do.",
    subtopics: [
      {
        slug: "early-jobs",
        title: "Early jobs",
        prompts: [
          "What was your first real job, and what did it teach you?",
          "What did a normal working day look like for you at 30?",
          "What was the worst job you ever had?",
          "How did you find your way into the work you did for most of your life?",
        ],
      },
      {
        slug: "mentors-and-bosses",
        title: "Mentors & bosses",
        prompts: [
          "Who taught you your trade, and what were they like to learn from?",
          "Tell me about a boss or a mentor who changed how you worked.",
          "Who did you mentor, and what did you try to pass on?",
          "What makes someone worth following?",
        ],
      },
      {
        slug: "craft-and-pride",
        title: "Craft & pride",
        prompts: [
          "What's something you know how to do with your hands that few people can anymore?",
          "What's a piece of work you're still proud of?",
          "What did your work give you besides a paycheck?",
        ],
      },
      {
        slug: "hard-decisions",
        title: "Hard decisions",
        prompts: [
          "What's the hardest career decision you made?",
          "Tell me about a time you were fired, laid off, or quit.",
          "How did you balance work and family, and what would you change?",
          "When did you choose family over work — or work over family — and how do you feel about it now?",
        ],
      },
    ],
  },
  {
    slug: "hobbies-and-interests",
    title: "Hobbies & Interests",
    blurb: "What we loved doing for its own sake.",
    subtopics: [
      {
        slug: "sports-and-fitness",
        title: "Sports & fitness",
        prompts: [
          "What sport did you love playing, and what position?",
          "Tell me about a game you'll never forget.",
          "Which team did our family root for, and why?",
          "What did sports teach you that nothing else could?",
        ],
      },
      {
        slug: "music",
        title: "Music",
        prompts: [
          "What music was playing in the house when you were growing up?",
          "What song takes you straight back to a specific moment?",
          "Did you play an instrument? Who taught you?",
          "What song do you want played at your funeral, and why?",
        ],
      },
      {
        slug: "gaming",
        title: "Gaming",
        prompts: [
          "What games did you play as a kid — board, card, video, outside?",
          "Who did you play with, and who always won?",
          "What's a game our family should keep playing together?",
        ],
      },
      {
        slug: "other-passions",
        title: "Other passions",
        prompts: [
          "What hobby has stayed with you the longest?",
          "What did you love doing that no one else in the family understood?",
          "If you had a free year, what would you spend it learning?",
        ],
      },
    ],
  },
  {
    slug: "fear-and-excitement",
    title: "Fear & Excitement",
    blurb: "What scared us, and what we couldn't wait for.",
    subtopics: [
      {
        slug: "general",
        title: "Fear & Excitement",
        prompts: [
          "What scared you most as a child, and what scares you now?",
          "What's the bravest thing you've ever done?",
          "What were you most excited about at 20, and did it happen?",
          "Tell me about a time fear kept you from something — and a time it didn't.",
          "What are you looking forward to right now?",
          "What do you hope the next generation isn't afraid of?",
        ],
      },
    ],
  },
  {
    slug: "things-i-wish-you-knew-about-me",
    title: "Things I Wish You Knew About Me",
    blurb: "The parts of me you might not see.",
    subtopics: [
      {
        slug: "general",
        title: "Things I Wish You Knew About Me",
        prompts: [
          "What's something about you that would surprise your family?",
          "What do people get wrong about you?",
          "What were you like before you were a parent or grandparent?",
          "What's a dream you never told anyone?",
          "What are you proudest of that nobody ever noticed?",
          "What do you want to be remembered for?",
        ],
      },
    ],
  },
  {
    slug: "lessons-and-regrets",
    title: "Lessons & Regrets",
    blurb: "The mistakes and lessons worth passing on.",
    subtopics: [
      {
        slug: "what-id-change",
        title: "What I'd change",
        prompts: [
          "What's a decision you'd make differently, knowing what you know now?",
          "What did you hold onto for too long?",
          "What apology did you never make?",
          "Tell me about a time your pride cost you something.",
        ],
      },
      {
        slug: "wish-id-known-sooner",
        title: "What I wish I'd known sooner",
        prompts: [
          "What do you wish someone had told you at eighteen?",
          "How do you know when to walk away from something?",
          "What took you far too long to learn?",
          "What would you tell your 30-year-old self?",
        ],
      },
      {
        slug: "what-i-got-wrong",
        title: "What I got wrong",
        prompts: [
          "Who did you misjudge, and how did you find out?",
          "What's a belief you held strongly and later changed?",
          "What mistake taught you the most?",
          "What did you get wrong that turned out for the best?",
        ],
      },
    ],
  },
  {
    slug: "encouragement-for-future-generations",
    title: "Encouragement for Future Generations",
    blurb: "What we'd want the next ones to hear.",
    subtopics: [
      {
        slug: "general",
        title: "Encouragement for Future Generations",
        prompts: [
          "If a grandchild came to you broke and ashamed, what would you say first?",
          "What do you want a great-grandchild you'll never meet to know?",
          "What's worth working hard for?",
          "What should they do when life falls apart?",
          "What do you hope they never stop doing as a family?",
          "What blessing would you speak over the generations after you?",
          "What would you want them to hear from you on their hardest day?",
        ],
      },
    ],
  },
  {
    slug: "politics-and-current-events",
    title: "Politics & Current Events",
    blurb: "The world we lived through, and how we saw it.",
    optional: true,
    subtopics: [
      {
        slug: "general",
        title: "Politics & Current Events",
        prompts: [
          "What world event do you remember exactly where you were when you heard?",
          "How has the country changed in your lifetime — for better and worse?",
          "What issue have you changed your mind about over the years?",
          "How did your family talk about politics at the dinner table?",
          "How do you disagree with someone you love without losing them?",
          "What do you hope the world looks like for your great-grandchildren?",
        ],
      },
    ],
  },];

/** The core buckets — everything but the optional ones. */
export const CORE_BUCKETS: PromptBucket[] = PROMPT_BUCKETS.filter((b) => !b.optional);

export function findBucket(slug: string | null | undefined): PromptBucket | undefined {
  return slug ? PROMPT_BUCKETS.find((b) => b.slug === slug) : undefined;
}

export function findSubtopic(
  bucket: PromptBucket | undefined,
  slug: string | null | undefined,
): PromptSubtopic | undefined {
  return bucket && slug ? bucket.subtopics.find((s) => s.slug === slug) : undefined;
}

/** Every sample question in a bucket (optionally narrowed to one subtopic). */
export function promptsIn(bucket: PromptBucket, subtopic?: PromptSubtopic): string[] {
  return subtopic ? subtopic.prompts : bucket.subtopics.flatMap((s) => s.prompts);
}

/** A stable pick by index (wraps, negative-safe). */
export function promptAt(prompts: string[], index: number): string {
  const n = prompts.length;
  return prompts[((index % n) + n) % n];
}

/** Find which bucket / subtopic a library question belongs to. */
export function locatePrompt(
  text: string,
): { bucket: PromptBucket; subtopic: PromptSubtopic } | undefined {
  for (const bucket of PROMPT_BUCKETS) {
    for (const subtopic of bucket.subtopics) {
      if (subtopic.prompts.includes(text)) return { bucket, subtopic };
    }
  }
  return undefined;
}

export interface PromptSuggestion {
  bucket: PromptBucket;
  subtopic: PromptSubtopic;
  text: string;
}

/** Small deterministic PRNG so suggestions are stable for a given seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Suggest library prompts for someone, favouring the core buckets they've
 * explored least and skipping questions they've already answered.
 *
 * `bucketCounts` maps bucket slug → how much wisdom they've saved there.
 * Gentle and optional buckets are only eligible once that count is > 0 — we
 * never raise grief or politics unprompted. `seed` makes the pick stable (e.g.
 * per day, or per reminder) without being the same for everyone.
 */
export function suggestPrompts(opts: {
  bucketCounts: Record<string, number>;
  answered: Set<string>;
  seed: number;
  count?: number;
  /** Exclude these buckets (e.g. one already shown). */
  excludeBuckets?: Set<string>;
}): PromptSuggestion[] {
  const count = opts.count ?? 1;
  const rand = mulberry32(opts.seed);
  const eligible = PROMPT_BUCKETS.filter((b) => {
    if (opts.excludeBuckets?.has(b.slug)) return false;
    const opened = (opts.bucketCounts[b.slug] ?? 0) > 0;
    if (b.optional || b.gentle) return opened;
    return true;
  });

  // Least-explored first; ties broken by the seeded shuffle.
  const ranked = eligible
    .map((b) => ({ b, key: (opts.bucketCounts[b.slug] ?? 0) + rand() * 0.5 }))
    .sort((x, y) => x.key - y.key)
    .map((x) => x.b);

  const out: PromptSuggestion[] = [];
  for (const bucket of ranked) {
    if (out.length >= count) break;
    const fresh = bucket.subtopics.flatMap((subtopic) =>
      subtopic.prompts
        .filter((text) => !opts.answered.has(text))
        .map((text) => ({ bucket, subtopic, text })),
    );
    if (fresh.length === 0) continue;
    out.push(fresh[Math.floor(rand() * fresh.length)]);
  }
  return out;
}

/** A day number, for "stable for today" seeds. */
export function daySeed(date: Date, salt = ""): number {
  let h = Math.floor(date.getTime() / 86_400_000);
  for (const ch of salt) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return h >>> 0;
}
