import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// ----------------------------------------------------------------------------
// Call timing: when to place day-after calls, spread across a window, biased
// toward the hours people actually answer (learned from call_attempts).
// All "hours" are wall-clock hours in the workshop's timezone.
// ----------------------------------------------------------------------------

export const CALL_WINDOW_START_HOUR = 11; // 11am
export const CALL_WINDOW_END_HOUR = 17; // 5pm (exclusive — last calls start in the 4pm hour)

const FRIENDLY_TZ_TO_IANA: Record<string, string> = {
  eastern: "America/New_York",
  central: "America/Chicago",
  mountain: "America/Denver",
  pacific: "America/Los_Angeles",
};

function toIana(friendlyOrIana: string | null | undefined): string {
  if (!friendlyOrIana) return "America/New_York";
  const k = friendlyOrIana.trim().toLowerCase();
  if (FRIENDLY_TZ_TO_IANA[k]) return FRIENDLY_TZ_TO_IANA[k];
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: friendlyOrIana }).format(new Date());
    return friendlyOrIana;
  } catch {
    return "America/New_York";
  }
}

/**
 * Convert a wall-clock time (YYYY-MM-DD + hour:minute) in an IANA/friendly zone
 * to the corresponding UTC Date, accounting for that date's offset (DST-safe).
 */
export function zonedWallClockToUtc(
  dateIso: string,
  hour: number,
  minute: number,
  tz: string,
): Date {
  const iana = toIana(tz);
  const [y, m, d] = dateIso.slice(0, 10).split("-").map(Number);
  // First guess: treat the wall clock as if it were UTC, then correct by the
  // zone's offset at that instant.
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: iana,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  // What the guess instant looks like in the target zone:
  const asZoned = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") === 24 ? 0 : get("hour"), get("minute"));
  const offset = asZoned - guess; // zone is ahead of UTC by this much
  return new Date(guess - offset);
}

/**
 * Hours (within the calling window) ordered best-first by historical answer
 * rate for this client. Hours with little data sort neutrally, so early on the
 * full window is returned in natural order (→ even spread).
 */
export async function bestHoursForClient(clientId: string): Promise<number[]> {
  const window: number[] = [];
  for (let h = CALL_WINDOW_START_HOUR; h < CALL_WINDOW_END_HOUR; h++) window.push(h);

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("call_attempts")
    .select("local_hour, outcome")
    .eq("client_id", clientId)
    .not("local_hour", "is", null);

  const rows = data ?? [];
  if (rows.length < 20) return window; // not enough signal yet → even spread

  const stat = new Map<number, { answered: number; total: number }>();
  for (const r of rows) {
    const h = r.local_hour as number;
    if (h < CALL_WINDOW_START_HOUR || h >= CALL_WINDOW_END_HOUR) continue;
    const s = stat.get(h) ?? { answered: 0, total: 0 };
    s.total += 1;
    if (r.outcome === "answered") s.answered += 1;
    stat.set(h, s);
  }
  // Sort window hours by answer rate desc; unseen hours get a neutral 0.5 so
  // they're still tried (exploration), not buried.
  return [...window].sort((a, b) => {
    const ra = stat.has(a) ? stat.get(a)!.answered / stat.get(a)!.total : 0.5;
    const rb = stat.has(b) ? stat.get(b)!.answered / stat.get(b)!.total : 0.5;
    return rb - ra;
  });
}

/**
 * Pick the UTC instant for a target's first attempt: the day after the workshop,
 * placed at a window hour (cycling through `orderedHours` so calls concentrate
 * in the best hours) with minutes spread by index so they don't all fire at once.
 */
export function firstAttemptAt(
  workshopDateIso: string,
  tz: string,
  index: number,
  orderedHours: number[],
): Date {
  const [y, m, d] = workshopDateIso.slice(0, 10).split("-").map(Number);
  const dayAfter = new Date(Date.UTC(y, m - 1, d));
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
  const dayAfterIso = dayAfter.toISOString().slice(0, 10);

  const hours = orderedHours.length ? orderedHours : [CALL_WINDOW_START_HOUR];
  const hour = hours[index % hours.length];
  const minute = (index * 7) % 60; // stagger within the hour
  return zonedWallClockToUtc(dayAfterIso, hour, minute, tz);
}

/**
 * Reschedule a retry to the next best hour at least `minGapHours` out, rolling
 * to the next day if we've passed the window. Used after a no-answer/voicemail.
 */
export function nextRetryAt(tz: string, orderedHours: number[], attemptNo: number): Date {
  const hours = orderedHours.length ? orderedHours : [CALL_WINDOW_START_HOUR];
  // Walk forward a day per retry, choosing a different preferred hour each time.
  const now = new Date();
  const base = new Date(now.getTime() + 20 * 60 * 60 * 1000); // ~next day
  const iso = base.toISOString().slice(0, 10);
  const hour = hours[attemptNo % hours.length];
  return zonedWallClockToUtc(iso, hour, (attemptNo * 13) % 60, tz);
}
