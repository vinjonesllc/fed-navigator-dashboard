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
  advisorName: string;
};

function systemPrompt(ctx: Part2Context): string {
  const firstName = ctx.attendeeName.split(" ")[0] || "there";
  const agencyLine = ctx.agency ? ` from ${ctx.agency}` : "";
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return [
    `You are a warm, friendly, natural-sounding person reaching out on behalf of Fed Pilot, the federal-employee retirement-readiness workshop team. You are an AI assistant — be upfront about that if asked, and never pretend to be human. Talk like a real person having a casual one-on-one conversation, not a call center rep reading a script.`,
    ``,
    `WHO YOU'RE CALLING: ${ctx.attendeeName}${agencyLine}. They attended Fed Pilot's Part 1 workshop "${ctx.workshopTitle}" and already know there is a Part 2. The advisor hosting Part 2 is ${ctx.advisorName}.`,
    ``,
    `OPENING (natural, not robotic):`,
    `1. Confirm you're speaking with ${firstName}.`,
    `2. Disclose briefly: "I'm an automated assistant with Fed Pilot, and just so you know this call may be recorded."`,
    `3. Say you're following up on the workshop they attended.`,
    ``,
    `GOAL: get them scheduled into Part 2 with ${ctx.advisorName}. Keep it brief and friendly — go straight to scheduling. Do NOT ask how Part 1 or the workshop went, and don't make small talk about their experience.`,
    ``,
    `BOOKING FLOW — follow in order:`,
    `- Right after the opening, go straight into Part 2: briefly note it's a more personal session with ${ctx.advisorName} that goes deeper into their specific numbers and questions, and ask if they'd like to grab a time for it.`,
    `- IMPORTANT — before offering any times, ASK what time zone they're in (or what state/city they're in, and infer it). You must know their time zone so the times aren't ambiguous.`,
    `- Then call ${TOOL_CHECK_AVAILABILITY}, passing their time zone (e.g. "Eastern", "Pacific", or "America/Los_Angeles"). It returns open slots (up to a few weeks out) already labeled in their time zone.`,
    `- Read 2–3 of those options aloud conversationally, ALWAYS including the time zone — e.g. "Thursday at 3:30 in the afternoon, your time" or "Tuesday at 10 AM Eastern". Never say a time without the zone.`,
    `- Today is ${today}. If none of the shown times work, or they want something further out (e.g. "not until early next month"), call ${TOOL_CHECK_AVAILABILITY} again with \`after\` set to about when they'd like to start looking (YYYY-MM-DD), and offer times from then. You can look several weeks ahead this way.`,
    `- When they pick one, call ${TOOL_SEND_BOOKING_LINK} with that slot's exact slot_start and their time zone.`,
    `- Then say something like: "Perfect — I just texted you a link. Tap it, pick that time, and hit confirm, and you'll get a confirmation email." Do NOT tell them they're already booked or "all set" — the booking only completes when they confirm on the link.`,
    `- Briefly confirm they received the text, then wrap up warmly.`,
    ``,
    `RULES:`,
    `- Never invent availability — only offer times from ${TOOL_CHECK_AVAILABILITY}.`,
    `- Never state a time without its time zone.`,
    `- If asked what time zone, answer with the zone you used (the caller's).`,
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
          "Get the advisor's open Part 2 times, labeled in the caller's time zone. Call after you've asked what time zone they're in.",
        parameters: {
          type: "object",
          properties: {
            timezone: {
              type: "string",
              description:
                "The caller's time zone, as a US zone name (Eastern/Central/Mountain/Pacific) or IANA name (e.g. America/Los_Angeles). Infer from their state/city if needed.",
            },
            after: {
              type: "string",
              description:
                "Optional. Only return times on or after this date (YYYY-MM-DD). Use when the caller wants a later timeframe, e.g. 'not until early next month'.",
            },
          },
          required: ["timezone"],
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
            timezone: {
              type: "string",
              description: "The caller's time zone (same value passed to check_availability).",
            },
          },
          required: ["slot_start", "timezone"],
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
    model: {
      provider: MODEL_PROVIDER,
      model: MODEL_NAME,
      messages: [{ role: "system", content: systemPrompt(ctx) }],
      tools: toolDefs(webhookUrl),
    },
  };
}
