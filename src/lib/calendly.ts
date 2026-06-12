import "server-only";

// ----------------------------------------------------------------------------
// Calendly integration for the live-assisted booking flow.
//
// Calendly has NO API to create a booking directly, so we: (1) read real open
// times via the availability API, (2) hand the agent the slot's own
// `scheduling_url` with name/email prefilled — a one-tap confirm link — and
// (3) learn the booking actually happened via the invitee.created webhook.
//
// Requires (Standard+ Calendly plan):
//   CALENDLY_TOKEN          — personal access token
//   CALENDLY_EVENT_TYPE_URI — the Part 2 event type, e.g.
//                             https://api.calendly.com/event_types/XXXX
// ----------------------------------------------------------------------------

const CALENDLY_BASE = "https://api.calendly.com";

function token(): string {
  const t = process.env.CALENDLY_TOKEN;
  if (!t) throw new Error("CALENDLY_TOKEN is not set");
  return t;
}

function eventTypeUri(): string {
  const u = process.env.CALENDLY_EVENT_TYPE_URI;
  if (!u) throw new Error("CALENDLY_EVENT_TYPE_URI is not set");
  return u;
}

export type CalendlySlot = {
  /** ISO 8601 start time. */
  start_time: string;
  /** Deep link to book exactly this slot. */
  scheduling_url: string;
};

type AvailableTimesResponse = {
  collection: {
    status: string;
    start_time: string;
    scheduling_url: string;
    invitees_remaining: number;
  }[];
};

/**
 * Open Part 2 times over the next `days` (Calendly caps a single query at 7
 * days, and start_time must be in the future).
 */
async function fetchWindow(startIso: string, endIso: string): Promise<CalendlySlot[]> {
  const params = new URLSearchParams({
    event_type: eventTypeUri(),
    start_time: startIso,
    end_time: endIso,
  });
  const res = await fetch(`${CALENDLY_BASE}/event_type_available_times?${params}`, {
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Calendly availability → ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as AvailableTimesResponse;
  return data.collection
    .filter((s) => s.status === "available" && s.invitees_remaining > 0)
    .map((s) => ({ start_time: s.start_time, scheduling_url: s.scheduling_url }));
}

/**
 * Open Part 2 times across up to ~5 weeks. Calendly caps each query at 7 days,
 * so we walk consecutive weekly windows and aggregate — this lets the agent look
 * past the first week (e.g. the advisor's next opening is in week 2, or the
 * caller wants "early next month"). Pass `fromIso` to start the search later.
 * Stops early once enough slots are collected, so a busy first week stays fast.
 */
export async function getAvailableSlots(days = 35, fromIso?: string): Promise<CalendlySlot[]> {
  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  const WEEK = 7 * DAY;
  const baseMs = fromIso ? new Date(fromIso).getTime() : Date.now();
  const base = Number.isNaN(baseMs) ? Date.now() : baseMs;
  let cursor = Math.max(Date.now() + HOUR, base); // start_time must be in the future
  const hardEnd = base + days * DAY;
  const MAX_RESULTS = 12;
  const MAX_WINDOWS = 6;

  const out: CalendlySlot[] = [];
  for (let w = 0; w < MAX_WINDOWS && cursor < hardEnd && out.length < MAX_RESULTS; w++) {
    const end = Math.min(cursor + WEEK - 60_000, hardEnd); // keep span just under 7 days
    if (end <= cursor) break;
    out.push(...(await fetchWindow(new Date(cursor).toISOString(), new Date(end).toISOString())));
    cursor = end;
  }
  return out.slice(0, MAX_RESULTS);
}

// Calendly prefills custom invitee questions by POSITION (a1, a2, …), not name.
// On the Part 2 form the custom questions are: a1 = "share anything to prepare",
// a2 = "best contact number?" (name/email/location aren't custom questions), so
// the phone goes in a2. Override with CALENDLY_PHONE_PARAM if the order changes.
const PHONE_PARAM = process.env.CALENDLY_PHONE_PARAM || "a2";
// Location prefill is OFF by default. A `location` param can only DEFAULT a
// choice that the event type already offers — it can't add one — and this
// advisor's Part 2 event has no Zoom/phone option to land on. To enable later
// (once the event type offers Zoom as a location option), set the env var
// CALENDLY_PREFILL_LOCATION to the option's EXACT label (e.g. "Zoom" or
// "Zoom Meeting") — no code change/redeploy needed.
const PREFILL_LOCATION = process.env.CALENDLY_PREFILL_LOCATION ?? "";

/** Add name/email/phone + location prefill to a slot's scheduling URL so the
 *  tap is one step. */
export function prefilledBookingUrl(
  schedulingUrl: string,
  invitee: { name?: string | null; email?: string | null; phone?: string | null },
): string {
  const url = new URL(schedulingUrl);
  if (invitee.name) url.searchParams.set("name", invitee.name);
  if (invitee.email) url.searchParams.set("email", invitee.email);
  if (invitee.phone) url.searchParams.set(PHONE_PARAM, invitee.phone);
  if (PREFILL_LOCATION) url.searchParams.set("location", PREFILL_LOCATION);
  return url.toString();
}
