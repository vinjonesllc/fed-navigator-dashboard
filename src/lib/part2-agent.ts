import "server-only";

// ----------------------------------------------------------------------------
// The Part 2 booking voice agent: assistant config + conversation script + the
// three tools it calls during a live call. The agent reads real Calendly slots,
// the person picks one, the agent texts a prefilled single-use link they tap to
// confirm while still on the phone ("live assisted booking"). Calendly's
// invitee.created webhook closes the loop and flips the target to "booked".
// ----------------------------------------------------------------------------

// --- Tunables — verify these against the supported lists in your Vapi dashboard.
// Model/voice/transcriber IDs occasionally change; centralized here so swapping
// is a one-line edit. Voice should be a warm, natural US voice.
const MODEL_PROVIDER = "anthropic";
const MODEL_NAME = process.env.VAPI_MODEL ?? "claude-sonnet-4-6";
const VOICE = { provider: "11labs", voiceId: process.env.VAPI_VOICE_ID ?? "" };
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
  return [
    `You are a warm, friendly assistant calling on behalf of Fed Pilot, the federal-employee retirement-readiness workshop team. You are an AI assistant — be upfront about that if asked, and never pretend to be human.`,
    ``,
    `WHO YOU'RE CALLING: ${ctx.attendeeName}${agencyLine}. They attended Fed Pilot's Part 1 workshop "${ctx.workshopTitle}" and already know there is a Part 2. The advisor hosting Part 2 is ${ctx.advisorName}.`,
    ``,
    `OPENING (say this naturally, not robotically):`,
    `1. Confirm you're speaking with ${firstName}.`,
    `2. Disclose: "I'm an automated assistant with Fed Pilot, and just so you know this call may be recorded." Keep it light and quick.`,
    `3. Say you're following up on the workshop they attended.`,
    ``,
    `GOAL: have a brief, genuine conversation about their Part 1 experience, then invite them to book Part 2 — and book it live on this call.`,
    ``,
    `FLOW:`,
    `- Ask 1–2 light questions about how Part 1 went / what was most useful. Listen and respond naturally. Do not interrogate.`,
    `- Transition to Part 2: it goes deeper on their specific retirement numbers and questions. Encourage them to grab a time.`,
    `- When they're open to it, call ${TOOL_CHECK_AVAILABILITY} to get open times, then read 2–3 options aloud conversationally (e.g. "Thursday at 2, or Friday morning?").`,
    `- When they pick one, call ${TOOL_SEND_BOOKING_LINK} with that slot. Then say: "Perfect — I just texted you a link, tap it and you're locked in for [time]." Wait for them to confirm they tapped it.`,
    `- If the system confirms the booking, congratulate them warmly and wrap up. If they can't tap it now, tell them the link stays valid and they can tap it anytime today.`,
    ``,
    `RULES:`,
    `- Never invent availability — only offer times returned by ${TOOL_CHECK_AVAILABILITY}.`,
    `- Be respectful of their time; if they decline or want to be removed, thank them, call ${TOOL_LOG_OUTCOME} with status "declined", and end politely. Never pressure.`,
    `- If you reach voicemail, leave a short friendly message: who you are, that Part 2 is open, and that you'll try again — then end.`,
    `- Keep turns short and human. Mirror their pace.`,
    `- At the end of every call, call ${TOOL_LOG_OUTCOME} with the final status and a one-line note.`,
  ].join("\n");
}

function serverConfig(webhookUrl: string): Record<string, unknown> {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  // Vapi echoes `secret` back as the `x-vapi-secret` header on every webhook.
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
          "Get the advisor's open Part 2 appointment times. Call this when the person is ready to pick a time.",
        parameters: {
          type: "object",
          properties: {
            preferred_timeframe: {
              type: "string",
              description:
                "Optional natural-language hint of when they'd prefer, e.g. 'mornings' or 'next week'.",
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
          "Text the person a one-tap, prefilled booking link for the slot they chose. Call this right after they pick a time.",
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
              enum: ["booked", "declined", "completed", "voicemail", "no_answer"],
              description: "Final disposition of the call.",
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
