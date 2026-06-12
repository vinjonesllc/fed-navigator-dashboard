import "server-only";
import nodemailer from "nodemailer";

// ----------------------------------------------------------------------------
// Transactional email over SMTP (Microsoft 365 / Outlook by default). Used to
// send the Part 2 booking link when the caller can't take a text (landline/VoIP)
// or simply prefers email. Sends through a mailbox you already own — no new
// provider, no domain DNS records.
//
// Requires (set in Vercel + .env.local):
//   SMTP_USER   the mailbox to authenticate as / send from
//   SMTP_PASS   an app password for that mailbox (recommended) or its password
// Optional:
//   SMTP_HOST   default smtp.office365.com
//   SMTP_PORT   default 587 (STARTTLS); use 465 for implicit TLS
//   EMAIL_FROM  "Name <addr>"; defaults to SMTP_USER. Must be the mailbox or an
//               address it is allowed to send as.
//
// Microsoft 365 note: the tenant must allow "Authenticated SMTP" for this
// mailbox — Admin center → user → Mail → Manage email apps → Authenticated SMTP,
// or PowerShell: Set-CASMailbox <user> -SmtpClientAuthenticationDisabled $false.
//
// No-ops gracefully if unconfigured: isEmailConfigured() is false and sendEmail
// throws a clear error the caller can surface.
// ----------------------------------------------------------------------------

const SMTP_HOST = process.env.SMTP_HOST || "smtp.office365.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || undefined;
const SMTP_PASS = process.env.SMTP_PASS || undefined;
const EMAIL_FROM = process.env.EMAIL_FROM || SMTP_USER;

export function isEmailConfigured(): boolean {
  return Boolean(SMTP_USER && SMTP_PASS);
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ id: string }> {
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
