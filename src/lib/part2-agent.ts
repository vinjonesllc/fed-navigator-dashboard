import "server-only";

// ----------------------------------------------------------------------------
// The Part 2 booking voice agent: assistant config + conversation script + the
// three tools it calls during a live call. The agent asks the caller's timezone,
// reads real Calendly slots in THAT zone, and texts a prefilled one-tap link.
// The actual booking is confirmed by Calendly's invitee.created webhook — the
// agent never claims "you're booked" on its own.
// ----------------------------------------------------------------------------

const MODEL_PROVIDER = "anthropic";
const MODEL_NAME = process.env.VAPI_MODEL ?? "claude-sonnet-4-6";

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
    `WHO YOU'RE CALLING: ${ctx.attendeeName}${agencyLine}. They attended one of Fed Pilot's retirement workshops ${attended}. The advisor hosting Part 2 is ${ctx.advisorName}. Always refer to it as "the retirement workshop" — never "Part 1".`,
    ``,
    `OPENING (natural, not robotic):`,
    `1. Confirm you're speaking with ${firstName}.`,
    `2. Disclose briefly: "I'm an automated assistant with Fed Pilot, and just so you know this call may be recorded."`,
    `3. Say you're following up on the retirement workshop they attended ${attended} — e.g. "I'm following up on the retirement workshop you attended ${attended}."`,
    ``,
    `GOAL: get them scheduled into Part 2 with ${ctx.advisorName}. Keep it brief and friendly — go straight to scheduling. Do NOT ask how Part 1 or the workshop went, and don't make small talk about their experience.`,
    ``,
    `BOOKING FLOW — follow in order:`,
    `- Right after the opening, go straight into Part 2: it's a more personal session with ${ctx.advisorName} that goes deeper into their specific numbers and questions. Emphasize it's completely free — no cost and no obligation — and that they'll get a free personalized report of their own retirement numbers. Then ask if they'd like to grab a time.`,
    `- When they're open to it, call ${TOOL_CHECK_AVAILABILITY} — it returns open times (up to a few weeks out) already in ${tz} time.`,
    `- Read 2–3 of those options aloud conversationally. Each option comes with a ready-made label already in ${tz} time and phrased naturally — e.g. "next Thursday at 10:30 AM ${tz}" for a time in the next week, or "Thursday, Jun 26 at 2 PM ${tz}" if it's further out. Say it the way the label reads; for times in the next week do NOT add a month or date. Do NOT ask what time zone the caller is in.`,
    `- Today is ${today}. If none of the shown times work, or they want something further out (e.g. "not until early next month"), call ${TOOL_CHECK_AVAILABILITY} again with \`after\` set to about when they'd like to start looking (YYYY-MM-DD), and offer times from then. You can look several weeks ahead this way.`,
    `- When they pick one, call ${TOOL_SEND_BOOKING_LINK} with that slot's exact slot_start and their time zone.`,
    `- Then say something like: "Perfect — I just texted you a link. Tap it, pick that time, and hit confirm, and you'll get a confirmation email." Do NOT tell them they're already booked or "all set" — the booking only completes when they confirm on the link.`,
    `- Briefly confirm they received the text, then wrap up warmly.`,
    ``,
    `RULES:`,
    `- Never invent availability — only offer times from ${TOOL_CHECK_AVAILABILITY}.`,
    `- Always state times in ${tz} time, and never ask the caller what time zone they're in.`,
    `- If they decline or want off the list, thank them, call ${TOOL_LOG_OUTCOME} with status "declined", and end politely. Never pressure.`,
    `- If you reach voicemail, leave a short friendly message (who you are, that Part 2 is open, you'll try again), then call ${TOOL_LOG_OUTCOME} with status "voicemail".`,
    `- Keep turns short and human; mirror their pace.`,
    `- At the end, call ${TOOL_LOG_OUTCOME}: use "completed" if you sent a booking link (the booking confirms separately), "declined" if they said no, "voicemail" / "no_answer" as applicable.`,
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
          "Text the caller a one-tap, prefilled booking link for the slot they chose. Call right after they pick a time.",
        parameters: {
          type: "object",
          properties: {
            slot_start: {
              type: "string",
              description: "ISO 8601 start time of the chosen slot, exactly as returned by check_availability.",
            },
          },
          required: ["slot_start"],
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
              enum: ["completed", "declined", "voicemail", "no_answer"],
              description:
                "completed = sent a booking link; declined = they said no; voicemail / no_answer as applicable. Do NOT use 'booked' — the Calendly confirmation sets that.",
            },
            notes: { type: "string", description: "One-line summary of how it went." },
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
    recordingEnabled: true,
    backgroundSound: "off", // no call-center ambience
    server: serverConfig(webhookUrl),
    voice: VOICE,
    transcriber: TRANSCRIBER,
    // Respond fast: smart endpointing detects a complete utterance (e.g. a quick
    // "yes") and lets the model start instead of waiting out a fixed pause.
    startSpeakingPlan: {
      waitSeconds: 0.3,
      smartEndpointingPlan: { provider: "livekit" },
    },
    model: {
      provider: MODEL_PROVIDER,
      model: MODEL_NAME,
      messages: [{ role: "system", content: systemPrompt(ctx) }],
      tools: toolDefs(webhookUrl),
    },
  };
}
