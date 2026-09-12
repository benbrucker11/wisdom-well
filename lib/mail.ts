/**
 * Email delivery.
 *
 * Auth is passwordless (spec §8) — this product is meant for people in their
 * eighties. Delivery goes through Resend when RESEND_API_KEY is set, then SMTP
 * (SMTP_URL) as a fallback.
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

export async function sendInviteEmail(to: string, url: string): Promise<void> {
  const result = await sendEmail({
    to,
    subject: "You've been invited to Wisdom Well",
    text: [
      "A family member has added you to their family on Wisdom Well — a private place to",
      "keep the stories, lessons, and wisdom worth carrying forward.",
      "",
      "Open this link to sign in and see what they've shared:",
      url,
      "",
      "The link works once and expires in 15 minutes. If you weren't expecting this, you",
      "can ignore this message.",
    ].join("\n"),
  });

  if (!result.delivered || process.env.MAIL_DEBUG !== "off") {
    // eslint-disable-next-line no-console
    console.log(`\n  ✦ Wisdom Well invite link for ${to}\n    ${url}\n`);
  }
}
