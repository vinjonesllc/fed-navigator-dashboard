import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqualStr } from "@/lib/webhook-verify";
import { listPart2Bookings } from "@/lib/calendly";
import { notifyPart2BookingOnce } from "@/lib/part2-notify";
import { ensurePart2RegistrationForBooking } from "@/lib/part2";

// Part 2 booking reconciler. Treats Calendly as the source of truth for recent
// bookings and, for each one, makes sure the two side effects the live
// invitee.created webhook is supposed to produce actually happened:
//   1. the "Part 2 booked" ClickUp alert (via the part2_booking_notifications
//      ledger) — recovers a dropped webhook or a flaky ClickUp POST; and
//   2. the part2_registrations row + booked call target (the call-suppression
//      ledger) — recovers the case where someone books BEFORE their workshop's
//      attendee roster is uploaded, so the webhook found no attendee to attach a
//      registration to and they'd otherwise stay on the AI call list.
// Both are idempotent (ledger keyed on the invitee uri; registration upsert
// keyed on attendee_id), so this is safe to run as often as you like.
// Secret-gated with CRON_SECRET, like /api/calls/cron; scheduled by pg_cron —
// see migration 0025_part2_booking_notifications.sql.

// Trailing window to rescan. Comfortably larger than the cron cadence so a
// missed tick (or a short outage) still self-heals; the ledger prevents dupes.
const LOOKBACK_HOURS = Number(process.env.PART2_RECONCILE_LOOKBACK_HOURS) || 72;

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = request.headers.get("x-cron-secret");
  if (!secret || !got || !timingSafeEqualStr(got, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sinceIso = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000).toISOString();

  let bookings;
  try {
    bookings = await listPart2Bookings(sinceIso);
  } catch (e) {
    console.error("[reconcile-clickup] Calendly fetch failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "calendly_fetch_failed" }, { status: 502 });
  }

  let posted = 0;
  let skipped = 0;
  let failed = 0;
  let registrationsCreated = 0;
  let unmatched = 0;
  for (const b of bookings) {
    // (1) ClickUp alert
    try {
      const result = await notifyPart2BookingOnce({
        eventRef: b.eventRef,
        name: b.name || "Someone",
        email: b.email,
        eventTime: b.eventTime,
        source: "reconciled",
      });
      if (result === "posted") posted++;
      else skipped++;
    } catch (e) {
      // Leave it unrecorded so the next pass retries.
      failed++;
      console.error(
        "[reconcile-clickup] notify failed for",
        b.email ?? b.eventRef,
        e instanceof Error ? e.message : e,
      );
    }

    // (2) Registration / call-suppression backfill
    try {
      const reg = await ensurePart2RegistrationForBooking(b);
      if (reg === "created") registrationsCreated++;
      else if (reg === "unmatched") unmatched++;
    } catch (e) {
      console.error(
        "[reconcile-clickup] registration backfill failed for",
        b.email ?? b.eventRef,
        e instanceof Error ? e.message : e,
      );
    }
  }

  if (posted > 0 || registrationsCreated > 0) {
    console.log(
      `[reconcile-clickup] backfilled ${posted} ClickUp alert(s), ${registrationsCreated} registration(s)`,
    );
  }
  // `unmatched` = bookings whose Calendly email matches no attendee (often a
  // personal email used to book vs the work email they registered with). These
  // can't be auto-suppressed; log the count so a persistent gap is visible.
  if (unmatched > 0) {
    console.log(`[reconcile-clickup] ${unmatched} booking(s) unmatched to an attendee (manual review)`);
  }
  return NextResponse.json({
    ok: true,
    scanned: bookings.length,
    posted,
    skipped,
    failed,
    registrationsCreated,
    unmatched,
  });
}
