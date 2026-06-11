import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { notifyPart2Booking } from "@/lib/clickup";
import { verifyCalendlySignature } from "@/lib/webhook-verify";
import type { Attendee, CallTarget } from "@/lib/supabase/types";

// Calendly fires invitee.created the instant someone confirms the tapped link.
// This is the authoritative "booked" signal: we flip the call_target to booked,
// write the part2_registrations ledger row (the call-suppression source), and
// DM the user on ClickUp.
//
// Auth: verify the `Calendly-Webhook-Signature` HMAC over the raw body using the
// subscription's signing key. Enforced when CALENDLY_WEBHOOK_SIGNING_KEY is set.

type CalendlyPayload = {
  event?: string;
  payload?: {
    email?: string;
    name?: string;
    scheduled_event?: { start_time?: string; uri?: string; event_type?: string };
    uri?: string;
  };
};

const AI_IN_FLIGHT: CallTarget["status"][] = [
  "calling",
  "voicemail",
  "no_answer",
  "completed",
];

export async function POST(request: NextRequest) {
  // Read the raw body so we can verify the HMAC signature over the exact bytes.
  const raw = await request.text();
  const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (signingKey) {
    const sig = request.headers.get("calendly-webhook-signature");
    if (!verifyCalendlySignature(sig, raw, signingKey)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: CalendlyPayload;
  try {
    body = JSON.parse(raw) as CalendlyPayload;
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }
  if (body.event !== "invitee.created") return NextResponse.json({ ok: true });

  // This subscription is user-scoped, so it fires for ALL of the advisor's
  // event types. Only act on the configured Part 2 event type.
  const expectedEventType = process.env.CALENDLY_EVENT_TYPE_URI;
  const bookedEventType = body.payload?.scheduled_event?.event_type;
  if (expectedEventType && bookedEventType && bookedEventType !== expectedEventType) {
    return NextResponse.json({ ok: true, ignored: "different event type" });
  }

  const email = body.payload?.email ?? null;
  const name = body.payload?.name ?? "Someone";
  const startTime = body.payload?.scheduled_event?.start_time ?? null;
  const eventRef = body.payload?.scheduled_event?.uri ?? body.payload?.uri ?? null;

  const admin = createSupabaseAdminClient();

  // Match the booking to an attendee by email, then to their most recent call
  // target. A booking tied to an in-flight call is an AI booking; otherwise it's
  // someone self-registering through the public link.
  let attendee: Attendee | null = null;
  if (email) {
    const { data } = await admin
      .from("attendees")
      .select("*")
      .ilike("email", email)
      .limit(1)
      .maybeSingle<Attendee>();
    attendee = data ?? null;
  }

  let target: CallTarget | null = null;
  if (attendee) {
    const { data } = await admin
      .from("call_targets")
      .select("*")
      .eq("attendee_id", attendee.id)
      .order("last_attempt_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<CallTarget>();
    target = data ?? null;
  }

  const source: "ai_call" | "self_serve" =
    target && AI_IN_FLIGHT.includes(target.status) ? "ai_call" : "self_serve";

  // Resolve client_id + workshop title from the attendee's workshop (client_id
  // is required on the ledger row).
  let clientId: string | null = null;
  let workshopTitle = "Fed Pilot workshop";
  if (attendee?.workshop_id) {
    const { data: ws } = await admin
      .from("workshops")
      .select("client_id, title")
      .eq("id", attendee.workshop_id)
      .maybeSingle<{ client_id: string; title: string }>();
    if (ws) {
      clientId = ws.client_id;
      workshopTitle = ws.title;
    }
  }

  // Ledger row — only when attributable to a client. (A self-registration from
  // an unknown email can't be tied to a client yet; we still alert below.)
  let registrationId: string | null = null;
  if (clientId) {
    const { data: reg, error: regErr } = await admin
      .from("part2_registrations")
      .upsert(
        {
          client_id: clientId,
          attendee_id: attendee?.id ?? null,
          workshop_id: attendee?.workshop_id ?? null,
          full_name: attendee
            ? [attendee.first_name, attendee.last_name].filter(Boolean).join(" ").trim() || name
            : name,
          email,
          phone: attendee?.phone ?? null,
          agency: attendee?.agency ?? null,
          source,
          event_time: startTime,
          event_ref: eventRef,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "attendee_id" },
      )
      .select("id")
      .maybeSingle<{ id: string }>();
    if (regErr) console.error("[calendly webhook] part2_registrations upsert failed:", regErr.message);
    registrationId = reg?.id ?? null;
  }

  if (target) {
    await admin
      .from("call_targets")
      .update({
        status: "booked",
        booked_event_time: startTime,
        registration_id: registrationId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", target.id);
  }

  try {
    await notifyPart2Booking({
      name: attendee
        ? [attendee.first_name, attendee.last_name].filter(Boolean).join(" ").trim() || name
        : name,
      agency: attendee?.agency ?? null,
      workshopTitle,
      slotTime: startTime,
      source,
    });
  } catch (e) {
    // Don't fail the webhook if the ClickUp DM hiccups — the booking is recorded.
    console.error("[calendly webhook] ClickUp notify failed:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true });
}
