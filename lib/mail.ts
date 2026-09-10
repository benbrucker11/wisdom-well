/**
 * Email delivery.
 *
 * Auth is passwordless (spec §8) — this product is meant for people in their
 * eighties. Delivery goes through Resend when RESEND_API_KEY is set, then SMTP
 * (SMTP_URL) as a fallback; either way the message is also written to the
 * server console outside production, so local development works with no mail
 * setup and links are never lost.
 *
 * Sandbox caveat: with the default `onboarding@resend.dev` sender, Resend only
 * delivers to the address that owns the Resend account. Verify a domain and set
 * MAIL_FROM to an address on it before real family members can sign in.
 */

const DEFAULT_FROM = "Wisdom Well <onboarding@resend.dev>";

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const from = process.env.MAIL_FROM ?? DEFAULT_FROM;
  const resendKey = process.env.RESEND_API_KEY;
  const smtpUrl = process.env.SMTP_URL;
  let delivered = false;

  if (resendKey) {
    try {
      const { Resend } = await import("resend");
      const { error } = await new Resend(resendKey).emails.send({
        from,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
      });
      if (error) {
        console.error("Resend delivery error:", error);
      } else {
        delivered = true;
      }
    } catch (err) {
      console.error("Resend send failed:", err);
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
      delivered = true;
    } catch (err) {
      console.error("SMTP send failed:", err);
    }
  }

  if (!delivered || process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log(
      `\n  ✦ Wisdom Well email → ${opts.to}\n    ${opts.subject}\n    ${opts.text.replace(/\n/g, "\n    ")}\n`,
    );
  }
}

export function sendMagicLinkEmail(to: string, url: string): Promise<void> {
  return sendEmail({
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
}
