import "server-only";
import Papa from "papaparse";

/**
 * Google Sheets helpers shared by the eval-comments and next-workshop features.
 *
 * Two access paths, both for sheets shared "Anyone with the link can view":
 *  - Tab LISTING uses the official Sheets API v4 + GOOGLE_API_KEY (the keyless
 *    gviz endpoint can read a tab but can't enumerate them).
 *  - Tab DATA uses the keyless gviz CSV export, so reading a tab works even
 *    without an API key.
 */

export function extractSheetId(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

/**
 * List every tab (worksheet) title in the spreadsheet. Requires GOOGLE_API_KEY.
 * Returns [] on any failure (no key, private sheet, network error) so callers
 * degrade gracefully to a typed/saved tab name.
 */
export async function listSheetTabs(sheetUrl: string | null | undefined): Promise<string[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey || !sheetUrl) return [];
  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) return [];

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title&key=${apiKey}`;
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) {
      console.warn(`[google-sheets] listSheetTabs ${sheetId} -> HTTP ${res.status}`);
      return [];
    }
    const body = (await res.json()) as {
      sheets?: { properties?: { title?: string } }[];
    };
    return (body.sheets ?? [])
      .map((s) => s.properties?.title)
      .filter((t): t is string => !!t);
  } catch (e) {
    console.error("[google-sheets] listSheetTabs failed:", e);
    return [];
  }
}

/**
 * Fetch the full raw CSV of a single tab (all columns + rows, header included),
 * for download/export. Uses the keyless gviz endpoint, so it works on any
 * link-readable sheet. Returns null on any failure.
 */
export async function fetchTabCsvForExport(
  sheetUrl: string | null | undefined,
  tab: string | null | undefined,
): Promise<string | null> {
  if (!sheetUrl || !tab) return null;
  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) return null;
  return fetchTabCsv(sheetId, tab);
}

async function fetchTabCsv(sheetId: string, tab: string): Promise<string | null> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    const text = await res.text();
    // Google returns an HTML sign-in page when the sheet isn't link-readable.
    if (text.trim().startsWith("<")) return null;
    return text;
  } catch (e) {
    console.error("[google-sheets] fetchTabCsv failed:", e);
    return null;
  }
}

/**
 * Count the registrants in a tab = number of data rows with at least one
 * non-empty cell (header excluded). Returns null on any failure.
 */
export async function countTabDataRows(
  sheetUrl: string | null | undefined,
  tab: string | null | undefined,
): Promise<number | null> {
  if (!sheetUrl || !tab) return null;
  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) return null;

  const csv = await fetchTabCsv(sheetId, tab);
  if (csv === null) return null;

  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
  });
  const rows = parsed.data.filter((row) =>
    Object.values(row).some((v) => (v ?? "").trim() !== ""),
  );
  return rows.length;
}
