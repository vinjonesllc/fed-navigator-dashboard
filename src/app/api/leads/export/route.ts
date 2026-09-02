import { NextResponse, type NextRequest } from "next/server";
import Papa from "papaparse";
import { requireUser, userCanAccessClient } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { engagementIndex } from "@/lib/workshop-stats";
import { getAttendeeEvalColumns, getEvalColumnsByIdentity } from "@/lib/eval-comments";
import { fetchTabCsvForExport } from "@/lib/google-sheets";
import { splitName } from "@/lib/name";
import { hasEvaluations } from "@/lib/workshop-type";
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

// Leading Y/N column on Export All Registrants, so a mixed registrant list can
// be sorted by who actually showed up. Attendee reports are already live-only.
const ATTENDED_COL = "ATTENDED?";

// ---------------------------------------------------------------------------
// Registration-sheet-driven export (primary path)
//
// The registration data comes from EXACTLY the tab chosen at upload and saved on
// the workshop (workshop.registrant_tab) — no date/name inference. Its columns
// are replicated verbatim in the tab's own order (forms differ, nothing is
// hard-coded), scoped to this workshop by the Zoom attendee emails (so a shared
// "Master Registrations" list resolves to just this workshop's people).
// Attendee reports append Engagement (our index) + Total time spent + eval;
// Export All appends just the two computed columns. Empty columns are dropped.
// ---------------------------------------------------------------------------

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
  const keys = regKeyColumns(regHeaders);
  // A real registrant list must have an Email column — the join key for both
  // engagement and workshop scoping. Without one (e.g. a summary tab) we skip to
  // the attendee-based fallback rather than export nonsense.
  if (!keys.email) return { skip: `tab "${tab}" has no Email column` };
  const emailCol = keys.email;

  // Scope the tab to THIS workshop by the emails in its Zoom upload (registrants
  // + no-shows). For a per-workshop tab this keeps ~everyone; for a shared master
  // list it selects just this workshop's people.
  const attEmails = new Set(attendees.map((a) => norm(a.email)).filter(Boolean));
  const regRows = parsed.data.filter((r) => attEmails.has(norm(r[emailCol])));

  // The Zoom upload IS the registration list, so a tab that belongs to this
  // workshop covers nearly all of it. Near-zero overlap means the workshop is
  // pointed at the wrong tab (e.g. a "MASTER" tab holding a different month) —
  // and because the join is what filters the rows, that used to produce a
  // header-only CSV with no error. Skip to the attendee fallback instead, so a
  // misconfigured tab degrades to a usable export rather than a blank one.
  const covered = new Set(regRows.map((r) => norm(r[emailCol]))).size;
  const coverage = attEmails.size > 0 ? covered / attEmails.size : 1;
  console.log(
    `[leads/export] tab "${tab}" covers ${covered}/${attEmails.size} attendees`,
  );
  if (attEmails.size >= 5 && coverage < 0.25) {
    return {
      skip: `tab "${tab}" matches only ${covered} of ${attEmails.size} attendees — wrong tab for this workshop`,
    };
  }

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
    const att = attByEmail.get(norm(reg[emailCol])) ?? null;
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
  // L&Ls have no evaluation, so they get the registration columns alone.
  const includeEval = ATTENDEE_PRESETS.has(preset) && hasEvaluations(workshop);
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
  const attendedKey = preset === "all" ? uniq(ATTENDED_COL, used) : null;
  const regOut = regHeaders.map((h) => ({ header: h, key: uniq(h, used) }));
  const engKey = uniq(ENGAGEMENT_COL, used);
  const timeKey = uniq(TOTAL_TIME_COL, used);
  const evalOut = evalHeaders.map((h) => ({ header: h, key: uniq(h, used) }));

  const outRows = joined.map(({ reg, att }, i) => {
    const row: Record<string, string | number> = {};
    const live = att?.participation === "Live";
    if (attendedKey) row[attendedKey] = live ? "Y" : "N";
    for (const { header, key } of regOut) row[key] = reg[header] ?? "";
    row[engKey] = live ? engagementIndex(att, workshop.scheduled_minutes) ?? "" : "";
    row[timeKey] = att?.total_time_minutes ?? "";
    const ev = evalPerRow[i] ?? null;
    for (const { header, key } of evalOut) row[key] = ev ? (ev[header] ?? "") : "";
    return row;
  });

  const allColumns = [
    ...(attendedKey ? [attendedKey] : []),
    ...regOut.map((r) => r.key),
    engKey,
    timeKey,
    ...evalOut.map((e) => e.key),
  ];
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
  if (sheetUrl && ATTENDEE_PRESETS.has(preset) && hasEvaluations(workshop)) {
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

  const attendedKey = preset === "all" ? ATTENDED_COL : null;
  const baseKeys = Object.keys(fullRow({} as Attendee, workshop));
  const customKeys = Array.from(
    new Set(rows.flatMap((r) => Object.keys(r.custom_responses ?? {}))),
  )
    .filter((k) => !baseKeys.includes(k))
    .sort();
  const evalKeys = evalHeaders.map(evalKey);

  const fullRows = rows.map((r, i) => {
    const obj = fullRow(r, workshop);
    if (attendedKey) obj[attendedKey] = r.participation === "Live" ? "Y" : "N";
    for (const k of customKeys) obj[k] = (r.custom_responses ?? {})[k] ?? "";
    const ev = evalPerRow[i] ?? null;
    for (const h of evalHeaders) obj[evalKey(h)] = ev ? (ev[h] ?? "") : "";
    return obj;
  });

  const allColumns = [...(attendedKey ? [attendedKey] : []), ...baseKeys, ...customKeys, ...evalKeys];
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
    .select("eval_sheet_url")
    .eq("id", workshop.client_id)
    .maybeSingle<{ eval_sheet_url: string | null }>();
  const sheetUrl = client?.eval_sheet_url?.trim() || null;

  // Primary: build from EXACTLY the registrations tab chosen at upload and saved
  // on the workshop. No date/name inference. Anything else falls back below.
  const tab = workshop.registrant_tab?.trim() || null;
  let csv: string | null = null;
  if (sheetUrl && tab) {
    try {
      const built = await buildRegistrationCsv(sheetUrl, tab, workshop, attendees, preset);
      if ("csv" in built) csv = built.csv;
      else console.warn(`[leads/export] registration tab "${tab}" unusable: ${built.skip}`);
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
