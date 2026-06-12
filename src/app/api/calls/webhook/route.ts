import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAvailableSlots, prefilledBookingUrl } from "@/lib/calendly";
import { sendSms } from "@/lib/sms";
import { sendEmail } from "@/lib/email";
import { notifyPart2Handoff } from "@/lib/clickup";
import { toE164 } from "@/lib/phone";
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

/** YYYY-MM-DD for an instant as seen in a given IANA zone. */
function ymdInTz(d: Date, iana: string): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: iana,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Whole-day difference (b − a) between two YYYY-MM-DD strings. */
function dayDiff(aYmd: string, bYmd: string): number {
  const [ay, am, ad] = aYmd.split("-").map(Number);
  const [by, bm, bd] = bYmd.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/**
 * Format a slot time for speaking + texting, in a friendly US zone. Times in the
 * next week use the weekday only ("this Thursday at 10:30 AM Eastern" / "next
 * Tuesday at 2 PM Eastern"); anything further out includes the date ("Thursday,
 * Jun 26 at 2 PM Eastern"). Keeps near-term options from sounding robotic.
 */
function humanTime(iso: string, friendlyTz: string): string {
  const iana = normalizeTz(friendlyTz);
  const d = new Date(iso);
  const time = d.toLocaleString("en-US", { timeZone: iana, hour: "numeric", minute: "2-digit" });
  const weekday = d.toLocaleString("en-US", { timeZone: iana, weekday: "long" });

  const todayYmd = ymdInTz(new Date(), iana);
  const slotYmd = ymdInTz(d, iana);
  const diff = dayDiff(todayYmd, slotYmd);
  const todayDow = new Date(`${todayYmd}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const daysLeftThisWeek = 6 - todayDow; // days until Saturday (end of this week)

  let dayPhrase: string;
  if (diff <= 0) dayPhrase = "today";
  else if (diff === 1) dayPhrase = "tomorrow";
  else if (diff <= 7) dayPhrase = `${diff <= daysLeftThisWeek ? "this" : "next"} ${weekday}`;
  else {
    const md = d.toLocaleString("en-US", { timeZone: iana, month: "short", day: "numeric" });
    dayPhrase = `${weekday}, ${md}`;
  }
  return `${dayPhrase} at ${time} ${friendlyTz}`;
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
    const channel = String(args.channel ?? "text").toLowerCase() === "email" ? "email" : "text";
    const target = await loadTarget(targetId);
    if (!target) return "I couldn't find the contact to send the link to.";

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
    const phoneE164 = toE164(target.phone);
    const url = prefilledBookingUrl(slot.scheduling_url, {
      name: target.full_name,
      email,
      phone: phoneE164 ?? target.phone,
    });
    const whenLabel = humanTime(slotStart, tz);

    const markSent = (via: "text" | "email") =>
      admin
        .from("call_targets")
        .update({ booked_event_time: slotStart, link_channel: via, updated_at: new Date().toISOString() })
        .eq("id", target.id);

    if (channel === "email") {
      if (!email) {
        return "There's no email address on file for them — offer to TEXT the link to this number instead, or let them know Fed Pilot will follow up to get them scheduled. Do NOT ask them for an email address.";
      }
      try {
        await sendEmail({
          to: email,
          subject: "Your Fed Pilot retirement report — confirm your time",
          html:
            `<p>Hi ${target.full_name ?? "there"},</p>` +
            `<p>Here's your one-tap link to lock in your free personalized retirement report session for <strong>${whenLabel}</strong>:</p>` +
            `<p><a href="${url}">Confirm my time</a></p>` +
            `<p>Just tap the link, pick that time, and hit confirm. Talk soon!</p>`,
          text: `Confirm your free Fed Pilot retirement report session for ${whenLabel}: ${url}`,
        });
      } catch (e) {
        console.error("[send_booking_link] email send failed:", e);
        return "Emailing the link failed on our end — offer to TEXT it to this number instead, or let them know Fed Pilot will follow up to get them scheduled. Do NOT ask them for an email address.";
      }
      await markSent("email");
      return `Emailed the booking link for ${whenLabel} to their address on file. Ask them to open it and confirm.`;
    }

    // text (default)
    if (!phoneE164) {
      return "There's no usable phone number to text — offer to email the link instead, or let them know Fed Pilot will follow up.";
    }
    await sendSms({
      to: phoneE164,
      body: `Fed Pilot: tap to confirm your Part 2 session for ${whenLabel} — ${url}`,
    });
    await markSent("text");
    return `Texted the booking link for ${whenLabel}. Ask them to tap it and confirm.`;
  }

  if (name === TOOL_LOG_OUTCOME) {
    const raw = String(args.status ?? "completed");
    const isHandoff = raw === "callback" || raw === "handoff";
    const status = (isHandoff ? "handoff" : raw) as CallTargetStatus;
    const notes = args.notes ? String(args.notes) : null;
    if (targetId) {
      await admin
        .from("call_targets")
        .update({ status, outcome_notes: notes, updated_at: new Date().toISOString() })
        .eq("id", targetId);
      if (isHandoff) {
        const t = await loadTarget(targetId);
        try {
          await notifyPart2Handoff({
            name: t?.full_name ?? null,
            phone: toE164(t?.phone) ?? t?.phone ?? null,
            agency: t?.agency ?? null,
            reason: notes || "Asked for a callback / wants a real person.",
          });
        } catch (e) {
          console.error("[log_outcome] handoff ClickUp notify failed:", e);
        }
      }
    }
    return isHandoff
      ? "Logged as a handoff — a teammate will be alerted to call them back."
      : "Outcome recorded.";
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
    const { hour, weekday } = localHourWeekday(tz);

    const { data: target } = await admin
      .from("call_targets")
      .select("status, attempts, campaign_id, booked_event_time, full_name, phone, agency")
      .eq("id", targetId)
      .maybeSingle<
        Pick<
          CallTarget,
          "status" | "attempts" | "campaign_id" | "booked_event_time" | "full_name" | "phone" | "agency"
        >
      >();

    // The agent's own disposition (set via log_outcome during the call) is
    // AUTHORITATIVE — it knows whether it reached a person, a voicemail, or no
    // one. A voicemail leaves a transcript too, so the endedReason heuristic
    // can't tell it apart; only fall back to the heuristic when the agent never
    // logged an outcome (status still "calling", e.g. the call dropped early).
    const agentDisposition = target && target.status !== "calling" ? target.status : null;
    const heuristic = classifyOutcome(message.endedReason, !!transcript);
    const statusToOutcome = (s: string): CallOutcome =>
      s === "voicemail" ? "voicemail" : s === "no_answer" ? "no_answer" : s === "failed" ? "failed" : "answered";
    // No agent disposition + an answered call = the call connected but ended
    // before the agent could finish. If a link already went out, count it
    // completed; otherwise hand it to the team (don't bury it as "completed").
    let finalStatus: string;
    if (agentDisposition) finalStatus = agentDisposition;
    else if (heuristic === "answered") finalStatus = target?.booked_event_time ? "completed" : "handoff";
    else finalStatus = heuristic;
    const outcome = statusToOutcome(finalStatus);

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

    // Never override the agent's explicit disposition; only set status when the
    // agent didn't log one (status was still "calling"). Schedule a retry for
    // voicemail / no-answer in either case.
    if (target && (target.status === "calling" || RETRYABLE.includes(target.status))) {
      if (target.status === "calling") update.status = finalStatus;
      if (finalStatus === "voicemail" || finalStatus === "no_answer") {
        const { data: campaign } = await admin
          .from("call_campaigns")
          .select("max_attempts")
          .eq("id", target.campaign_id)
          .maybeSingle<{ max_attempts: number }>();
        const maxAttempts = campaign?.max_attempts ?? 3;
        if (target.attempts < maxAttempts) {
          const hours = clientId ? await bestHoursForClient(clientId) : [];
          update.next_attempt_at = nextRetryAt(tz, hours, target.attempts).toISOString();
        } else {
          update.next_attempt_at = null; // out of attempts → stop
        }
      }
    }

    await admin.from("call_targets").update(update).eq("id", targetId);

    // Dropped/early-ended live call with no link sent → alert the team to call
    // them back by hand (the agent never logged an outcome).
    if (target && target.status === "calling" && finalStatus === "handoff") {
      try {
        await notifyPart2Handoff({
          name: target.full_name ?? null,
          phone: toE164(target.phone) ?? target.phone ?? null,
          agency: target.agency ?? null,
          reason: "Call connected but dropped before finishing — no booking link sent.",
        });
      } catch (e) {
        console.error("[end-of-call] handoff ClickUp notify failed:", e);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
