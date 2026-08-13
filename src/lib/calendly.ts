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

// ----------------------------------------------------------------------------
// Reconciliation: list real Part 2 bookings straight from Calendly (the source
// of truth), independent of whether the invitee.created webhook was delivered.
// Used by /api/calls/reconcile-clickup to backfill missed ClickUp alerts.
// ----------------------------------------------------------------------------

export type CalendlyBooking = {
  /** Calendly invitee uri — globally unique, one per booking. Dedupe key. */
  eventRef: string;
  name: string | null;
  email: string | null;
  /** ISO 8601 start of the booked slot. */
  eventTime: string | null;
  /** ISO 8601 time the invitee booked (invitee.created). */
  createdAt: string;
};

type Paginated<T> = { collection: T[]; pagination?: { next_page: string | null } };

async function calendlyGetAll<T>(firstUrl: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = firstUrl;
  // Bound the walk so a runaway pagination cursor can't spin forever.
  for (let i = 0; next && i < 50; i++) {
    const res = await fetch(next, {
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`Calendly GET ${res.status} ${await res.text()}`);
    const data = (await res.json()) as Paginated<T>;
    out.push(...(data.collection ?? []));
    next = data.pagination?.next_page ?? null;
  }
  return out;
}

let _orgUri: string | null = null;
async function organizationUri(): Promise<string> {
  if (_orgUri) return _orgUri;
  const res = await fetch(`${CALENDLY_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Calendly /users/me → ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { resource: { current_organization: string } };
  _orgUri = data.resource.current_organization;
  return _orgUri;
}

/**
 * All active Part 2 bookings whose invitee.created is at/after `sinceIso`.
 *
 * Calendly's scheduled_events endpoint filters by the slot's START time, not by
 * when the booking was made, so we scan events starting within the next
 * `windowDays` (a just-booked Part 2 slot is always in the future, and the
 * booking horizon is ~5 weeks) and keep invitees created since `sinceIso`. The
 * `windowDays` default of 45 covers the availability horizon with headroom.
 */
export async function listPart2Bookings(sinceIso: string, windowDays = 45): Promise<CalendlyBooking[]> {
  const org = await organizationUri();
  const wanted = eventTypeUri();
  const now = Date.now();
  const params = new URLSearchParams({
    organization: org,
    // NOTE: the `event_type` filter is unreliable on scheduled_events when
    // scoped by organization (Calendly returns every event type regardless), so
    // we send it as a hint but authoritatively filter client-side below.
    event_type: wanted,
    status: "active",
    // Include slots that just started / are mid-call so a booking made moments
    // ago for an imminent slot isn't skipped.
    min_start_time: new Date(now - 6 * 3_600_000).toISOString(),
    max_start_time: new Date(now + windowDays * 86_400_000).toISOString(),
    count: "100",
    sort: "start_time:asc",
  });

  type Event = { uri: string; start_time: string; event_type: string };
  type Invitee = { uri: string; name?: string; email?: string; created_at: string; status?: string };

  const events = await calendlyGetAll<Event>(`${CALENDLY_BASE}/scheduled_events?${params}`);
  const out: CalendlyBooking[] = [];
  for (const ev of events) {
    // Authoritative event-type filter (the query param above can't be trusted).
    if (ev.event_type !== wanted) continue;
    const invitees = await calendlyGetAll<Invitee>(`${ev.uri}/invitees?count=100&status=active`);
    for (const inv of invitees) {
      if (!inv.created_at || inv.created_at < sinceIso) continue;
      out.push({
        eventRef: inv.uri,
        name: inv.name ?? null,
        email: inv.email ?? null,
        eventTime: ev.start_time ?? null,
        createdAt: inv.created_at,
      });
    }
  }
  return out;
}

// Calendly prefills custom invitee questions by POSITION (a1, a2, …), not name.
// On the Part 2 form the custom questions are: a1 = "share anything to prepare",
// a2 = "best contact number?" (name/email/location aren't custom questions), so
// the phone goes in a2. Override with CALENDLY_PHONE_PARAM if the order changes.
const PHONE_PARAM = process.env.CALENDLY_PHONE_PARAM || "a2";
// Location prefill OFF: a live link test confirmed Calendly does NOT pre-select
// a location when the event offers a "choose from multiple" radio (Zoom/Phone) —
// neither a setting nor the `location` URL param works — so we don't append a
// dead param; the invitee picks the location themselves. CALENDLY_PREFILL_LOCATION
// can re-enable it if the event ever becomes a single, prefillable location type.
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
