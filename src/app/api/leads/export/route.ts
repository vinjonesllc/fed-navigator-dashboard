import { NextResponse, type NextRequest } from "next/server";
import Papa from "papaparse";
import { requireUser, userCanAccessClient } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { engagementIndex } from "@/lib/workshop-stats";
import { getAttendeeEvalColumns, getEvalColumnsByIdentity } from "@/lib/eval-comments";
import { fetchTabCsvForExport, listSheetTabs } from "@/lib/google-sheets";
import { parseNextWorkshops } from "@/lib/next-workshop";
import { splitName } from "@/lib/name";
import type { Attendee, Workshop } from "@/lib/supabase/types";

type Preset = "hot" | "engaged" | "live" | "noshow" | "all";

// Presets that produce an "attendee report" — the registration columns PLUS
// engagement, total time, and (for these only) the evaluation columns.
const ATTENDEE_PRESETS = new Set<Preset>(["live", "hot", "engaged"]);

function presetFilter(rows: Attendee[], workshop: Workshop, preset: Preset): Attendee[] {
  switch (preset) {
    case "hot": {
      const target = workshop.scheduled_minutes ?? 60;
      return rows.filter(
        (r) => r.text_opt_in && (r.total_time_minutes ?? 0) >= target * 0.5,
      );
    }
    case "engaged":
      return rows.filter(
        (r) =>
          (r.chats_sent ?? 0) > 0 ||
          (r.total_questions_asked ?? 0) > 0 ||
          (r.poll_quiz_responses ?? 0) > 0,
      );
    case "live":
      return rows.filter((r) => r.participation === "Live");
    case "noshow":
      return rows.filter((r) => r.attendance_bucket === "no_show");
    case "all":
    default:
      return rows;
  }
}

const norm = (e: string | null | undefined) => (e ?? "").toLowerCase().trim();

// Fixed labels for the two computed columns appended after the registration
// columns on attendee reports.
const ENGAGEMENT_COL = "Engagement";
const TOTAL_TIME_COL = "Total time spent";

// ---------------------------------------------------------------------------
// Registration-sheet-driven export (primary path)
//
// The columns come from THAT workshop's own registration tab, read live and
// replicated verbatim in the tab's own order — registration forms differ, so
// nothing is hard-coded. Attendee reports append Engagement (our index) + Total
// time spent + the evaluation columns; Export All appends just the two computed
// columns for every registrant. Empty columns are dropped.
// ---------------------------------------------------------------------------

/** Pull {month, day, year?} out of a registration tab name ("South West 7/21/26"). */
function parseTabDate(name: string): { m: number; d: number; y: number | null } | null {
  const m = name.match(/(\d{1,2})\s*[/-]\s*(\d{1,2})(?:\s*[/-]\s*(\d{2,4}))?/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let year: number | null = null;
  if (m[3]) {
    year = Number(m[3]);
    if (year < 100) year += 2000;
  }
  return { m: month, d: day, y: year };
}

/**
 * Resolve which registration tab belongs to this (usually completed) workshop.
 * The tab isn't stored on the workshop, so: prefer a still-present next_workshops
 * entry whose date matches; otherwise date-match the sheet's live tab names
 * (which persist). Returns the tab name, or null when nothing matches.
 */
async function resolveRegistrantTab(
  sheetUrl: string,
  nextWorkshops: unknown,
  workshopDate: string,
): Promise<string | null> {
  const iso = (workshopDate ?? "").slice(0, 10);

  // 1. A matching next_workshops entry (covers just-passed, not-yet-pruned ones).
  const entry = parseNextWorkshops(nextWorkshops).find((e) => e.date === iso);
  if (entry?.registrant_tab) return entry.registrant_tab;

  // 2. Date-match the sheet's tab names.
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const wy = Number(m[1]);
  const wm = Number(m[2]);
  const wd = Number(m[3]);

  const tabs = await listSheetTabs(sheetUrl);
  const matches = tabs.filter((t) => {
    const td = parseTabDate(t);
    if (!td) return false;
    if (td.m !== wm || td.d !== wd) return false;
    return td.y === null || td.y === wy; // tolerate year-less tab names
  });
  // Only trust an unambiguous single match.
  return matches.length === 1 ? matches[0] : null;
}

/** Detect the join-key columns in a registration tab's headers (names vary). */
function regKeyColumns(headers: string[]) {
  const find = (re: RegExp) => headers.find((h) => re.test(h.toLowerCase().trim())) ?? null;
  return {
    email: find(/e-?mail/),
    first: find(/first.*name|^first$/),
    last: find(/last.*name|^last$/),
    agency: find(/agency/),
  };
}

type RegBuild =
  | { csv: string }
  | { skip: string };

async function buildRegistrationCsv(
  sheetUrl: string,
  tab: string,
  nextWorkshops: unknown,
  workshop: Workshop,
  attendees: Attendee[],
  preset: Preset,
): Promise<RegBuild> {
  const csv = await fetchTabCsvForExport(sheetUrl, tab);
  if (!csv) return { skip: `could not read registration tab "${tab}"` };

  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/^﻿/, "").trim(),
  });
  // Replicate the tab's columns verbatim, in order; drop blank/unnamed headers
  // (e.g. a stray trailing comma) since they carry no meaning.
  const regHeaders = (parsed.meta.fields ?? []).filter((h) => h && h.trim() !== "");
  if (regHeaders.length === 0) return { skip: `registration tab "${tab}" has no columns` };
  const regRows = parsed.data;
  const keys = regKeyColumns(regHeaders);

  // Index this workshop's Zoom attendees by email for the engagement / time join.
  const attByEmail = new Map<string, Attendee>();
  for (const a of attendees) {
    const e = norm(a.email);
    if (e && !attByEmail.has(e)) attByEmail.set(e, a);
  }

  const isEngaged = (a: Attendee) =>
    (a.chats_sent ?? 0) > 0 ||
    (a.total_questions_asked ?? 0) > 0 ||
    (a.poll_quiz_responses ?? 0) > 0;

  // Join + preset filter. Each kept item pairs a registration row with its
  // matched attendee (if any).
  const joined: { reg: Record<string, string>; att: Attendee | null }[] = [];
  for (const reg of regRows) {
    const att = keys.email ? attByEmail.get(norm(reg[keys.email])) ?? null : null;
    const attended = att?.participation === "Live";
    let keep: boolean;
    switch (preset) {
      case "all":
        keep = true;
        break;
      case "live":
        keep = attended;
        break;
      case "noshow":
        keep = !attended;
        break;
      case "engaged":
        keep = attended && !!att && isEngaged(att);
        break;
      case "hot": {
        const target = workshop.scheduled_minutes ?? 60;
        keep = attended && !!att?.text_opt_in && (att?.total_time_minutes ?? 0) >= target * 0.5;
        break;
      }
      default:
        keep = true;
    }
    if (keep) joined.push({ reg, att });
  }

  // Evaluation columns — attendee reports only, matched by first+last+agency.
  const includeEval = ATTENDEE_PRESETS.has(preset);
  let evalHeaders: string[] = [];
  let evalPerRow: (Record<string, string> | null)[] = [];
  if (includeEval) {
    const people = joined.map(({ reg }) => ({
      first: keys.first ? reg[keys.first] ?? null : null,
      last: keys.last ? reg[keys.last] ?? null : null,
      agency: keys.agency ? reg[keys.agency] ?? null : null,
    }));
    try {
      const res = await getEvalColumnsByIdentity(sheetUrl, workshop.workshop_date, people);
      if ("error" in res) {
        console.warn(`[leads/export] eval columns unavailable: ${res.error}`);
      } else {
        evalHeaders = res.headers;
        evalPerRow = res.rows;
        console.log(`[leads/export] matched ${res.matched}/${people.length} attendees to evals`);
      }
    } catch (e) {
      console.warn("[leads/export] eval fetch failed:", e instanceof Error ? e.message : e);
    }
  }

  // Assemble rows: registration columns (verbatim) + Engagement + Total time +
  // eval columns. Column names are made unique so no eval question ever
  // collides with a registration header.
  const uniq = (name: string, used: Set<string>) => {
    let key = name;
    let n = 2;
    while (used.has(key)) key = `${name} (${n++})`;
    used.add(key);
    return key;
  };
  const used = new Set<string>();
  const regOut = regHeaders.map((h) => ({ header: h, key: uniq(h, used) }));
  const engKey = uniq(ENGAGEMENT_COL, used);
  const timeKey = uniq(TOTAL_TIME_COL, used);
  const evalOut = evalHeaders.map((h) => ({ header: h, key: uniq(h, used) }));

  const outRows = joined.map(({ reg, att }, i) => {
    const row: Record<string, string | number> = {};
    for (const { header, key } of regOut) row[key] = reg[header] ?? "";
    const live = att?.participation === "Live";
    row[engKey] = live ? engagementIndex(att, workshop.scheduled_minutes) ?? "" : "";
    row[timeKey] = att?.total_time_minutes ?? "";
    const ev = evalPerRow[i] ?? null;
    for (const { header, key } of evalOut) row[key] = ev ? (ev[header] ?? "") : "";
    return row;
  });

  const allColumns = [...regOut.map((r) => r.key), engKey, timeKey, ...evalOut.map((e) => e.key)];
  const nonEmpty = allColumns.filter((col) =>
    outRows.some((row) => row[col] !== "" && row[col] != null),
  );
  const columns = outRows.length === 0 ? allColumns : nonEmpty;

  return { csv: Papa.unparse(outRows, { columns }) };
}

// ---------------------------------------------------------------------------
// Attendee-table fallback (used when no registration tab can be resolved), so
// older workshops without a matching tab still export. Every stored attendee
// field + custom questions + eval, empty columns dropped.
// ---------------------------------------------------------------------------

function fullRow(r: Attendee, workshop: Workshop): Record<string, string | number> {
  const yn = (v: boolean | null | undefined) => (v == null ? "" : v ? "Yes" : "No");
  const name = splitName(r.first_name, r.last_name);
  return {
    first_name: name.first,
    last_name: name.last,
    email: r.email ?? "",
    email_domain: r.email_domain ?? "",
    phone: r.phone ?? "",
    phone_e164: r.phone_e164 ?? "",
    phone_extension: r.phone_extension ?? "",
    agency: r.agency ?? "",
    organization: r.organization ?? "",
    job_title: r.job_title ?? "",
    industry: r.industry ?? "",
    organization_size: r.organization_size ?? "",
    country_region: r.country_region ?? "",
    state: r.state_province ?? "",
    zip_postal_code: r.zip_postal_code ?? "",
    age: r.age ?? "",
    text_opt_in: yn(r.text_opt_in),
    marketing_opt_in: r.marketing_opt_in ?? "",
    marketing_consent_pre_checked: r.marketing_consent_pre_checked ?? "",
    registration_source: r.registration_source ?? "",
    registration_method: r.registration_method ?? "",
    authentication_status: r.authentication_status ?? "",
    authentication_method: r.authentication_method ?? "",
    ticket_type: r.ticket_type ?? "",
    participation: r.participation ?? "",
    attended: r.participation === "Live" ? "Yes" : "No",
    attendance_bucket: r.attendance_bucket ?? "",
    lead_score: r.lead_score ?? "",
    engagement_index:
      r.participation === "Live" ? engagementIndex(r, workshop.scheduled_minutes) ?? "" : "",
    engagement_score: r.engagement_score ?? "",
    sessions_attended: r.sessions_attended ?? "",
    sessions_registered: r.sessions_registered ?? "",
    total_time_minutes: r.total_time_minutes ?? "",
    total_recording_watch_minutes: r.total_recording_watch_minutes ?? "",
    lobby_attendance: r.lobby_attendance ?? "",
    first_join_time: r.first_join_time ?? "",
    last_exit_time: r.last_exit_time ?? "",
    last_registration_time: r.last_registration_time ?? "",
    chats_sent: r.chats_sent ?? "",
    total_questions_asked: r.total_questions_asked ?? "",
    poll_quiz_responses: r.poll_quiz_responses ?? "",
    reactions_sent: r.reactions_sent ?? "",
    clicks_cta: r.clicks_cta ?? "",
    resource_downloads: r.resource_downloads ?? "",
    registered_sessions: r.registered_sessions ?? "",
    registration_question: r.registration_question ?? "",
    external_id: r.external_id ?? "",
    created_at: r.created_at ?? "",
  };
}

const evalKey = (header: string) => `eval: ${header}`;

async function buildAttendeeFallbackCsv(
  rows: Attendee[],
  workshop: Workshop,
  sheetUrl: string | null,
  preset: Preset,
): Promise<string> {
  // Eval append (best-effort), only for attendee reports.
  let evalHeaders: string[] = [];
  let evalPerRow: (Record<string, string> | null)[] = [];
  if (sheetUrl && ATTENDEE_PRESETS.has(preset)) {
    const people = rows.map((r) => {
      const n = splitName(r.first_name, r.last_name);
      return { email: r.email ?? null, name: `${n.first} ${n.last}`.trim() || null };
    });
    try {
      const res = await getAttendeeEvalColumns(sheetUrl, workshop.workshop_date, people);
      if (!("error" in res)) {
        evalHeaders = res.headers;
        evalPerRow = res.rows;
      }
    } catch (e) {
      console.warn("[leads/export] fallback eval fetch failed:", e instanceof Error ? e.message : e);
    }
  }

  const baseKeys = Object.keys(fullRow({} as Attendee, workshop));
  const customKeys = Array.from(
    new Set(rows.flatMap((r) => Object.keys(r.custom_responses ?? {}))),
  )
    .filter((k) => !baseKeys.includes(k))
    .sort();
  const evalKeys = evalHeaders.map(evalKey);

  const fullRows = rows.map((r, i) => {
    const obj = fullRow(r, workshop);
    for (const k of customKeys) obj[k] = (r.custom_responses ?? {})[k] ?? "";
    const ev = evalPerRow[i] ?? null;
    for (const h of evalHeaders) obj[evalKey(h)] = ev ? (ev[h] ?? "") : "";
    return obj;
  });

  const allColumns = [...baseKeys, ...customKeys, ...evalKeys];
  const nonEmpty = allColumns.filter((col) =>
    fullRows.some((row) => row[col] !== "" && row[col] != null),
  );
  const columns = fullRows.length === 0 ? allColumns : nonEmpty;
  return Papa.unparse(fullRows, { columns });
}

export async function GET(request: NextRequest) {
  const session = await requireUser();
  const workshopId = request.nextUrl.searchParams.get("workshopId");
  const preset = (request.nextUrl.searchParams.get("preset") as Preset | null) ?? "all";
  if (!workshopId) {
    return NextResponse.json({ error: "workshopId is required" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: workshop } = await admin
    .from("workshops")
    .select("*")
    .eq("id", workshopId)
    .maybeSingle<Workshop>();

  if (!workshop) {
    return NextResponse.json({ error: "Workshop not found" }, { status: 404 });
  }
  if (!userCanAccessClient(session, workshop.client_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: attendeeData } = await admin
    .from("attendees")
    .select("*")
    .eq("workshop_id", workshopId);
  const attendees = (attendeeData ?? []) as Attendee[];

  const { data: client } = await admin
    .from("clients")
    .select("eval_sheet_url, next_workshops")
    .eq("id", workshop.client_id)
    .maybeSingle<{ eval_sheet_url: string | null; next_workshops: unknown }>();
  const sheetUrl = client?.eval_sheet_url?.trim() || null;

  // Primary: build from the workshop's own registration tab.
  let csv: string | null = null;
  if (sheetUrl) {
    try {
      const tab = await resolveRegistrantTab(sheetUrl, client?.next_workshops, workshop.workshop_date);
      if (tab) {
        const built = await buildRegistrationCsv(
          sheetUrl,
          tab,
          client?.next_workshops,
          workshop,
          attendees,
          preset,
        );
        if ("csv" in built) csv = built.csv;
        else console.warn(`[leads/export] registration build skipped: ${built.skip}`);
      } else {
        console.warn("[leads/export] no registration tab resolved; using attendee fallback");
      }
    } catch (e) {
      console.warn("[leads/export] registration build failed:", e instanceof Error ? e.message : e);
    }
  }

  // Fallback: attendee-table export when no registration tab could be used.
  if (csv === null) {
    const rows = presetFilter(attendees, workshop, preset);
    csv = await buildAttendeeFallbackCsv(rows, workshop, sheetUrl, preset);
  }

  const safeTitle = workshop.title.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  const filename = `leads_${safeTitle}_${preset}_${workshop.workshop_date}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
