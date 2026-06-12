import "server-only";
import nodemailer from "nodemailer";

// ----------------------------------------------------------------------------
// Transactional email for the Part 2 booking link (sent when the caller can't
// take a text or prefers email). Two transports, picked automatically:
//
//   1. SendGrid (preferred) — set SENDGRID_API_KEY. HTTP API, no SMTP, no DNS:
//      just verify EMAIL_FROM as a "Single Sender" in SendGrid. Fastest to
//      stand up and not subject to M365/GoDaddy SMTP-AUTH locks.
//   2. SMTP fallback — set SMTP_USER / SMTP_PASS (+ optional SMTP_HOST/PORT).
//      Microsoft 365 by default; needs Authenticated SMTP enabled for the mailbox.
//
// Sends from EMAIL_FROM ("Name <addr>"), which must be a verified sender on
// whichever transport is active. No-ops with a clear error if neither is set.
// ----------------------------------------------------------------------------

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || undefined;
const SMTP_HOST = process.env.SMTP_HOST || "smtp.office365.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || undefined;
const SMTP_PASS = process.env.SMTP_PASS || undefined;
const EMAIL_FROM = process.env.EMAIL_FROM || "Fed Pilot <info@fedpilot.com>";

export function isEmailConfigured(): boolean {
  return Boolean(SENDGRID_API_KEY || (SMTP_USER && SMTP_PASS));
}

type EmailArgs = { to: string; subject: string; html: string; text?: string };

/** Parse `EMAIL_FROM` ("Name <addr>" or "addr") into SendGrid's from shape. */
function parseFrom(s: string): { email: string; name?: string } {
  const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || undefined, email: m[2] } : { email: s.trim() };
}

async function sendViaSendgrid(args: EmailArgs): Promise<{ id: string }> {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: args.to }] }],
      from: parseFrom(EMAIL_FROM),
      subject: args.subject,
      // SendGrid requires text/plain before text/html.
      content: [
        ...(args.text ? [{ type: "text/plain", value: args.text }] : []),
        { type: "text/html", value: args.html },
      ],
    }),
  });
  if (!res.ok) throw new Error(`SendGrid → ${res.status} ${await res.text()}`);
  return { id: res.headers.get("x-message-id") || "sent" };
}

async function sendViaSmtp(args: EmailArgs): Promise<{ id: string }> {
  if (!SMTP_USER || !SMTP_PASS) throw new Error("SMTP_USER / SMTP_PASS are not set");
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // 465 = implicit TLS, 587 = STARTTLS
    requireTLS: SMTP_PORT === 587,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  const info = await transporter.sendMail({
    from: EMAIL_FROM,
    to: args.to,
    subject: args.subject,
    html: args.html,
    ...(args.text ? { text: args.text } : {}),
  });
  return { id: info.messageId };
}

export async function sendEmail(args: EmailArgs): Promise<{ id: string }> {
  if (SENDGRID_API_KEY) return sendViaSendgrid(args);
  if (SMTP_USER && SMTP_PASS) return sendViaSmtp(args);
  throw new Error("No email transport configured (set SENDGRID_API_KEY or SMTP_USER/SMTP_PASS)");
}
