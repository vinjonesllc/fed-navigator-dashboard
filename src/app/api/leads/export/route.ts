import { NextResponse, type NextRequest } from "next/server";
import Papa from "papaparse";
import { requireUser, userCanAccessClient } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { engagementIndex } from "@/lib/workshop-stats";
import { getAttendeeEvalColumns } from "@/lib/eval-comments";
import { splitName } from "@/lib/name";
import type { Attendee, Workshop } from "@/lib/supabase/types";

type Preset = "hot" | "engaged" | "live" | "noshow" | "all";

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

// Every stored field for one attendee, in a stable, readable column order.
// `custom_responses` is flattened separately (one column per question).
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
    // Engagement Index (0–10) shown in the dashboard; only for live attendees.
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

// Post-workshop evaluation columns to append, aligned to the export's rows:
// `perRow[i]` is attendee i's matched eval response (or null when unmatched).
type EvalColumns = { headers: string[]; perRow: (Record<string, string> | null)[] };

// Prefix eval-sheet headers so they're unmistakably the survey response (and
// never collide with a registration column of the same name, e.g. agency).
const evalKey = (header: string) => `eval: ${header}`;

// Build the CSV for a set of rows. Both "Export All" and "Export Attendees"
// share this: every stored attendee field (plus each custom/registration
// question flattened into its own column), including engagement, and — on the
// end — the attendee's post-workshop evaluation response. The only difference
// between the two buttons is *which rows* they pass in (all vs. live
// attendees). Columns that are empty for every row in this particular export
// are dropped, so a workshop that only populated fields A–K downloads with just
// those columns — no sea of blank headers.
function buildCsv(rows: Attendee[], workshop: Workshop, evals?: EvalColumns): string {
  const baseKeys = Object.keys(fullRow({} as Attendee, workshop));
  const customKeys = Array.from(
    new Set(rows.flatMap((r) => Object.keys(r.custom_responses ?? {}))),
  )
    .filter((k) => !baseKeys.includes(k))
    .sort();
  const evalHeaders = evals?.headers ?? [];
  const evalKeys = evalHeaders.map(evalKey);

  const fullRows = rows.map((r, i) => {
    const obj = fullRow(r, workshop);
    for (const k of customKeys) obj[k] = (r.custom_responses ?? {})[k] ?? "";
    const ev = evals?.perRow[i] ?? null;
    for (const h of evalHeaders) obj[evalKey(h)] = ev ? (ev[h] ?? "") : "";
    return obj;
  });

  const allColumns = [...baseKeys, ...customKeys, ...evalKeys];
  const nonEmptyColumns = allColumns.filter((col) =>
    fullRows.some((row) => row[col] !== "" && row[col] != null),
  );
  // With zero rows there's nothing to prune against — keep the full header set
  // so an empty export still documents the available columns.
  const columns = fullRows.length === 0 ? allColumns : nonEmptyColumns;

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
  // Authorization: must be able to access this client. All presets (including
  // "all", which includes non-attendees + an attended Y/N column) are available
  // to anyone who can access the client — advisors included.
  if (!userCanAccessClient(session, workshop.client_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: attendees } = await admin
    .from("attendees")
    .select("*")
    .eq("workshop_id", workshopId);

  const rows = presetFilter((attendees ?? []) as Attendee[], workshop, preset);

  // Append each attendee's post-workshop evaluation response as extra columns
  // on the end, matched from the client's eval Google Sheet. Best-effort: if no
  // eval sheet is configured, or it can't be loaded, we export without them.
  let evals: EvalColumns | undefined;
  const { data: client } = await admin
    .from("clients")
    .select("eval_sheet_url")
    .eq("id", workshop.client_id)
    .maybeSingle<{ eval_sheet_url: string | null }>();
  const evalUrl = client?.eval_sheet_url?.trim();
  if (evalUrl) {
    const people = rows.map((r) => {
      const n = splitName(r.first_name, r.last_name);
      return { email: r.email ?? null, name: `${n.first} ${n.last}`.trim() || null };
    });
    try {
      const res = await getAttendeeEvalColumns(evalUrl, workshop.workshop_date, people);
      if ("error" in res) {
        console.warn(`[leads/export] eval columns unavailable: ${res.error}`);
      } else {
        evals = { headers: res.headers, perRow: res.rows };
        console.log(
          `[leads/export] matched ${res.matched}/${people.length} attendees to eval responses`,
        );
      }
    } catch (e) {
      console.warn("[leads/export] eval fetch failed:", e instanceof Error ? e.message : e);
    }
  }

  // Both exports carry the full column set; the preset only decides which rows.
  const csv = buildCsv(rows, workshop, evals);

  const safeTitle = workshop.title.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  const filename = `leads_${safeTitle}_${preset}_${workshop.workshop_date}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
