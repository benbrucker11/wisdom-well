// Server-only in practice (Prisma, email); not importing "server-only" so e2e
// scripts can drive it under plain Node.
import { randomBytes } from "node:crypto";
import { prisma } from "./db";
import { sendEmail } from "./mail";
import { daySeed, suggestPrompts } from "./prompts";
import { isReminderDue } from "./reminders";
import { visibleEntriesFor } from "./release";

/** Ensure the user has an opaque one-click unsubscribe token. */
export async function unsubscribeTokenFor(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.unsubscribeToken) return user.unsubscribeToken;
  const token = randomBytes(18).toString("base64url");
  await prisma.user.update({ where: { id: userId }, data: { unsubscribeToken: token } });
  return token;
}

/**
 * Daily-job sweep: email each person whose reminder cadence has come round a
 * suggested prompt (from the core bucket they've explored least — never grief
 * or politics unless they've opened those themselves) plus any questions
 * family members have asked them. Every email carries a one-click "stop these
 * emails" link.
 */
export async function sendDueReminders(origin: string, now = new Date(), limit = 200): Promise<number> {
  const users = await prisma.user.findMany({
    where: {
      reminderFrequency: { not: "OFF" },
      member: { status: "ACTIVE", dateOfDeath: null, detailsConfirmedAt: { not: null } },
    },
    include: { member: true },
    take: limit,
  });

  let sent = 0;
  for (const user of users) {
    const member = user.member;
    if (!member) continue;
    if (
      !isReminderDue({
        frequency: user.reminderFrequency,
        lastRemindedAt: user.lastRemindedAt,
        createdAt: user.createdAt,
        now,
      })
    ) {
      continue;
    }

    try {
      const own = (await visibleEntriesFor(member.id))
        .filter((v) => v.reason === "author")
        .map((v) => v.entry);
      const bucketCounts: Record<string, number> = {};
      for (const e of own) if (e.promptBucket) bucketCounts[e.promptBucket] = (bucketCounts[e.promptBucket] ?? 0) + 1;
      const answered = new Set(own.map((e) => e.interviewPrompt).filter((t): t is string => Boolean(t)));
      const answeredPromptIds = new Set(own.map((e) => e.promptId).filter(Boolean));

      const [pick] = suggestPrompts({ bucketCounts, answered, seed: daySeed(now, user.id) });
      const asked = await prisma.prompt.findMany({
        where: { askedOfMemberId: member.id, dismissedAt: null },
        include: { author: true },
        orderBy: { createdAt: "asc" },
        take: 5,
      });
      const openQuestions = asked.filter((p) => !answeredPromptIds.has(p.id));

      const token = await unsubscribeTokenFor(user.id);
      const unsubscribeUrl = `${origin}/unsubscribe/${token}`;
      const lines = [`Hi ${member.givenName},`, ""];
      if (pick) {
        const q = new URLSearchParams({ q: pick.text, bucket: pick.bucket.slug, subtopic: pick.subtopic.slug });
        lines.push(
          `Here's a question for your well, from ${pick.bucket.title}:`,
          "",
          `  "${pick.text}"`,
          "",
          "Write it, say it, or film it — two minutes or two hours:",
          `${origin}/entries/new?${q}`,
          "",
        );
      }
      if (openQuestions.length > 0) {
        lines.push("Questions your family has asked you:");
        for (const p of openQuestions) {
          lines.push(`  - "${p.text}" (from ${p.author.givenName}) — ${origin}/entries/new?prompt=${p.id}`);
        }
        lines.push("");
      }
      lines.push(
        "—",
        `You get these ${user.reminderFrequency === "WEEKLY" ? "weekly" : user.reminderFrequency === "MONTHLY" ? "monthly" : "every 2 weeks"}. Change how often: ${origin}/settings`,
        `Stop these emails: ${unsubscribeUrl}`,
      );

      const result = await sendEmail({
        to: user.email,
        subject: pick ? `A question for your well: ${pick.text}` : "Questions waiting in your well",
        text: lines.join("\n"),
        headers: {
          "List-Unsubscribe": `<${origin}/api/unsubscribe/${token}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      // Record the attempt either way so a bouncing address isn't retried daily.
      await prisma.user.update({ where: { id: user.id }, data: { lastRemindedAt: now } });
      if (result.delivered) sent += 1;
    } catch (err) {
      console.error(`reminder for user ${user.id} failed`, err);
    }
  }
  return sent;
}
