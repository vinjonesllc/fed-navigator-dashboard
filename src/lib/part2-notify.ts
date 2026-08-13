import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { notifyPart2Booking } from "@/lib/clickup";
import type { Attendee } from "@/lib/supabase/types";

// ----------------------------------------------------------------------------
// Single, idempotent path for the "Part 2 booked" ClickUp alert, keyed on the
// Calendly invitee uri. Both the live webhook and the reconciler cron call this,
// so an alert goes out exactly once per booking whether it arrives in real time
// or is backfilled from Calendly later. See migration 0025 for the ledger.
// ----------------------------------------------------------------------------

export type NotifyBookingInput = {
  /** Calendly invitee uri — the dedupe key. */
  eventRef: string | null;
  name: string;
  email: string | null;
  eventTime: string | null;
  source: "ai_call" | "self_serve" | "reconciled";
  /** Supplied by the webhook (already resolved); the reconciler leaves these out
   *  and lets us resolve from the attendee by email. */
  agency?: string | null;
  workshopTitle?: string | null;
};

/**
 * Post the booking alert to ClickUp at most once. Returns "posted" when it sent,
 * "skipped" when this booking was already recorded. Throws only if the ClickUp
 * POST fails (so callers can decide whether to swallow — the webhook does, the
 * reconciler logs and moves on to the next booking).
 */
export async function notifyPart2BookingOnce(input: NotifyBookingInput): Promise<"posted" | "skipped"> {
  const admin = createSupabaseAdminClient();

  // Dedupe on the invitee uri. Without one we can't guard, so post best-effort
  // (matches the pre-ledger behavior) and don't record.
  if (input.eventRef) {
    const { data: existing } = await admin
      .from("part2_booking_notifications")
      .select("event_ref")
      .eq("event_ref", input.eventRef)
      .maybeSingle<{ event_ref: string }>();
    if (existing) return "skipped";
  }

  // Fill in agency / workshop title from the attendee when the caller didn't
  // already have them (the reconciler path).
  let agency = input.agency ?? null;
  let workshopTitle = input.workshopTitle ?? null;
  if ((agency === null || workshopTitle === null) && input.email) {
    const { data: attendee } = await admin
      .from("attendees")
      .select("*")
      .ilike("email", input.email)
      .limit(1)
      .maybeSingle<Attendee>();
    if (attendee) {
      if (agency === null) agency = attendee.agency ?? null;
      if (workshopTitle === null && attendee.workshop_id) {
        const { data: ws } = await admin
          .from("workshops")
          .select("title")
          .eq("id", attendee.workshop_id)
          .maybeSingle<{ title: string }>();
        workshopTitle = ws?.title ?? null;
      }
    }
  }

  await notifyPart2Booking({
    name: input.name,
    agency,
    workshopTitle: workshopTitle ?? "Fed Pilot workshop",
    slotTime: input.eventTime,
    source: input.source,
  });

  // Record only after a successful post, so a failed POST leaves the booking
  // eligible for the next reconciler pass.
  if (input.eventRef) {
    await admin.from("part2_booking_notifications").upsert(
      {
        event_ref: input.eventRef,
        full_name: input.name,
        email: input.email,
        event_time: input.eventTime,
        source: input.source,
        notified_at: new Date().toISOString(),
      },
      { onConflict: "event_ref" },
    );
  }
  return "posted";
}
