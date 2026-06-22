import "server-only";
import { countTabDataRows } from "@/lib/google-sheets";
import {
  NEXT_WORKSHOP_TIMEZONES,
  type Client,
  type NextWorkshopEntry,
  type NextWorkshopTz,
} from "@/lib/supabase/types";

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
  /** Index into the client's stored `next_workshops` array (for the export href). */
  index: number;
  dateLabel: string;
  timeLabel: string | null;
  registrants: number | null;
  /** Whether this entry has a registrant tab configured (gates the download button). */
  hasTab: boolean;
};

const TZ_VALUES: readonly string[] = NEXT_WORKSHOP_TIMEZONES;

/** Coerce raw jsonb into a clean, validated NextWorkshopEntry[] (drops dateless rows). */
export function parseNextWorkshops(raw: unknown): NextWorkshopEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: NextWorkshopEntry[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const date = typeof o.date === "string" ? o.date.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const hourNum = typeof o.hour === "number" ? o.hour : Number(o.hour);
    const hour =
      Number.isInteger(hourNum) && hourNum >= 0 && hourNum <= 23 ? hourNum : null;
    const tzRaw = typeof o.tz === "string" ? o.tz : "";
    const tz = TZ_VALUES.includes(tzRaw) ? (tzRaw as NextWorkshopTz) : null;
    const tab = typeof o.registrant_tab === "string" && o.registrant_tab.trim() ? o.registrant_tab.trim() : null;
    const regUrl = typeof o.reg_url === "string" && o.reg_url.trim() ? o.reg_url.trim() : null;
    out.push({ date, hour, tz, registrant_tab: tab, reg_url: regUrl });
  }
  return out;
}

/** The soonest STRICTLY-FUTURE entry, used to mirror the singular columns + AC. */
export function soonestFutureWorkshop(entries: NextWorkshopEntry[]): NextWorkshopEntry | null {
  const future = entries
    .filter((e) => isFutureWorkshopDate(e.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  return future[0] ?? null;
}

/**
 * Build the Next Workshop card data for a client — one card per stored entry,
 * sorted by date ascending. Returns [] when none are set (the UI then shows the
 * "Contact Kelly" empty state). When a registrant tab + eval sheet are
 * configured for an entry, pulls its live registrant count.
 */
export async function getNextWorkshops(
  client: Pick<Client, "next_workshops" | "eval_sheet_url">,
): Promise<NextWorkshopCard[]> {
  const entries = parseNextWorkshops(client.next_workshops)
    // keep the original stored index so the export href is stable, then sort
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date));

  return Promise.all(
    entries.map(async ({ entry, index }) => ({
      index,
      dateLabel: formatNextWorkshopDate(entry.date),
      timeLabel: formatNextWorkshopTime(entry.hour, entry.tz),
      registrants: await countTabDataRows(client.eval_sheet_url, entry.registrant_tab),
      hasTab: !!entry.registrant_tab,
    })),
  );
}
