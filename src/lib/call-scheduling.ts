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

// ----------------------------------------------------------------------------
// Workday / calling-window gate. We only dial on US workdays (Mon–Fri, excluding
// federal holidays) and only inside the calling window. Enforced at dial time in
// the cron, so a call scheduled for a weekend/holiday is simply held until the
// next workday in-window rather than firing at a bad time.
// ----------------------------------------------------------------------------

function nthWeekdayUtc(year: number, month0: number, weekday: number, n: number): Date {
  const first = new Date(Date.UTC(year, month0, 1));
  const shift = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month0, 1 + shift + (n - 1) * 7));
}
function lastWeekdayUtc(year: number, month0: number, weekday: number): Date {
  const last = new Date(Date.UTC(year, month0 + 1, 0));
  const shift = (last.getUTCDay() - weekday + 7) % 7;
  return new Date(Date.UTC(year, month0, last.getUTCDate() - shift));
}
function observedUtc(year: number, month0: number, day: number): Date {
  const d = new Date(Date.UTC(year, month0, day));
  const dow = d.getUTCDay();
  if (dow === 6) d.setUTCDate(d.getUTCDate() - 1); // Sat → observed Fri
  else if (dow === 0) d.setUTCDate(d.getUTCDate() + 1); // Sun → observed Mon
  return d;
}
const ymdUtc = (d: Date) => d.toISOString().slice(0, 10);

/** Observed US federal holidays for a year (the weekday offices are closed), as
 *  a set of YYYY-MM-DD. Includes next year's New Year when observed on Dec 31. */
function usFederalHolidays(year: number): Set<string> {
  const s = new Set<string>();
  const add = (d: Date) => s.add(ymdUtc(d));
  add(observedUtc(year, 0, 1)); // New Year's Day
  add(nthWeekdayUtc(year, 0, 1, 3)); // MLK — 3rd Mon Jan
  add(nthWeekdayUtc(year, 1, 1, 3)); // Presidents' — 3rd Mon Feb
  add(lastWeekdayUtc(year, 4, 1)); // Memorial — last Mon May
  add(observedUtc(year, 5, 19)); // Juneteenth
  add(observedUtc(year, 6, 4)); // Independence Day
  add(nthWeekdayUtc(year, 8, 1, 1)); // Labor — 1st Mon Sep
  add(nthWeekdayUtc(year, 9, 1, 2)); // Columbus — 2nd Mon Oct
  add(observedUtc(year, 10, 11)); // Veterans Day
  add(nthWeekdayUtc(year, 10, 4, 4)); // Thanksgiving — 4th Thu Nov
  add(observedUtc(year, 11, 25)); // Christmas
  add(observedUtc(year + 1, 0, 1)); // next New Year (may be observed Dec 31)
  return s;
}

/** Local date / weekday / hour as seen in a zone. */
function localParts(tz: string, now: Date): { ymd: string; weekday: number; hour: number } {
  const iana = toIana(tz);
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: iana,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const ymd = `${get("year")}-${get("month")}-${get("day")}`;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const hour = Number(get("hour")) % 24;
  return { ymd, weekday, hour };
}

/** True when it's a US workday in the zone (Mon–Fri, not a federal holiday). */
export function isUsWorkday(tz: string, now: Date = new Date()): boolean {
  const { ymd, weekday } = localParts(tz, now);
  if (weekday === 0 || weekday === 6) return false;
  return !usFederalHolidays(Number(ymd.slice(0, 4))).has(ymd);
}

/** True when NOW is OK to dial in the zone: a US workday AND inside the calling
 *  window (11am–5pm). The cron gates every dial on this. */
export function canDialNow(tz: string, now: Date = new Date()): boolean {
  const { hour } = localParts(tz, now);
  if (hour < CALL_WINDOW_START_HOUR || hour >= CALL_WINDOW_END_HOUR) return false;
  return isUsWorkday(tz, now);
}
