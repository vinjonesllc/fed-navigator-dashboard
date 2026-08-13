import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqualStr } from "@/lib/webhook-verify";
import { listPart2Bookings } from "@/lib/calendly";
import { notifyPart2BookingOnce } from "@/lib/part2-notify";

// ClickUp-notification reconciler. Treats Calendly as the source of truth and
// posts a "Part 2 booked" alert for any recent booking not already in the
// part2_booking_notifications ledger. This recovers BOTH failure modes that
// silently dropped alerts:
//   1. the invitee.created webhook ran but the ClickUp POST failed, and
//   2. the webhook never fired / never reached the notify step at all.
// Because it keys on the Calendly invitee uri (via notifyPart2BookingOnce), it
// is idempotent and safe to run as often as you like. Secret-gated with
// CRON_SECRET, like /api/calls/cron. Scheduled by Supabase pg_cron — see
// migration 0025_part2_booking_notifications.sql.

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
  for (const b of bookings) {
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
  }

  if (posted > 0) {
    console.log(`[reconcile-clickup] backfilled ${posted} missed ClickUp alert(s)`);
  }
  return NextResponse.json({ ok: true, scanned: bookings.length, posted, skipped, failed });
}
