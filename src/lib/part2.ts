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
  phone: string;
  agency: string | null;
  /** total_time_minutes / scheduled_minutes, 0–100, null if scheduled unknown. */
  attendance_pct: number | null;
  text_opt_in: boolean;
  /** The matching registration row, if this person has already signed up. */
  registration: Part2Registration | null;
  /** Eligible to be called: live + has phone + not already registered. */
  callable: boolean;
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
    admin
      .from("part2_registrations")
      .select("*")
      .eq("workshop_id", workshopId),
  ]);

  const attendees = (attendeeRows ?? []) as Attendee[];
  const regs = (regRows ?? []) as Part2Registration[];
  const regByAttendee = new Map<string, Part2Registration>();
  for (const r of regs) {
    if (r.attendee_id) regByAttendee.set(r.attendee_id, r);
  }

  const scheduled = workshop.scheduled_minutes ?? null;

  const entries: CallListEntry[] = attendees.map((a) => {
    const registration = regByAttendee.get(a.id) ?? null;
    const phoneOk = hasPhone(a.phone);
    return {
      attendee_id: a.id,
      full_name: fullName(a) || a.email || "(no name)",
      email: a.email ?? null,
      phone: a.phone ?? "",
      agency: a.agency,
      attendance_pct:
        scheduled && scheduled > 0
          ? Math.round(((a.total_time_minutes ?? 0) / scheduled) * 100)
          : null,
      text_opt_in: !!a.text_opt_in,
      registration,
      callable: phoneOk && !registration,
    };
  });

  const withPhone = entries.filter((e) => hasPhone(e.phone));
  return {
    workshop,
    entries,
    summary: {
      with_phone: withPhone.length,
      registered: entries.filter((e) => e.registration).length,
      callable: entries.filter((e) => e.callable).length,
      no_phone: entries.length - withPhone.length,
    },
  };
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
