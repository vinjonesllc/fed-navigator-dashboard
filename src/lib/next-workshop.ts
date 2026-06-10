import "server-only";
import { countTabDataRows } from "@/lib/google-sheets";
import type { Client } from "@/lib/supabase/types";

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-06-05" -> "Friday, June 5" (parsed as a local date, no TZ shift). */
export function formatNextWorkshopDate(date: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return date;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const weekday = WEEKDAY_NAMES[d.getDay()];
  const month = MONTH_NAMES[Number(m[2]) - 1] ?? m[2];
  return `${weekday}, ${month} ${Number(m[3])}`;
}

/** hour 0-23 + tz -> "10am Central". Returns null if either is missing. */
export function formatNextWorkshopTime(
  hour: number | null,
  tz: string | null,
): string | null {
  if (hour === null || hour === undefined || !tz) return null;
  const h12 = hour % 12 || 12;
  const suffix = hour < 12 ? "am" : "pm";
  return `${h12}${suffix} ${tz}`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** "2026-05-10" -> "Friday, May 10th" (weekday + month + ordinal day). */
export function formatNextWorkshopDateOrdinal(date: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return date;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const weekday = WEEKDAY_NAMES[d.getDay()];
  const month = MONTH_NAMES[Number(m[2]) - 1] ?? m[2];
  return `${weekday}, ${month} ${ordinal(Number(m[3]))}`;
}

/** "2026-05-10" -> "05/10/2026" (US mm/dd/yyyy). Empty string on bad input. */
export function toUsDate(date: string | null | undefined): string {
  if (!date) return "";
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : "";
}

/** Today's date as YYYY-MM-DD in the server's local timezone. */
export function todayIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** True only when `date` (YYYY-MM-DD) is strictly after today. */
export function isFutureWorkshopDate(date: string | null | undefined): boolean {
  if (!date) return false;
  const iso = date.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && iso > todayIsoLocal();
}

export type NextWorkshopCard = {
  dateLabel: string;
  timeLabel: string | null;
  registrants: number | null;
};

/**
 * Build the Next Workshop card data for a client. Returns null when no date is
 * set (the UI then shows the "Contact Kelly" empty state). When a registrant
 * tab + eval sheet are configured, pulls the live registrant count.
 */
export async function getNextWorkshop(
  client: Pick<
    Client,
    | "next_workshop_date"
    | "next_workshop_hour"
    | "next_workshop_tz"
    | "next_workshop_registrant_tab"
    | "eval_sheet_url"
  >,
): Promise<NextWorkshopCard | null> {
  if (!client.next_workshop_date) return null;

  const registrants = await countTabDataRows(
    client.eval_sheet_url,
    client.next_workshop_registrant_tab,
  );

  return {
    dateLabel: formatNextWorkshopDate(client.next_workshop_date),
    timeLabel: formatNextWorkshopTime(client.next_workshop_hour, client.next_workshop_tz),
    registrants,
  };
}
