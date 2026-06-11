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
export async function getAvailableSlots(days = 4): Promise<CalendlySlot[]> {
  const start = new Date(Date.now() + 60 * 60 * 1000); // +1h, must be future
  const end = new Date(start.getTime() + Math.min(days, 7) * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    event_type: eventTypeUri(),
    start_time: start.toISOString(),
    end_time: end.toISOString(),
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

/** Add name/email prefill to a slot's scheduling URL so the tap is one step. */
export function prefilledBookingUrl(
  schedulingUrl: string,
  invitee: { name?: string | null; email?: string | null },
): string {
  const url = new URL(schedulingUrl);
  if (invitee.name) url.searchParams.set("name", invitee.name);
  if (invitee.email) url.searchParams.set("email", invitee.email);
  return url.toString();
}
