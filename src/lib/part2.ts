import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Attendee,
  CallCampaign,
  CallTarget,
  Part2Registration,
  Workshop,
} from "@/lib/supabase/types";

/** A person on the call list, annotated with their Part 2 registration status. */
export type CallListEntry = {
  attendee_id: string;
  full_name: string;
  email: string | null;
  /** Display phone: the normalized E.164 if callable, else the raw value. */
  phone: string;
  /** Normalized, dialable number (E.164). Null = uncallable (bad/foreign). */
  phone_e164: string | null;
  phone_extension: string | null;
  /** True when there's a raw phone but it couldn't be normalized — "do not call". */
  phone_invalid: boolean;
  agency: string | null;
  /** total_time_minutes / scheduled_minutes, 0–100, null if scheduled unknown. */
  attendance_pct: number | null;
  text_opt_in: boolean;
  /** The matching registration row, if this person has already signed up. */
  registration: Part2Registration | null;
  /** Eligible to be called: live + has phone + not registered + not do-not-call. */
  callable: boolean;
  /** Flagged "do not call" by a human — kept off the call list permanently. */
  do_not_call: boolean;
  /** ISO timestamp of the most recent logged activity (AI or human), or null. */
  last_activity_at: string | null;
};

export type CallListResult = {
  workshop: Workshop;
  entries: CallListEntry[];
  summary: {
    /** Live attendees with a usable phone number. */
    with_phone: number;
    registered: number;
    callable: number;
    /** Live attendees missing a phone number (can't be called). */
    no_phone: number;
  };
};

const hasPhone = (p: string | null | undefined): p is string =>
  !!p && p.replace(/[^\d]/g, "").length >= 7;

function fullName(a: Attendee): string {
  return [a.first_name, a.last_name].filter(Boolean).join(" ").trim();
}

// Identity key for matching a person across attendee/registration rows when
// emails differ — lowercased, punctuation/space stripped ("O'Connor" → "oconnor").
const nameKey = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Build the Part 2 call list for a workshop: every LIVE attendee, with their
 * phone status and whether they've already registered. Registered people are
 * surfaced (so advisors can see them) but flagged not-callable — the registration
 * ledger is the call-suppression list.
 */
export async function getCallList(workshopId: string): Promise<CallListResult | null> {
  const admin = createSupabaseAdminClient();

  const { data: workshop } = await admin
    .from("workshops")
    .select("*")
    .eq("id", workshopId)
    .maybeSingle<Workshop>();
  if (!workshop) return null;

  const [{ data: attendeeRows }, { data: regRows }] = await Promise.all([
    admin
      .from("attendees")
      .select("*")
      .eq("workshop_id", workshopId)
      .eq("participation", "Live")
      .order("total_time_minutes", { ascending: false }),
    // ALL registrations, not just this workshop's: a person who booked Part 2
    // should be suppressed from every call list, and the same person can appear
    // as attendee rows across several workshops (and register under a different
    // email than they later show up under). We match on identity — email OR
    // normalized name — so those still get caught.
    admin.from("part2_registrations").select("*"),
  ]);

  const attendees = (attendeeRows ?? []) as Attendee[];
  const regs = (regRows ?? []) as Part2Registration[];
  const regByAttendee = new Map<string, Part2Registration>();
  const regByEmail = new Map<string, Part2Registration>();
  const regByName = new Map<string, Part2Registration>();
  for (const r of regs) {
    if (r.attendee_id) regByAttendee.set(r.attendee_id, r);
    if (r.email) {
      const k = r.email.toLowerCase();
      if (!regByEmail.has(k)) regByEmail.set(k, r);
    }
    const nk = nameKey(r.full_name);
    if (nk && !regByName.has(nk)) regByName.set(nk, r);
  }
  // Resolve a person's registration by attendee_id, then email, then name.
  const findRegistration = (a: Attendee): Part2Registration | null =>
    regByAttendee.get(a.id) ??
    (a.email ? regByEmail.get(a.email.toLowerCase()) : undefined) ??
    regByName.get(nameKey(fullName(a))) ??
    null;

  const scheduled = workshop.scheduled_minutes ?? null;

  // Latest activity timestamp per attendee (newest-first, chunked to keep URLs
  // small). Covers AI + human entries.
  const attendeeIds = attendees.map((a) => a.id);
  const lastActivity = new Map<string, string>();
  for (let i = 0; i < attendeeIds.length; i += 100) {
    const chunk = attendeeIds.slice(i, i + 100);
    if (chunk.length === 0) break;
    const { data: acts } = await admin
      .from("call_activities")
      .select("attendee_id, created_at")
      .in("attendee_id", chunk)
      .order("created_at", { ascending: false });
    for (const r of acts ?? []) {
      const aid = r.attendee_id as string | null;
      if (aid && !lastActivity.has(aid)) lastActivity.set(aid, r.created_at as string);
    }
  }

  const entries: CallListEntry[] = attendees.map((a) => {
    const registration = findRegistration(a);
    const e164 = a.phone_e164 ?? null;
    // A raw phone that didn't normalize is an invalid/uncallable number.
    const phoneInvalid = !e164 && hasPhone(a.phone);
    return {
      attendee_id: a.id,
      full_name: fullName(a) || a.email || "(no name)",
      email: a.email ?? null,
      phone: e164 ?? a.phone ?? "",
      phone_e164: e164,
      phone_extension: a.phone_extension ?? null,
      phone_invalid: phoneInvalid,
      agency: a.agency,
      attendance_pct:
        scheduled && scheduled > 0
          ? Math.round(((a.total_time_minutes ?? 0) / scheduled) * 100)
          : null,
      text_opt_in: !!a.text_opt_in,
      registration,
      callable: !!e164 && !registration && !a.do_not_call,
      do_not_call: !!a.do_not_call,
      last_activity_at: lastActivity.get(a.id) ?? null,
    };
  });

  return {
    workshop,
    entries,
    summary: {
      with_phone: entries.filter((e) => e.phone_e164).length,
      registered: entries.filter((e) => e.registration).length,
      callable: entries.filter((e) => e.callable).length,
      // Live attendees we can't call: no number at all, or an invalid one.
      no_phone: entries.filter((e) => !e.phone_e164).length,
    },
  };
}

const RECONCILE_DIALABLE = ["queued", "no_answer", "voicemail", "calling"];

/**
 * Ensure a self-serve Part 2 booking is reflected as a registration (the
 * call-suppression ledger) and that the person's call target, if any, is marked
 * booked. Used by the reconciler to close the gap the live webhook can't: when
 * someone books BEFORE their workshop's attendee roster is uploaded, the webhook
 * finds no attendee (so writes no registration), and nothing on the call list
 * suppresses them. Once the roster lands, this backfills the registration by
 * email so they drop off the call list.
 *
 * Matching: by email first; if that finds no attendee (the booker used a
 * different address than they registered with), fall back to a GLOBALLY UNIQUE
 * normalized-name match — i.e. only when exactly one attendee in the whole
 * system has that name, so we can never attach a booking to the wrong
 * same-named person. Still no match → "unmatched" (surfaced for manual review).
 * Idempotent: never overwrites a row the webhook already wrote.
 */
export async function ensurePart2RegistrationForBooking(booking: {
  email: string | null;
  name: string | null;
  eventTime: string | null;
  eventRef: string | null;
}): Promise<"created" | "exists" | "unmatched"> {
  const admin = createSupabaseAdminClient();

  let attendee: Attendee | null = null;
  if (booking.email) {
    const { data } = await admin
      .from("attendees")
      .select("*")
      .ilike("email", booking.email)
      .limit(1)
      .maybeSingle<Attendee>();
    attendee = data ?? null;
  }
  if (!attendee && booking.name) {
    // Name fallback for email mismatches — fetch same-last-name attendees and
    // keep only exact normalized-full-name matches. Accept ONLY when there's
    // exactly one such person system-wide.
    const key = nameKey(booking.name);
    const last = booking.name.trim().split(/\s+/).pop() ?? "";
    if (key && last) {
      const { data: cands } = await admin
        .from("attendees")
        .select("*")
        .ilike("last_name", `%${last}%`);
      const matches = ((cands ?? []) as Attendee[]).filter((a) => nameKey(fullName(a)) === key);
      if (matches.length === 1) attendee = matches[0];
    }
  }
  if (!attendee || !attendee.workshop_id) return "unmatched";

  const { data: ws } = await admin
    .from("workshops")
    .select("client_id")
    .eq("id", attendee.workshop_id)
    .maybeSingle<{ client_id: string }>();
  if (!ws?.client_id) return "unmatched";

  const { data: existing } = await admin
    .from("part2_registrations")
    .select("id")
    .eq("attendee_id", attendee.id)
    .maybeSingle<{ id: string }>();

  if (!existing) {
    // ignoreDuplicates: if the live webhook wrote a row in the same window,
    // leave its (richer) row untouched.
    await admin.from("part2_registrations").upsert(
      {
        client_id: ws.client_id,
        attendee_id: attendee.id,
        workshop_id: attendee.workshop_id,
        full_name:
          [attendee.first_name, attendee.last_name].filter(Boolean).join(" ").trim() ||
          booking.name,
        email: attendee.email,
        phone: attendee.phone ?? null,
        agency: attendee.agency ?? null,
        source: "self_serve",
        event_time: booking.eventTime,
        event_ref: booking.eventRef,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "attendee_id", ignoreDuplicates: true },
    );
  }

  // Take the person off the live call list if a target is still dialable.
  const { data: target } = await admin
    .from("call_targets")
    .select("id, status")
    .eq("attendee_id", attendee.id)
    .order("last_attempt_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle<{ id: string; status: string }>();
  if (target && RECONCILE_DIALABLE.includes(target.status)) {
    await admin
      .from("call_targets")
      .update({ status: "booked", booked_event_time: booking.eventTime, updated_at: new Date().toISOString() })
      .eq("id", target.id);
  }

  return existing ? "exists" : "created";
}

export type CampaignView = {
  campaign: CallCampaign | null;
  /** call_target keyed by attendee_id, for merging status into the call list. */
  targetsByAttendee: Record<string, CallTarget>;
};

/** Load the (single) calling campaign for a workshop, plus its targets keyed by
 *  attendee so the UI can show per-person call status. */
export async function getCampaignForWorkshop(workshopId: string): Promise<CampaignView> {
  const admin = createSupabaseAdminClient();
  const { data: campaign } = await admin
    .from("call_campaigns")
    .select("*")
    .eq("workshop_id", workshopId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<CallCampaign>();
  if (!campaign) return { campaign: null, targetsByAttendee: {} };

  const { data: targets } = await admin
    .from("call_targets")
    .select("*")
    .eq("campaign_id", campaign.id);

  const targetsByAttendee: Record<string, CallTarget> = {};
  for (const t of (targets ?? []) as CallTarget[]) {
    if (t.attendee_id) targetsByAttendee[t.attendee_id] = t;
  }
  return { campaign, targetsByAttendee };
}

/** Per-campaign outcome report for the Part 2 page. */
export type CampaignReport = {
  total: number; // people on the call list
  pickedUp: number; // distinct people who answered (a live pickup)
  fullConversation: number; // reached a real conclusion (talked it through)
  linksSent: number; // booking links delivered
  linkText: number; // …by text
  linkEmail: number; // …by email
  linkSentNotBooked: number; // got a link but hasn't confirmed — warm follow-up
  booked: number; // confirmed a Part 2 time
  declined: number;
  voicemail: number;
  noAnswer: number;
  handoff: number; // asked for a callback / dropped early — team calls by hand
  flaggedForReview: number; // agent flagged as off / hard to categorize
  badNumber: number; // skipped — un-callable number
  remaining: number; // still queued / in progress
};

export async function getCampaignReport(campaignId: string): Promise<CampaignReport> {
  const admin = createSupabaseAdminClient();
  const [{ data: targetRows }, { data: answeredRows }] = await Promise.all([
    admin
      .from("call_targets")
      .select("status, link_channel, booked_event_time, flagged_for_review")
      .eq("campaign_id", campaignId),
    admin
      .from("call_attempts")
      .select("target_id")
      .eq("campaign_id", campaignId)
      .eq("outcome", "answered"),
  ]);

  const targets = targetRows ?? [];
  const pickedUp = new Set(
    (answeredRows ?? []).map((a) => a.target_id as string | null).filter(Boolean),
  ).size;

  const r: CampaignReport = {
    total: targets.length,
    pickedUp,
    fullConversation: 0,
    linksSent: 0,
    linkText: 0,
    linkEmail: 0,
    linkSentNotBooked: 0,
    booked: 0,
    declined: 0,
    voicemail: 0,
    noAnswer: 0,
    handoff: 0,
    flaggedForReview: 0,
    badNumber: 0,
    remaining: 0,
  };
  for (const t of targets) {
    const s = t.status as string;
    if (s === "booked") r.booked += 1;
    else if (s === "declined") r.declined += 1;
    else if (s === "voicemail") r.voicemail += 1;
    else if (s === "no_answer") r.noAnswer += 1;
    else if (s === "handoff") r.handoff += 1;
    else if (s === "skipped") r.badNumber += 1;
    else if (s === "queued" || s === "calling") r.remaining += 1;
    if (t.flagged_for_review) r.flaggedForReview += 1;
    if (s === "completed" || s === "booked" || s === "declined") r.fullConversation += 1;
    if (t.booked_event_time) r.linksSent += 1;
    if (t.booked_event_time && s !== "booked") r.linkSentNotBooked += 1;
    if (t.link_channel === "text") r.linkText += 1;
    else if (t.link_channel === "email") r.linkEmail += 1;
  }
  return r;
}
