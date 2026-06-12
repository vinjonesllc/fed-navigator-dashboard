import "server-only";

// ----------------------------------------------------------------------------
// Transactional email via Resend. Used to send the Part 2 booking link when the
// caller can't take a text (landline/VoIP) or simply prefers email.
//
// Requires:
//   RESEND_API_KEY   the Resend API key (re_…)
//   EMAIL_FROM       verified sender, e.g. "Fed Pilot <bookings@fednavigator.com>"
//                    (defaults below; the domain must be verified in Resend)
//
// No-ops gracefully if unconfigured: isEmailConfigured() is false and sendEmail
// throws a clear error the caller can surface.
// ----------------------------------------------------------------------------

const RESEND_API_KEY = process.env.RESEND_API_KEY || undefined;
const EMAIL_FROM = process.env.EMAIL_FROM || "Fed Pilot <bookings@fednavigator.com>";

export function isEmailConfigured(): boolean {
  return Boolean(RESEND_API_KEY);
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ id: string }> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      ...(args.text ? { text: args.text } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend → ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}
