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

/**
 * Format a Postgres DATE or ISO timestamp as "May 20, 2026".
 * Parses the YYYY-MM-DD prefix directly (no timezone conversion), so a date
 * stored as 2026-05-20 always renders as May 20, 2026 regardless of viewer TZ.
 */
export function formatWorkshopDate(date: string | null | undefined): string {
  if (!date) return "—";
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return date;
  const month = MONTH_NAMES[parseInt(m[2], 10) - 1] ?? m[2];
  return `${month} ${parseInt(m[3], 10)}, ${m[1]}`;
}

/**
 * If the value looks like a YYYY-MM-DD date, render it human-readable.
 * Otherwise return the input unchanged (handy for free-text intent details
 * like "8 weeks", "Possibly December", or "Within 12 months").
 */
export function humanizeDateIfIso(value: string | null | undefined): string {
  if (!value) return "Within 12 months";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return formatWorkshopDate(value);
  return value;
}
