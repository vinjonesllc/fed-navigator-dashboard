import "server-only";
import Papa from "papaparse";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listSheetTabs } from "@/lib/google-sheets";

type ExtractedComment = {
  comment_text: string;
  comment_author?: string | null;
  comment_agency?: string | null;
  comment_date?: string | null;
};

function parseLocalDate(iso: string): Date {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return new Date(iso);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Parse a wide variety of date strings used in spreadsheets:
//   "01-22-2025", "1/22/2025 11:12:38", "2025-01-22", "Jan 22, 2025"
// Returns null when the string can't be confidently parsed as a date.
function tryParseDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;

  // ISO-ish: YYYY-MM-DD
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  // US: M/D/YYYY or M-D-YYYY (optional time)
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y = 2000 + y;
    return new Date(y, Number(m[1]) - 1, Number(m[2]));
  }

  // Fallback to Date.parse (handles "Jan 22, 2025" etc.)
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

// Score each header by how many of its values look like dates;
// pick the highest scorer with a clear margin.
function pickDateColumn(rows: Record<string, string>[], headers: string[]): string | null {
  if (rows.length === 0) return null;
  const sample = rows.slice(0, 50);
  let best: { col: string; score: number } | null = null;
  for (const h of headers) {
    let hits = 0;
    for (const r of sample) {
      const v = r[h];
      if (v && tryParseDate(v)) hits++;
    }
    if (!best || hits > best.score) best = { col: h, score: hits };
  }
  // Require at least half the sample to look like dates to claim the column.
  if (best && best.score >= sample.length / 2) return best.col;
  return null;
}

const TAB_CANDIDATES = [
  "EVALS",
  "EVAL",
  "EVALUATION",
  "EVALUATIONS",
  "Evals",
  "Eval",
  "Evaluation",
  "Evaluations",
  "evals",
  "eval",
  "evaluations",
];

function extractSheetId(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

async function fetchSheetCsv(sheetId: string, tab: string): Promise<string | null> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    const text = await res.text();
    // Google returns HTML (sign-in page) when sheet isn't public-readable.
    if (text.trim().startsWith("<")) return null;
    if (text.length < 10) return null;
    return text;
  } catch (e) {
    console.error("[eval-comments] sheet fetch failed:", e);
    return null;
  }
}

// Pick the evaluation tab from a sheet's REAL tab list. Prefer an exact
// eval/evaluation(s) name, then any tab containing "eval".
function pickEvalTab(tabs: string[]): string | null {
  return (
    tabs.find((t) => /^\s*eval(uation)?s?\s*$/i.test(t)) ??
    tabs.find((t) => /eval/i.test(t)) ??
    null
  );
}

async function fetchEvalCsv(
  sheetId: string,
  knownTabs: string[],
): Promise<{ tab: string; csv: string } | null> {
  // CRITICAL: gviz silently returns the FIRST sheet when asked for a tab name
  // that doesn't exist. So when we know the real tab names (via the Sheets
  // API), fetch ONLY the resolved eval tab — never blind-probe candidate names,
  // or we'd lock onto whatever the first sheet happens to be (e.g. registrations).
  const resolved = pickEvalTab(knownTabs);
  const order = resolved ? [resolved] : TAB_CANDIDATES;
  for (const tab of order) {
    const csv = await fetchSheetCsv(sheetId, tab);
    if (csv) return { tab, csv };
  }
  return null;
}

// Shared loader: resolve the eval tab, parse it, and filter to the same
// workshop_date → +7-day window the testimonials use. Returns the windowed
// rows + headers, or an `error`.
async function loadWindowedEvalRows(
  sheetUrl: string,
  workshopDate: string,
): Promise<
  | { tab: string; headers: string[]; total: number; windowed: Record<string, string>[]; windowEnd: string }
  | { error: string }
> {
  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) return { error: "Could not parse sheet ID from URL" };

  const knownTabs = await listSheetTabs(sheetUrl);
  const fetched = await fetchEvalCsv(sheetId, knownTabs);
  if (!fetched) {
    return {
      error:
        "Could not load the EVAL / EVALUATION tab. Make sure the sheet is shared as 'Anyone with the link can view'.",
    };
  }

  const parsed = Papa.parse<Record<string, string>>(fetched.csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/^﻿/, "").trim(),
  });
  if (!parsed.data || parsed.data.length === 0) {
    return { error: `Tab "${fetched.tab}" was empty` };
  }

  const headers = parsed.meta.fields ?? Object.keys(parsed.data[0]);

  const WINDOW_DAYS = 7;
  const windowStart = parseLocalDate(workshopDate);
  const windowEndDate = parseLocalDate(workshopDate);
  windowEndDate.setDate(windowEndDate.getDate() + WINDOW_DAYS);

  const dateCol = pickDateColumn(parsed.data, headers);
  const windowed = dateCol
    ? parsed.data.filter((row) => {
        const raw = row[dateCol]?.trim();
        if (!raw) return false;
        const d = tryParseDate(raw);
        if (!d) return false;
        return d >= windowStart && d <= windowEndDate;
      })
    : parsed.data;

  return {
    tab: fetched.tab,
    headers,
    total: parsed.data.length,
    windowed,
    windowEnd: isoDate(windowEndDate),
  };
}

/**
 * Build a CSV of ALL evaluation responses tied to a workshop — every row in the
 * eval tab within the workshop_date → +7-day window, all columns. Used by the
 * download button. Returns the CSV string + metadata, or an `error`.
 */
export async function getEvalExportCsv(
  sheetUrl: string,
  workshopDate: string,
): Promise<
  | { csv: string; tab: string; total: number; count: number; windowEnd: string }
  | { error: string }
> {
  const loaded = await loadWindowedEvalRows(sheetUrl, workshopDate);
  if ("error" in loaded) return loaded;

  const csv = Papa.unparse({
    fields: loaded.headers,
    data: loaded.windowed.map((row) => loaded.headers.map((h) => row[h] ?? "")),
  });

  return {
    csv,
    tab: loaded.tab,
    total: loaded.total,
    count: loaded.windowed.length,
    windowEnd: loaded.windowEnd,
  };
}

const normEmail = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
const normName = (v: string | null | undefined) =>
  (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Find one attendee's evaluation response in the windowed eval rows, matched by
 * email (when the sheet has an email column) and otherwise by full name. The
 * eval sheet is keyed by name, so name matching is best-effort. Returns the
 * matched row's non-empty cells as label/value pairs, or `found: false`.
 */
export async function getAttendeeEval(
  sheetUrl: string,
  workshopDate: string,
  email: string | null,
  name: string | null,
): Promise<
  | { found: true; tab: string; fields: { label: string; value: string }[] }
  | { found: false; tab?: string }
  | { error: string }
> {
  const loaded = await loadWindowedEvalRows(sheetUrl, workshopDate);
  if ("error" in loaded) return loaded;

  const wantEmail = normEmail(email);
  const wantName = normName(name);
  if (!wantEmail && !wantName) return { found: false, tab: loaded.tab };

  // Identify email/name columns by header keyword. Handle both a single
  // combined name column ("First & Last Name") and split first/last columns.
  const emailCol = loaded.headers.find((h) => /e-?mail/i.test(h)) ?? null;
  const nameCols = loaded.headers.filter((h) => /name/i.test(h));
  const firstCol = loaded.headers.find((h) => /first.*name/i.test(h)) ?? null;
  const lastCol = loaded.headers.find((h) => /last.*name/i.test(h)) ?? null;

  const match = loaded.windowed.find((row) => {
    if (emailCol && wantEmail && normEmail(row[emailCol]) === wantEmail) return true;
    if (!wantName) return false;
    // Each name-ish column on its own (covers a single "Full Name" column).
    for (const nc of nameCols) {
      if (normName(row[nc]) === wantName) return true;
    }
    // Split first + last columns combined.
    if (firstCol && lastCol) {
      if (normName(`${row[firstCol] ?? ""} ${row[lastCol] ?? ""}`) === wantName) return true;
    }
    return false;
  });

  if (!match) return { found: false, tab: loaded.tab };

  const fields = loaded.headers
    .map((h) => ({ label: h, value: (match[h] ?? "").trim() }))
    .filter((f) => f.value !== "");

  return { found: true, tab: loaded.tab, fields };
}

export async function fetchEvalComments(
  workshopId: string,
): Promise<{ inserted: number; error?: string }> {
  const apiKey = process.env.FEDNAV_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { inserted: 0, error: "FEDNAV_ANTHROPIC_API_KEY not set" };
  }

  const admin = createSupabaseAdminClient();

  const { data: workshop } = await admin
    .from("workshops")
    .select("id, client_id, workshop_date")
    .eq("id", workshopId)
    .maybeSingle();

  if (!workshop) return { inserted: 0, error: "Workshop not found" };

  const { data: client } = await admin
    .from("clients")
    .select("eval_sheet_url")
    .eq("id", workshop.client_id)
    .maybeSingle();

  const url = client?.eval_sheet_url?.trim();
  if (!url) {
    return { inserted: 0, error: "No eval sheet URL on this client" };
  }

  const sheetId = extractSheetId(url);
  if (!sheetId) {
    return { inserted: 0, error: "Could not parse sheet ID from URL" };
  }

  const knownTabs = await listSheetTabs(url);
  const fetched = await fetchEvalCsv(sheetId, knownTabs);
  if (!fetched) {
    return {
      inserted: 0,
      error:
        "Could not load EVAL / EVALUATION tab. Make sure the sheet is shared as 'Anyone with the link can view' and has a tab named EVAL or EVALUATION.",
    };
  }

  const parsed = Papa.parse<Record<string, string>>(fetched.csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/^﻿/, "").trim(),
  });

  if (!parsed.data || parsed.data.length === 0) {
    return { inserted: 0, error: `Tab "${fetched.tab}" was empty` };
  }

  const headers = parsed.meta.fields ?? Object.keys(parsed.data[0]);

  // Strict forward window: workshop_date through workshop_date + N days, inclusive.
  const WINDOW_DAYS = 7;
  const workshopDateStr = workshop.workshop_date as string;
  const windowStart = parseLocalDate(workshopDateStr);
  const windowEndDate = parseLocalDate(workshopDateStr);
  windowEndDate.setDate(windowEndDate.getDate() + WINDOW_DAYS);
  const windowEnd = isoDate(windowEndDate);

  // Heuristically identify the date column — pick the column whose values
  // look the most date-like, so we can pre-filter in code (saves ~2000 tokens
  // per skipped row when the sheet has thousands of rows).
  const dateCol = pickDateColumn(parsed.data, headers);

  const windowed = dateCol
    ? parsed.data.filter((row) => {
        const raw = row[dateCol]?.trim();
        if (!raw) return false;
        const d = tryParseDate(raw);
        if (!d) return false;
        return d >= windowStart && d <= windowEndDate;
      })
    : parsed.data;

  console.log(
    `[eval-comments] sheet has ${parsed.data.length} rows, date column "${dateCol ?? "(unknown)"}", ${windowed.length} fall in ${workshopDateStr} → ${windowEnd}`,
  );

  // Hard cap so we never blow the prompt size even if the heuristic mismatches.
  const HARD_CAP = 400;
  const trimmed = windowed.slice(0, HARD_CAP);

  if (trimmed.length === 0) {
    return {
      inserted: 0,
      error: `No rows in ${workshopDateStr} → ${windowEnd} window (sheet has ${parsed.data.length} total rows; date column detected: ${dateCol ?? "none"})`,
    };
  }

  const rowsAsLines = trimmed
    .map((row, i) => {
      const parts = headers.map((h) => `${h}=${(row[h] ?? "").replace(/\s+/g, " ").slice(0, 300)}`);
      return `${i + 1}. ${parts.join(" | ")}`;
    })
    .join("\n");

  const prompt = `You are reviewing post-workshop evaluation responses from a Google Sheet.

Workshop date: ${workshop.workshop_date}
Tab name: ${fetched.tab}
Sheet columns: ${headers.join(", ")}

# Task

From the rows below:

1. Identify (a) the date column (usually a "Timestamp" or "Date Submitted" column), (b) the **name column** ("First & Last Name" or similar), (c) the **agency column** ("Agency" or similar), and (d) the **two comment columns**: typically named "Tell Coworkers?" and "Other Comments?" (case-insensitive — match anything that looks like recommendation-to-coworkers or open-ended feedback). Treat each non-empty cell in the comment columns as a separate candidate testimonial.
2. Date filtering is **already done in code** — every row below falls within ${workshop.workshop_date} → ${windowEnd} (workshop day + ${WINDOW_DAYS} calendar days). Trust the pre-filtered set; do not re-filter or reject rows on date.
3. From the candidate testimonials (across both comment columns, all matching rows), pick up to **7 of the most impressive** — the ones that make Fed Pilot's workshop and service look incredible. Prefer:
   - Glowing praise of the presenter, content, or experience
   - Specific, vivid language (not "great!" alone — pick "Tony's explanation of FERS finally made it click after years of confusion")
   - Distinct sentiments — don't return 7 near-duplicates; pick variety across attendees AND across both columns
   - Comments that mention takeaways, gratitude, intent to recommend, or "wish I'd done this sooner" energy
4. Strip leading/trailing whitespace. Do not paraphrase — return the comment verbatim. Truncate at ~500 chars only if the comment is unusually long.
5. Also compute the **aggregate star rating** across the date-filtered rows. Identify the three 1–5 star rating columns (typically "Knowledgable Presenter?", "Content well organized?", "Overall Experience" — any column whose values are integers 1–5 counts). For each filtered row, take every numeric 1–5 value across those columns and include it in the average. Treat blank cells as missing data (skip them — do NOT count as 0). Return the average rounded to **one decimal place** and the total number of distinct ROWS that contributed at least one rating.

# Output

Strict JSON only, no prose or markdown:

{
  "diagnostic": "<one sentence: which column was the date, which were the comment columns, how many rows fell in the ${workshop.workshop_date} → ${windowEnd} window, and (if 0) what date range you saw>",
  "rating": {"avg": <number 0-5 with one decimal, or null if no rating data>, "responses": <int — number of distinct rows that contributed at least one rating>},
  "comments": [{"comment_text":"<verbatim>","comment_author":"<name or null>","comment_agency":"<agency or null>","comment_date":"<YYYY-MM-DD or null>"}]
}

If no rows match the date window, return comments=[] BUT still fill in diagnostic so we can debug.

# Rows (${trimmed.length} in window, of ${parsed.data.length} total in sheet)

${rowsAsLines}`;

  let raw: string;
  try {
    const client = new Anthropic({ apiKey });
    console.log(
      `[eval-comments] calling Claude — ${trimmed.length} rows in window (sheet has ${parsed.data.length}) from "${fetched.tab}"`,
    );
    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system:
        "You output JSON only. Your entire response must be a single JSON object starting with { and ending with }. Never include preamble, explanation, markdown fences, or commentary. No text before or after the JSON.",
      messages: [{ role: "user", content: prompt }],
    });
    raw = resp.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[eval-comments] Claude failed:", msg);
    return { inserted: 0, error: `Claude API: ${msg}` };
  }

  const json = raw.match(/\{[\s\S]*\}/);
  if (!json) {
    console.error("[eval-comments] no JSON in response:", raw.slice(0, 300));
    return { inserted: 0, error: "Claude returned no JSON" };
  }

  let parsedJson: {
    comments?: ExtractedComment[];
    diagnostic?: string;
    rating?: { avg?: number | null; responses?: number | null };
  };
  try {
    parsedJson = JSON.parse(json[0]);
  } catch (e) {
    console.error("[eval-comments] JSON parse failed:", e);
    return { inserted: 0, error: "Claude JSON malformed" };
  }

  const comments = (parsedJson.comments ?? []).filter(
    (c) => c.comment_text && c.comment_text.trim().length > 0,
  );
  const diagnostic = parsedJson.diagnostic?.slice(0, 400) ?? "";

  const ratingAvg =
    typeof parsedJson.rating?.avg === "number" &&
    parsedJson.rating.avg >= 0 &&
    parsedJson.rating.avg <= 5
      ? Math.round(parsedJson.rating.avg * 10) / 10
      : null;
  const ratingResponses =
    typeof parsedJson.rating?.responses === "number" && parsedJson.rating.responses >= 0
      ? Math.floor(parsedJson.rating.responses)
      : null;

  console.log(
    `[eval-comments] Claude returned ${comments.length} comment(s), rating=${ratingAvg}/${ratingResponses} — diagnostic: ${diagnostic}`,
  );

  // Race guard: workshop may have been deleted while Claude was running.
  const { data: stillExists } = await admin
    .from("workshops")
    .select("id")
    .eq("id", workshopId)
    .maybeSingle();
  if (!stillExists) {
    console.warn("[eval-comments] workshop deleted before insert; skipping");
    return { inserted: 0, error: "Workshop no longer exists" };
  }

  // Persist the rating on the workshop (null when not derivable).
  await admin
    .from("workshops")
    .update({
      eval_rating_avg: ratingAvg,
      eval_rating_responses: ratingResponses,
    })
    .eq("id", workshopId);

  // Replace any prior comments for this workshop.
  await admin.from("workshop_eval_comments").delete().eq("workshop_id", workshopId);

  if (comments.length === 0) {
    return {
      inserted: 0,
      error: diagnostic || "Claude returned no matching comments",
    };
  }

  const { error } = await admin.from("workshop_eval_comments").insert(
    comments.slice(0, 7).map((c, i) => ({
      workshop_id: workshopId,
      comment_text: c.comment_text.trim().slice(0, 2000),
      comment_author: c.comment_author?.trim().slice(0, 200) ?? null,
      comment_agency: c.comment_agency?.trim().slice(0, 100) ?? null,
      comment_date: c.comment_date ?? null,
      display_order: i,
    })),
  );

  if (error) {
    console.error("[eval-comments] insert failed:", error.message);
    return { inserted: 0, error: error.message };
  }

  return { inserted: Math.min(comments.length, 7) };
}
