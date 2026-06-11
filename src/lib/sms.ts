import "server-only";

// ----------------------------------------------------------------------------
// Twilio SMS — sends the one-tap Calendly booking link mid-call. Uses the same
// number that's imported into Vapi for caller ID.
//
// Requires:
//   TWILIO_ACCOUNT_SID   (AC… — your account id, used in the request URL)
//   Auth, EITHER (preferred, revocable API key):
//     TWILIO_API_KEY_SID    (SK…)
//     TWILIO_API_KEY_SECRET
//   OR (account-level):
//     TWILIO_AUTH_TOKEN
//   and ONE of:
//     TWILIO_MESSAGING_SERVICE_SID  (preferred — routes through the approved
//                                    A2P 10DLC campaign; VINJONES, LLC is
//                                    Brand-approved + Campaign-verified)
//     TWILIO_PHONE_NUMBER           (E.164 fallback, e.g. +18543337456)
// ----------------------------------------------------------------------------

export async function sendSms(args: { to: string; body: string }): Promise<{ sid: string }> {
  // `|| undefined` so a blank env line (KEY=) counts as unset and falls back.
  const accountSid = process.env.TWILIO_ACCOUNT_SID || undefined; // AC… — in URL
  const apiKeySid = process.env.TWILIO_API_KEY_SID || undefined; // SK… (recommended)
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET || undefined;
  const authToken = process.env.TWILIO_AUTH_TOKEN || undefined; // account-level fallback
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || undefined;
  const from = process.env.TWILIO_PHONE_NUMBER || undefined;

  // Basic-auth username/password: prefer the API key, else Account SID + token.
  const authUser = apiKeySid ?? accountSid;
  const authPass = apiKeySecret ?? authToken;
  if (!accountSid || !authUser || !authPass || (!messagingServiceSid && !from)) {
    throw new Error(
      "Twilio env not set (need TWILIO_ACCOUNT_SID + an API key [TWILIO_API_KEY_SID/SECRET] or TWILIO_AUTH_TOKEN, + one of TWILIO_MESSAGING_SERVICE_SID / TWILIO_PHONE_NUMBER)",
    );
  }

  // Prefer the Messaging Service (10DLC campaign); fall back to the raw number.
  const form = new URLSearchParams({ To: args.to, Body: args.body });
  if (messagingServiceSid) form.set("MessagingServiceSid", messagingServiceSid);
  else form.set("From", from as string);
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${authUser}:${authPass}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    },
  );
  if (!res.ok) {
    throw new Error(`Twilio SMS → ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { sid: string };
  return { sid: data.sid };
}
