// Standalone email smoke test — validates the active transport before wiring
// the booking flow. Prefers SendGrid (SENDGRID_API_KEY), else SMTP. Reads
// .env.local.
//
//   node scripts/test-email.mjs                 # → admin+part2test@vinjones.com
//   node scripts/test-email.mjs you@example.com # → a specific address
import { readFileSync } from "node:fs";
import nodemailer from "nodemailer";

const env = {};
try {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
} catch {
  /* no .env.local — fall back to process.env */
}
const get = (k, d) => env[k] ?? process.env[k] ?? d;

const sgKey = get("SENDGRID_API_KEY");
const from = get("EMAIL_FROM", "Fed Pilot <info@fedpilot.com>");
const to = process.argv[2] || "admin+part2test@vinjones.com";

function parseFrom(s) {
  const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || undefined, email: m[2] } : { email: s.trim() };
}

const subject = "Fed Pilot email test";
const text = "If you received this, email sending is working.";
const html = "<p>If you received this, <b>email sending is working.</b> 🎉</p>";

if (sgKey) {
  console.log(`Sending via SendGrid as ${from} → ${to} …`);
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${sgKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: parseFrom(from),
      subject,
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: html },
      ],
    }),
  });
  if (!res.ok) {
    console.error("✗ Failed:", res.status, await res.text());
    process.exit(1);
  }
  console.log("✓ Sent (SendGrid):", res.headers.get("x-message-id") || res.status);
} else {
  const user = get("SMTP_USER");
  const pass = get("SMTP_PASS");
  const host = get("SMTP_HOST", "smtp.office365.com");
  const port = Number(get("SMTP_PORT", 587));
  if (!user || !pass) {
    console.error("✗ Set SENDGRID_API_KEY, or SMTP_USER + SMTP_PASS, in .env.local first.");
    process.exit(1);
  }
  console.log(`Sending via ${host}:${port} as ${user} → ${to} …`);
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
  });
  try {
    const info = await transporter.sendMail({ from, to, subject, text, html });
    console.log("✓ Sent (SMTP):", info.messageId);
  } catch (e) {
    console.error("✗ Failed:", e.message);
    process.exit(1);
  }
}
