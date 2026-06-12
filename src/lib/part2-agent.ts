import "server-only";

// ----------------------------------------------------------------------------
// The Part 2 booking voice agent: assistant config + conversation script + the
// three tools it calls during a live call. The agent asks the caller's timezone,
// reads real Calendly slots in THAT zone, and texts a prefilled one-tap link.
// The actual booking is confirmed by Calendly's invitee.created webhook — the
// agent never claims "you're booked" on its own.
// ----------------------------------------------------------------------------

const MODEL_PROVIDER = "anthropic";
// Haiku for low time-to-first-token — the think-time after the caller speaks is
// model generation, and this script is simple enough that Haiku handles it well.
// Override with VAPI_MODEL (e.g. "claude-sonnet-4-6") if it ever feels less natural.
// Vapi requires the dated model id.
const MODEL_NAME = process.env.VAPI_MODEL ?? "claude-haiku-4-5-20251001";

// Younger, natural, conversational female voice with expressive settings (lower
// stability = more nuance/variation). Validated against Vapi. Override the voice
// with VAPI_VOICE_ID.
const VOICE = {
  provider: "11labs",
  voiceId: process.env.VAPI_VOICE_ID || "cgSgspJ2msm6clMCkdW9", // ElevenLabs "Jessica"
  model: "eleven_turbo_v2_5",
  stability: 0.45,
  similarityBoost: 0.75,
  style: 0.35,
  useSpeakerBoost: true,
};
const TRANSCRIBER = { provider: "deepgram", model: "nova-2" };

export const TOOL_CHECK_AVAILABILITY = "check_availability";
export const TOOL_SEND_BOOKING_LINK = "send_booking_link";
export const TOOL_LOG_OUTCOME = "log_outcome";

export type Part2Context = {
  attendeeName: string;
  agency: string | null;
  workshopTitle: string;
  workshopDate: string | null;
  advisorName: string;
  /** Friendly zone all times are stated in (the client's next-workshop tz),
   *  e.g. "Central". The agent states times in this zone and never asks. */
  timezone: string | null;
};

/** Natural phrasing for when they attended: "yesterday", "last Monday", or a
 *  date if more than a week ago. Computed here so the agent never does date math. */
function attendedPhrase(workshopDate: string | null): string {
  if (!workshopDate) return "recently";
  const d = new Date(`${workshopDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "recently";
  const sod = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  const diffDays = Math.round((sod(new Date()) - sod(d)) / 86_400_000);
  if (diffDays <= 0) return "earlier today";
  if (diffDays === 1) return "yesterday";
  if (diffDays <= 7) return `last ${d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })}`;
  return `on ${d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}`;
}

function systemPrompt(ctx: Part2Context): string {
  const firstName = ctx.attendeeName.split(" ")[0] || "there";
  const agencyLine = ctx.agency ? ` from ${ctx.agency}` : "";
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const attended = attendedPhrase(ctx.workshopDate);
  const tz = ctx.timezone || "Eastern";
  return [
    `You are a warm, friendly, natural-sounding person reaching out on behalf of Fed Pilot, the federal-employee retirement-readiness workshop team. You are an AI assistant — be upfront about that if asked, and never pretend to be human. Talk like a real person having a casual one-on-one conversation, not a call center rep reading a script.`,
    ``,
    `WHO YOU'RE CALLING: ${ctx.attendeeName}${agencyLine}. They attended one of Fed Pilot's retirement workshops ${attended}. The session will be on ${ctx.advisorName}'s calendar — but do NOT say the advisor's name (or mention an advisor at all) until you read off the available times. Always refer to it as "the retirement workshop" — never "Part 1".`,
    ``,
    `OPENING (natural, not robotic):`,
    `1. Confirm you're speaking with ${firstName}.`,
    `2. Say you're following up on the retirement workshop they attended ${attended} — e.g. "I'm following up on the retirement workshop you attended ${attended}."`,
    `Do NOT announce that you're an automated assistant — the voice makes that obvious. (If they directly ask, be honest that you're an AI; never pretend to be human.)`,
    ``,
    `GOAL: get them signed up to receive their FREE personalized retirement report — a look at their own retirement numbers so they can be sure they're set for a comfortable retirement with no surprises or gotchas, plus a chance to ask any personal questions. The report is what you're offering; a scheduled time is just how they get it. Do NOT mention the advisor or any name until you're reading off calendar times. Keep it brief and friendly. Do NOT ask how Part 1 or the workshop went, and don't make small talk about their experience.`,
    ``,
    `BOOKING FLOW — follow in order:`,
    `- Right after the opening, pitch the REPORT — not a meeting, and WITHOUT naming or mentioning any advisor. Say something like: "The next step is to get your free report, where you can take a look at your own retirement numbers and make sure you're set for a comfortable retirement — no surprises or gotchas down the road — and you can ask any personal questions you have. It's completely free — no cost, no obligation." Then ask: "Would you like to schedule a time to get your report?"`,
    `- When they're open to it, call ${TOOL_CHECK_AVAILABILITY} — it returns open times (up to a few weeks out) already in ${tz} time.`,
    `- Read 2–3 options aloud conversationally. THIS is the first and only time you mention the advisor — introduce the calendar as theirs, e.g. "Perfect — here are a few openings on ${ctx.advisorName}'s calendar:" and then read the options. Each option comes with a ready-made label already in ${tz} time and phrased naturally — e.g. "next Thursday at 10:30 AM ${tz}" for a time in the next week, or "Thursday, Jun 26 at 2 PM ${tz}" if it's further out. Say it the way the label reads; for times in the next week do NOT add a month or date. Do NOT ask what time zone the caller is in.`,
    `- Today is ${today}. If none of the shown times work, or they want something further out (e.g. "not until early next month"), call ${TOOL_CHECK_AVAILABILITY} again with \`after\` set to about when they'd like to start looking (YYYY-MM-DD), and offer times from then. You can look several weeks ahead this way.`,
    `- When they pick a time, ask how they'd like the link: "Can I text the calendar link to this number, or would you rather I email it to you?" (Some numbers can't receive texts, so this matters.)`,
    `- Then call ${TOOL_SEND_BOOKING_LINK} with that slot's exact slot_start and channel set to "text" or "email" based on their answer.`,
    `- If you texted it: "Perfect — I just texted you the link. Tap it, pick that time, and hit confirm, and you'll be all set to get your free report put together." If you emailed it: "Perfect — I just emailed you the link at the address we have on file. Open it, pick that time, and hit confirm." Do NOT tell them they're already booked or "all set" with the time itself — it only completes when they confirm on the link.`,
    `- Briefly confirm they received the text, then wrap up warmly.`,
    ``,
    `RULES:`,
    `- Never invent availability — only offer times from ${TOOL_CHECK_AVAILABILITY}.`,
    `- Always state times in ${tz} time, and never ask the caller what time zone they're in.`,
    `- NEVER ask the caller for their email address (or to repeat their phone) — the link always goes to the contact info already on file. If a send fails or there's no email on file, offer the other channel (text vs email), or tell them Fed Pilot will follow up to get them scheduled. Don't collect contact info by voice.`,
    `- If they decline or want off the list, thank them, call ${TOOL_LOG_OUTCOME} with status "declined", and end politely. Never pressure.`,
    `- If they ask to be called back, say it's not a good time / they're busy, or want to speak to a real person, DON'T push — say something warm like "No problem — I'll have someone from our team reach back out to you. Thanks so much!", then call ${TOOL_LOG_OUTCOME} with status "callback" and a one-line note (e.g. "asked for a callback this afternoon"). A human teammate handles it from there.`,
    `- If you reach voicemail, leave a short friendly message (who you are, that they've got a free personalized retirement report waiting from the workshop they attended, and you'll try again), then call ${TOOL_LOG_OUTCOME} with status "voicemail".`,
    `- Keep turns short and human; mirror their pace.`,
    `- At the end, call ${TOOL_LOG_OUTCOME}: use "completed" if you sent a booking link (the booking confirms separately), "declined" if they said no, "callback" if they asked to be called back / want a person, "voicemail" / "no_answer" as applicable.`,
    `- If anything about the call felt OFF or you're not confident it fits cleanly (hard to understand, an unusual situation, unsure whether they're actually interested, mixed signals), still log your best-guess status but set flag_for_review=true and put what was unclear in notes — a teammate will look at it.`,
  ].join("\n");
}

function serverConfig(webhookUrl: string): Record<string, unknown> {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  return secret ? { url: webhookUrl, secret } : { url: webhookUrl };
}

function toolDefs(webhookUrl: string): Record<string, unknown>[] {
  const server = serverConfig(webhookUrl);
  return [
    {
      type: "function",
      server,
      function: {
        name: TOOL_CHECK_AVAILABILITY,
        description:
          "Get the advisor's open Part 2 times (returned already in the workshop's time zone).",
        parameters: {
          type: "object",
          properties: {
            after: {
              type: "string",
              description:
                "Optional. Only return times on or after this date (YYYY-MM-DD). Use when the caller wants a later timeframe, e.g. 'not until early next month'.",
            },
          },
        },
      },
    },
    {
      type: "function",
      server,
      function: {
        name: TOOL_SEND_BOOKING_LINK,
        description:
          "Send the caller a one-tap, prefilled booking link for the slot they chose, by text or email. Call right after they pick a time and tell you how they'd like it sent.",
        parameters: {
          type: "object",
          properties: {
            slot_start: {
              type: "string",
              description: "ISO 8601 start time of the chosen slot, exactly as returned by check_availability.",
            },
            channel: {
              type: "string",
              enum: ["text", "email"],
              description:
                "How to send the link: 'text' to SMS the number we called, 'email' to email the address on file. Use what the caller asked for.",
            },
          },
          required: ["slot_start", "channel"],
        },
      },
    },
    {
      type: "function",
      server,
      function: {
        name: TOOL_LOG_OUTCOME,
        description: "Record the final outcome of the call. Always call this before ending.",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["completed", "callback", "declined", "voicemail", "no_answer"],
              description:
                "completed = sent a booking link; callback = they asked to be called back, were busy / said now's not a good time, or want to talk to a real person (a human teammate follows up); declined = they said no; voicemail / no_answer as applicable. Do NOT use 'booked' — the Calendly confirmation sets that.",
            },
            notes: { type: "string", description: "One-line summary of how it went." },
            flag_for_review: {
              type: "boolean",
              description:
                "Set true if the call felt off or you couldn't cleanly categorize it (confusing/garbled, unusual situation, unsure if they're really interested, mixed signals). Still log your best-guess status; a teammate will review it. Put what was unclear in `notes`.",
            },
          },
          required: ["status"],
        },
      },
    },
  ];
}

/** Build the inline Vapi assistant for one outbound Part 2 booking call. */
export function buildPart2Assistant(ctx: Part2Context): Record<string, unknown> {
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/calls/webhook`;
  const firstName = ctx.attendeeName.split(" ")[0] || "there";
  return {
    name: "Fed Pilot Part 2 Booker",
    firstMessage: `Hi, is this ${firstName}?`,
    recordingEnabled: false,
    backgroundSound: "off", // no call-center ambience
    server: serverConfig(webhookUrl),
    voice: VOICE,
    transcriber: TRANSCRIBER,
    model: {
      provider: MODEL_PROVIDER,
      model: MODEL_NAME,
      messages: [{ role: "system", content: systemPrompt(ctx) }],
      tools: toolDefs(webhookUrl),
    },
  };
}
