import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAvailableSlots, prefilledBookingUrl } from "@/lib/calendly";
import { sendSms } from "@/lib/sms";
import {
  TOOL_CHECK_AVAILABILITY,
  TOOL_SEND_BOOKING_LINK,
  TOOL_LOG_OUTCOME,
} from "@/lib/part2-agent";
import { timingSafeEqualStr } from "@/lib/webhook-verify";
import { bestHoursForClient, nextRetryAt } from "@/lib/call-scheduling";
import type { Attendee, CallTarget, CallTargetStatus } from "@/lib/supabase/types";

type CallOutcome = "answered" | "voicemail" | "no_answer" | "failed";

/** Classify a Vapi end-of-call report into an outcome for the timing log. */
function classifyOutcome(endedReason: string | undefined, hasTranscript: boolean): CallOutcome {
  const r = (endedReason ?? "").toLowerCase();
  if (r.includes("voicemail")) return "voicemail";
  if (
    r.includes("no-answer") ||
    r.includes("did-not-answer") ||
    r.includes("busy") ||
    r.includes("failed-to-connect") ||
    r.includes("no-microphone")
  )
    return "no_answer";
  if (r.includes("error") || r.includes("pipeline") || r.includes("failed")) return "failed";
  return hasTranscript ? "answered" : "no_answer";
}

/** Current local hour (0-23) and weekday (0=Sun) in the given friendly/IANA zone. */
function localHourWeekday(tz: string): { hour: number; weekday: number } {
  const iana = normalizeTz(tz);
  const now = new Date();
  const hour = Number(now.toLocaleString("en-US", { timeZone: iana, hour: "2-digit", hour12: false })) % 24;
  const wd = now.toLocaleString("en-US", { timeZone: iana, weekday: "short" });
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  return { hour: Number.isFinite(hour) ? hour : 0, weekday };
}

// Retry-eligible (non-terminal) statuses — a terminal disposition is preserved.
const RETRYABLE: CallTargetStatus[] = ["calling", "no_answer", "voicemail"];

// Vapi posts every call event here: tool-calls during the call, status updates,
// and the end-of-call report (transcript + recording). Tool-calls must return
// { results: [{ toolCallId, result }] } synchronously so the agent can speak it.
//
// Auth: Vapi sends the configured server secret as the `x-vapi-secret` header
// (we set it on the assistant's server config). Enforced when
// VAPI_WEBHOOK_SECRET is set; skipped only in local dev before it's wired.

type ToolCall = {
  id?: string;
  toolCallId?: string;
  function?: { name?: string; arguments?: unknown };
};

type VapiMessage = {
  type?: string;
  call?: { id?: string; metadata?: Record<string, unknown> };
  toolCalls?: ToolCall[];
  toolCallList?: ToolCall[];
  status?: string;
  endedReason?: string;
  artifact?: { recordingUrl?: string; transcript?: string };
};

function parseArgs(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (raw as Record<string, unknown>) ?? {};
}

const DEFAULT_TZ = "America/New_York";
const TZ_ALIASES: Record<string, string> = {
  eastern: "America/New_York", et: "America/New_York", est: "America/New_York", edt: "America/New_York",
  central: "America/Chicago", ct: "America/Chicago", cst: "America/Chicago", cdt: "America/Chicago",
  mountain: "America/Denver", mt: "America/Denver", mst: "America/Denver", mdt: "America/Denver",
  pacific: "America/Los_Angeles", pt: "America/Los_Angeles", pst: "America/Los_Angeles", pdt: "America/Los_Angeles",
  alaska: "America/Anchorage", hawaii: "Pacific/Honolulu",
};

/** Map a caller-supplied zone ("Pacific", "PST", or an IANA name) to IANA. */
function normalizeTz(input: unknown, fallback = DEFAULT_TZ): string {
  if (typeof input !== "string" || !input.trim()) return fallback;
  const key = input.trim().toLowerCase().replace(/ (time|standard|daylight).*/, "");
  if (TZ_ALIASES[key]) return TZ_ALIASES[key];
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: input }).format(new Date());
    return input; // valid IANA zone
  } catch {
    return fallback;
  }
}

/** Format an ISO time in a friendly US zone ("Central") and append that label,
 *  e.g. "Thursday, Jun 18, 10:30 AM Central". */
function humanTime(iso: string, friendlyTz: string): string {
  const t = new Date(iso).toLocaleString("en-US", {
    timeZone: normalizeTz(friendlyTz),
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${t} ${friendlyTz}`;
}

async function loadTarget(targetId: string | undefined) {
  if (!targetId) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("call_targets")
    .select("*")
    .eq("id", targetId)
    .maybeSingle<CallTarget>();
  return data ?? null;
}

async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  targetId: string | undefined,
  tz: string,
): Promise<string> {
  const admin = createSupabaseAdminClient();

  if (name === TOOL_CHECK_AVAILABILITY) {
    const after =
      typeof args.after === "string" && args.after.trim() ? args.after.trim() : undefined;
    const slots = await getAvailableSlots(35, after);
    if (slots.length === 0) return "No open Part 2 times in the next several weeks.";
    // Labels are in the caller's time zone; the agent reads the labels and passes
    // the ISO start back in send_booking_link.
    return JSON.stringify(
      slots.slice(0, 6).map((s) => ({ slot_start: s.start_time, label: humanTime(s.start_time, tz) })),
    );
  }

  if (name === TOOL_SEND_BOOKING_LINK) {
    const slotStart = String(args.slot_start ?? "");
    const target = await loadTarget(targetId);
    if (!target?.phone) return "I couldn't find a phone number to text the link to.";

    const slots = await getAvailableSlots();
    const slot = slots.find((s) => s.start_time === slotStart);
    if (!slot) return "That time is no longer available — let me offer another.";

    let email: string | null = null;
    if (target.attendee_id) {
      const { data: att } = await admin
        .from("attendees")
        .select("email")
        .eq("id", target.attendee_id)
        .maybeSingle<Pick<Attendee, "email">>();
      email = att?.email ?? null;
    }
    const url = prefilledBookingUrl(slot.scheduling_url, { name: target.full_name, email });
    await sendSms({
      to: target.phone,
      body: `Fed Pilot: tap to confirm your Part 2 session for ${humanTime(slotStart, tz)} — ${url}`,
    });
    await admin
      .from("call_targets")
      .update({ booked_event_time: slotStart, updated_at: new Date().toISOString() })
      .eq("id", target.id);
    return `Texted the booking link for ${humanTime(slotStart, tz)}. Ask them to tap it and confirm.`;
  }

  if (name === TOOL_LOG_OUTCOME) {
    const status = String(args.status ?? "completed") as CallTargetStatus;
    const notes = args.notes ? String(args.notes) : null;
    if (targetId) {
      await admin
        .from("call_targets")
        .update({ status, outcome_notes: notes, updated_at: new Date().toISOString() })
        .eq("id", targetId);
    }
    return "Outcome recorded.";
  }

  return "Unknown tool.";
}

export async function POST(request: NextRequest) {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (secret) {
    const got = request.headers.get("x-vapi-secret");
    if (!got || !timingSafeEqualStr(got, secret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = (await request.json().catch(() => ({}))) as { message?: VapiMessage };
  const message = body.message;
  if (!message) return NextResponse.json({ ok: true });

  const targetId =
    typeof message.call?.metadata?.targetId === "string"
      ? message.call.metadata.targetId
      : undefined;
  const tz =
    typeof message.call?.metadata?.timezone === "string"
      ? message.call.metadata.timezone
      : "Eastern";
  const clientId =
    typeof message.call?.metadata?.clientId === "string"
      ? message.call.metadata.clientId
      : undefined;

  // 1) Tool calls — respond synchronously with results.
  if (message.type === "tool-calls" || message.type === "function-call") {
    const calls = message.toolCallList ?? message.toolCalls ?? [];
    const results = await Promise.all(
      calls.map(async (c) => {
        const id = c.toolCallId ?? c.id ?? "";
        const name = c.function?.name ?? "";
        try {
          const result = await handleToolCall(name, parseArgs(c.function?.arguments), targetId, tz);
          return { toolCallId: id, result };
        } catch (e) {
          return { toolCallId: id, result: e instanceof Error ? e.message : "Tool failed" };
        }
      }),
    );
    return NextResponse.json({ results });
  }

  // 2) End-of-call report — persist transcript + recording, log the attempt
  //    outcome for best-time learning, and reschedule a retry if appropriate.
  if (message.type === "end-of-call-report" && targetId) {
    const admin = createSupabaseAdminClient();
    const transcript = message.artifact?.transcript ?? null;
    const outcome = classifyOutcome(message.endedReason, !!transcript);
    const { hour, weekday } = localHourWeekday(tz);

    const { data: target } = await admin
      .from("call_targets")
      .select("status, attempts, campaign_id")
      .eq("id", targetId)
      .maybeSingle<Pick<CallTarget, "status" | "attempts" | "campaign_id">>();

    // Timing log for best-time learning (best-effort).
    await admin.from("call_attempts").insert({
      target_id: targetId,
      campaign_id: target?.campaign_id ?? null,
      client_id: clientId ?? null,
      local_hour: hour,
      local_weekday: weekday,
      outcome,
      provider_call_id: message.call?.id ?? null,
    });

    const update: Record<string, unknown> = {
      recording_url: message.artifact?.recordingUrl ?? null,
      transcript,
      updated_at: new Date().toISOString(),
    };

    // Disposition / retry — only when not already terminal (declined / booked /
    // completed are preserved).
    if (target && RETRYABLE.includes(target.status)) {
      if (outcome === "answered") {
        update.status = "completed";
      } else {
        const { data: campaign } = await admin
          .from("call_campaigns")
          .select("max_attempts")
          .eq("id", target.campaign_id)
          .maybeSingle<{ max_attempts: number }>();
        const maxAttempts = campaign?.max_attempts ?? 3;
        update.status = outcome; // 'voicemail' | 'no_answer' | 'failed'
        if (outcome !== "failed" && target.attempts < maxAttempts) {
          const hours = clientId ? await bestHoursForClient(clientId) : [];
          update.next_attempt_at = nextRetryAt(tz, hours, target.attempts).toISOString();
        } else {
          update.next_attempt_at = null; // out of attempts → stop
        }
      }
    }

    await admin.from("call_targets").update(update).eq("id", targetId);
  }

  return NextResponse.json({ ok: true });
}
