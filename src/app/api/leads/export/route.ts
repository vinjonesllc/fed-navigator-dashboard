import { NextResponse, type NextRequest } from "next/server";
import Papa from "papaparse";
import { requireUser, userCanAccessClient } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { engagementIndex } from "@/lib/workshop-stats";
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
  return {
    first_name: r.first_name ?? "",
    last_name: r.last_name ?? "",
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

  let csv: string;
  if (preset === "all") {
    // "Export All" = every field we store on each attendee, plus each
    // registration / custom-response question flattened into its own column.
    const baseKeys = Object.keys(fullRow({} as Attendee, workshop));
    const customKeys = Array.from(
      new Set(rows.flatMap((r) => Object.keys(r.custom_responses ?? {}))),
    )
      .filter((k) => !baseKeys.includes(k))
      .sort();

    const fullRows = rows.map((r) => {
      const obj = fullRow(r, workshop);
      for (const k of customKeys) obj[k] = (r.custom_responses ?? {})[k] ?? "";
      return obj;
    });
    csv = Papa.unparse(fullRows, { columns: [...baseKeys, ...customKeys] });
  } else {
    // Lead-list presets keep the curated outreach columns.
    const csvRows = rows.map((r) => ({
      first_name: r.first_name ?? "",
      last_name: r.last_name ?? "",
      email: r.email ?? "",
      phone: r.phone ?? "",
      agency: r.agency ?? "",
      state: r.state_province ?? "",
      age: r.age ?? "",
      // The Engagement Index (0–10) shown per attendee in the dashboard — only
      // meaningful for those who attended (Live); blank for everyone else.
      engagement_score:
        r.participation === "Live" ? engagementIndex(r, workshop.scheduled_minutes) ?? "" : "",
      registration_question: r.registration_question ?? "",
    }));
    csv = Papa.unparse(csvRows);
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
