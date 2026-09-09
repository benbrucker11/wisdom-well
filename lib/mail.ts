/**
 * Email delivery.
 *
 * Auth is passwordless (spec §8) — this product is meant for people in their
 * eighties. If SMTP_URL is configured we send a real message; otherwise the
 * link is written to the server console so local development works with no
 * mail setup.
 */
export async function sendMagicLinkEmail(to: string, url: string): Promise<void> {
  const smtpUrl = process.env.SMTP_URL;

  if (smtpUrl) {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport(smtpUrl);
    await transport.sendMail({
      from: process.env.MAIL_FROM ?? "Wisdom Well <no-reply@wisdomwell.local>",
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

  // Always log locally — never log in production once SMTP is the real path.
  if (!smtpUrl || process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log(`\n  ✦ Wisdom Well sign-in link for ${to}\n    ${url}\n`);
  }
}
