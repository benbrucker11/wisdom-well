/**
 * Email delivery.
 *
 * Sign-in is email + password (Nov 2026), with an emailed sign-in link kept as
 * a fallback for people who forget passwords. Delivery goes through Resend when
 * RESEND_API_KEY is set, then SMTP (SMTP_URL) as a fallback.
 *
 * Every attempt logs its outcome, and any sign-in / handover link is always
 * echoed to the server log — this is a prototype, and being locked out because
 * an email bounced is worse than the small exposure of a link in your own
 * function logs. Set MAIL_DEBUG=off once a domain is verified and delivery is
 * reliable.
 *
 * Sandbox caveat: with the default `onboarding@resend.dev` sender, Resend only
 * delivers to the address that owns the Resend account, and only that address —
 * everyone else gets a 403. Verify a domain in Resend and set MAIL_FROM to an
 * address on it before other family members can sign in.
 */

const DEFAULT_FROM = "Wisdom Well <onboarding@resend.dev>";

export interface SendResult {
  delivered: boolean;
  via: "resend" | "smtp" | "none";
  detail: string;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  /** Extra headers, e.g. List-Unsubscribe on reminder emails. */
  headers?: Record<string, string>;
}): Promise<SendResult> {
  const from = process.env.MAIL_FROM ?? DEFAULT_FROM;
  const resendKey = process.env.RESEND_API_KEY;
  const smtpUrl = process.env.SMTP_URL;

  let result: SendResult = { delivered: false, via: "none", detail: "no email provider configured" };

  if (resendKey) {
    try {
      const { Resend } = await import("resend");
      const { data, error } = await new Resend(resendKey).emails.send({
        from,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        headers: opts.headers,
      });
      result = error
        ? { delivered: false, via: "resend", detail: `Resend error: ${error.name} — ${error.message}` }
        : { delivered: true, via: "resend", detail: `Resend id ${data?.id ?? "?"}` };
    } catch (err) {
      result = {
        delivered: false,
        via: "resend",
        detail: `Resend threw: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  } else if (smtpUrl) {
    try {
      const nodemailer = await import("nodemailer");
      await nodemailer.createTransport(smtpUrl).sendMail({
        from,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        headers: opts.headers,
      });
      result = { delivered: true, via: "smtp", detail: "sent via SMTP" };
    } catch (err) {
      result = {
        delivered: false,
        via: "smtp",
        detail: `SMTP threw: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[mail] to=${opts.to} subject=${JSON.stringify(opts.subject)} delivered=${result.delivered} via=${result.via} — ${result.detail}`,
  );

  return result;
}

export async function sendMagicLinkEmail(to: string, url: string): Promise<void> {
  const result = await sendEmail({
    to,
    subject: "Your Wisdom Well sign-in link",
    text: [
      "Someone asked to sign in to Wisdom Well with this email address.",
      "",
      "Open this link to continue:",
      url,
      "",
      "The link works once and expires in 15 minutes.",
      "If this wasn't you, you can ignore this message.",
    ].join("\n"),
  });

  if (!result.delivered || process.env.MAIL_DEBUG !== "off") {
    // eslint-disable-next-line no-console
    console.log(`\n  ✦ Wisdom Well sign-in link for ${to}\n    ${url}\n`);
  }
}

function echoLink(label: string, to: string, url: string, result: SendResult): void {
  if (!result.delivered || process.env.MAIL_DEBUG !== "off") {
    // eslint-disable-next-line no-console
    console.log(`\n  ✦ Wisdom Well ${label} for ${to}\n    ${url}\n`);
  }
}

export async function sendInviteEmail(to: string, url: string): Promise<void> {
  const result = await sendEmail({
    to,
    subject: "You've been invited to Wisdom Well",
    text: [
      "A family member has added you to their family on Wisdom Well — a private place to",
      "keep the stories, lessons, and wisdom worth carrying forward.",
      "",
      "Open this link to set your password and see what they've shared:",
      url,
      "",
      "The link works once and expires in 7 days. If you weren't expecting this, you",
      "can ignore this message.",
    ].join("\n"),
  });
  echoLink("invite link", to, url, result);
}

export async function sendPasswordSetupEmail(to: string, url: string): Promise<SendResult> {
  const result = await sendEmail({
    to,
    subject: "Wisdom Well now uses a password — set yours",
    text: [
      "Wisdom Well now signs you in with your email and a password, so you don't have to",
      "wait for a link every time.",
      "",
      "Open this link to set your password (at least 10 characters):",
      url,
      "",
      "The link works once and expires in 7 days. Until you set one, you can still sign in",
      "with an emailed link from the sign-in page.",
    ].join("\n"),
  });
  echoLink("set-password link", to, url, result);
  return result;
}

export async function sendPasswordResetEmail(to: string, url: string): Promise<void> {
  const result = await sendEmail({
    to,
    subject: "Reset your Wisdom Well password",
    text: [
      "Someone asked to reset the password for this email address on Wisdom Well.",
      "",
      "Open this link to choose a new password:",
      url,
      "",
      "The link works once and expires in 1 hour. If this wasn't you, you can ignore this",
      "message — your password hasn't changed.",
    ].join("\n"),
  });
  echoLink("password reset link", to, url, result);
}

export async function sendJoinRequestToSteward(
  to: string,
  opts: { requesterName: string; relationNote: string; familyName: string; reviewUrl: string },
): Promise<void> {
  await sendEmail({
    to,
    subject: `${opts.requesterName} asked to join ${opts.familyName} on Wisdom Well`,
    text: [
      `${opts.requesterName} followed your family's join link and asked to be added.`,
      "",
      `How they say they're related: ${opts.relationNote}`,
      "",
      "Approve or decline here:",
      opts.reviewUrl,
    ].join("\n"),
  });
}

export async function sendJoinDeclinedEmail(to: string, familyName: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Your Wisdom Well request",
    text: [
      `Your request to join ${familyName} on Wisdom Well wasn't approved this time.`,
      "",
      "If you think this was a mistake, reach out to the family member who shared the",
      "link with you.",
    ].join("\n"),
  });
}

export async function sendQuestionAskedEmail(
  to: string,
  opts: { askerName: string; question: string; answerUrl: string },
): Promise<void> {
  await sendEmail({
    to,
    subject: `${opts.askerName} asked you a question on Wisdom Well`,
    text: [
      `${opts.askerName} would love to hear your answer to this:`,
      "",
      `  "${opts.question}"`,
      "",
      "Write it, say it, or film it — whatever's easiest:",
      opts.answerUrl,
    ].join("\n"),
  });
}
