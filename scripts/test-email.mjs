// Standalone SMTP smoke test — validates SMTP_USER/SMTP_PASS/host before wiring
// the booking flow. Reads .env.local, sends one email via nodemailer.
//
//   node scripts/test-email.mjs                 # → admin+part2test@vinjones.com
//   node scripts/test-email.mjs you@example.com # → a specific address
//
// Defaults match src/lib/email.ts (smtp.office365.com:587, info@fedpilot.com).
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

const user = get("SMTP_USER");
const pass = get("SMTP_PASS");
const host = get("SMTP_HOST", "smtp.office365.com");
const port = Number(get("SMTP_PORT", 587));
const from = get("EMAIL_FROM", "Fed Pilot <info@fedpilot.com>");
const to = process.argv[2] || "admin+part2test@vinjones.com";

if (!user || !pass) {
  console.error("✗ Set SMTP_USER and SMTP_PASS in .env.local first.");
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
  const info = await transporter.sendMail({
    from,
    to,
    subject: "Fed Pilot SMTP test",
    text: "If you received this, SMTP is working.",
    html: "<p>If you received this, <b>SMTP is working.</b> 🎉</p>",
  });
  console.log("✓ Sent:", info.messageId);
} catch (e) {
  console.error("✗ Failed:", e.message);
  process.exit(1);
}
