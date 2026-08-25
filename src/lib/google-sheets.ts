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
  if (!sheetUrl) return [];
  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) return [];

  // Preferred: the official API (precise) when a key is configured.
  const apiKey = process.env.GOOGLE_API_KEY;
  if (apiKey) {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title&key=${apiKey}`;
      const res = await fetch(url, { redirect: "follow" });
      if (res.ok) {
        const body = (await res.json()) as { sheets?: { properties?: { title?: string } }[] };
        const names = (body.sheets ?? [])
          .map((s) => s.properties?.title)
          .filter((t): t is string => !!t);
        if (names.length > 0) return names;
      } else {
        console.warn(`[google-sheets] listSheetTabs ${sheetId} -> HTTP ${res.status}`);
      }
    } catch (e) {
      console.error("[google-sheets] listSheetTabs (API) failed:", e);
    }
  }

  // Fallback (no API key): scrape tab names from the static htmlview. Works on
  // any "anyone with the link can view" sheet.
  return listTabsViaHtmlView(sheetId);
}

/**
 * Decode the JS string escapes Google emits in the htmlview bootstrap block.
 * Beyond `\/` and `\"` it uses `\xNN` / `\uNNNN` for punctuation — notably `&`,
 * so a tab literally named "L&L Registrations" arrives as `L\x26L Registrations`.
 * A naive `\\(.)` strip turned that into "Lx26L Registrations", a name that then
 * matched no real tab.
 */
function unescapeJsString(raw: string): string {
  return raw.replace(
    /\\(?:x([0-9a-fA-F]{2})|u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|(.))/g,
    (_m, hex2, uBrace, u4, other) => {
      if (hex2) return String.fromCodePoint(parseInt(hex2, 16));
      if (uBrace) return String.fromCodePoint(parseInt(uBrace, 16));
      if (u4) return String.fromCodePoint(parseInt(u4, 16));
      switch (other) {
        case "n": return "\n";
        case "t": return "\t";
        case "r": return "\r";
        default: return other;
      }
    },
  );
}

/**
 * Pull tab {name, gid} pairs out of the sheet's htmlview page, which embeds them
 * in an `items.push({name: "Tab", pageUrl: "...gid=NNN", ...})` bootstrap block.
 * No API key needed. The gid lets us read a tab via the fresher export endpoint.
 */
async function getTabItems(sheetId: string): Promise<{ name: string; gid: string }[]> {
  try {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`, {
      redirect: "follow",
    });
    if (!res.ok) return [];
    const html = await res.text();
    const items: { name: string; gid: string }[] = [];
    for (const m of html.matchAll(
      /name:\s*\\?"((?:\\.|[^"\\])*?)\\?",\s*pageUrl:[^}]*?gid=(\d+)/g,
    )) {
      const name = unescapeJsString(m[1]).trim();
      if (name) items.push({ name, gid: m[2] });
    }
    return items;
  } catch (e) {
    console.error("[google-sheets] getTabItems failed:", e);
    return [];
  }
}

async function listTabsViaHtmlView(sheetId: string): Promise<string[]> {
  return (await getTabItems(sheetId)).map((t) => t.name);
}

/**
 * Fetch the full raw CSV of a single tab (all columns + rows, header included).
 *
 * Prefers the `export?format=csv&gid=` endpoint (resolving the tab's gid from
 * the htmlview), because the gviz CSV endpoint serves a heavily CACHED snapshot
 * — recently-added cells (e.g. phone numbers) can be missing for a long time.
 * Falls back to gviz (by tab name) if the gid can't be resolved. Returns null
 * on any failure.
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

function isSignInHtml(text: string): boolean {
  // Google returns an HTML sign-in page when the sheet isn't link-readable.
  return text.trim().startsWith("<");
}

// Tab names travel through a saved DB column, a <select>, and two different
// Google endpoints, so compare them forgivingly: trailing spaces in the sheet's
// own title and casing differences must not cost us the gid.
const sameTab = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

async function fetchTabCsv(sheetId: string, tab: string): Promise<string | null> {
  // 1) Fresh path: resolve the tab's gid and use the export endpoint.
  try {
    const items = await getTabItems(sheetId);
    const match = items.find((t) => sameTab(t.name, tab));
    if (match) {
      const cb = Date.now(); // cache-buster — keep reads current
      const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${match.gid}&_cb=${cb}`;
      const res = await fetch(url, { redirect: "follow" });
      if (res.ok) {
        const text = await res.text();
        if (!isSignInHtml(text)) return text;
      }
    } else if (items.length > 0) {
      // We can see every tab and this isn't one of them (renamed or deleted).
      // Do NOT fall through to gviz: asked for a tab that doesn't exist, gviz
      // silently serves the FIRST sheet, which would export a different
      // workshop's registrants under this workshop's filename.
      console.warn(
        `[google-sheets] tab "${tab}" not found in ${sheetId}; available: ${items
          .map((t) => t.name)
          .join(", ")}`,
      );
      return null;
    }
  } catch (e) {
    console.error("[google-sheets] fetchTabCsv (export) failed:", e);
  }

  // 2) Fallback: gviz by tab name (cached, but works without a gid).
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    const text = await res.text();
    if (isSignInHtml(text)) return null;
    return text;
  } catch (e) {
    console.error("[google-sheets] fetchTabCsv (gviz) failed:", e);
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
