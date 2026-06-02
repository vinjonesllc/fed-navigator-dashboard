import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseZoomCsv, type ParsedAttendee } from "@/lib/csv/parse-zoom";

const FED_PUBLIC_TLDS = [".gov", ".mil", ".fed.us"];

export function isLikelyFederal(domain: string | null): boolean {
  if (!domain) return false;
  return FED_PUBLIC_TLDS.some((t) => domain.endsWith(t));
}

export function leadScore(row: ParsedAttendee, scheduledMinutes: number): number {
  const durationPct = scheduledMinutes > 0 ? Math.min(1, (row.total_time_minutes ?? 0) / scheduledMinutes) : 0;
  const eng = (row.engagement_score ?? 0) / 10;
  const opt = row.text_opt_in ? 1 : 0;
  const score = durationPct * 0.4 + eng * 0.3 + opt * 0.3;
  return Math.round(score * 100) / 100;
}

export async function resolveAgencies(rows: ParsedAttendee[]): Promise<Map<string, string>> {
  const admin = createSupabaseAdminClient();
  const domains = Array.from(new Set(rows.map((r) => r.email_domain).filter((d): d is string => !!d)));
  if (domains.length === 0) return new Map();

  const { data } = await admin
    .from("agency_lookup")
    .select("domain, agency_short, agency_name")
    .in("domain", domains);

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(row.domain, row.agency_short ?? row.agency_name);
  }
  return map;
}

export type IngestResult = {
  workshopId: string;
  inserted: number;
  registered: number;
  attended: number;
  customHeaders: string[];
  registrationQuestionHeader: string | null;
};

export async function ingestZoomCsv(opts: {
  clientId: string;
  title: string;
  workshopDate: string;
  presenter?: string | null;
  topic?: string | null;
  notes?: string | null;
  scheduledMinutes: number;
  csv: string;
}): Promise<IngestResult> {
  const parsed = parseZoomCsv(opts.csv, opts.scheduledMinutes);
  const agencyMap = await resolveAgencies(parsed.rows);

  const admin = createSupabaseAdminClient();

  const { data: workshop, error: wsErr } = await admin
    .from("workshops")
    .insert({
      client_id: opts.clientId,
      title: opts.title,
      workshop_date: opts.workshopDate,
      presenter: opts.presenter || null,
      topic: opts.topic || null,
      notes: opts.notes || null,
      scheduled_minutes: opts.scheduledMinutes,
      registered_count: parsed.rows.length,
      attended_count: parsed.rows.filter((r) => r.participation === "Live").length,
    })
    .select("id")
    .single();

  if (wsErr || !workshop) throw new Error(wsErr?.message ?? "Failed to create workshop");

  const records = parsed.rows.map((r) => ({
    workshop_id: workshop.id,
    first_name: r.first_name,
    last_name: r.last_name,
    email: r.email,
    email_domain: r.email_domain,
    agency: r.email_domain ? agencyMap.get(r.email_domain) ?? null : null,
    phone: r.phone,
    authentication_status: r.authentication_status,
    engagement_score: r.engagement_score,
    participation: r.participation,
    ticket_type: r.ticket_type,
    sessions_attended: r.sessions_attended,
    sessions_registered: r.sessions_registered,
    total_time_minutes: r.total_time_minutes,
    lobby_attendance: r.lobby_attendance,
    last_registration_time: r.last_registration_time,
    registration_method: r.registration_method,
    authentication_method: r.authentication_method,
    external_id: r.external_id,
    marketing_opt_in: r.marketing_opt_in,
    marketing_consent_pre_checked: r.marketing_consent_pre_checked,
    registration_source: r.registration_source,
    organization: r.organization,
    job_title: r.job_title,
    industry: r.industry,
    organization_size: r.organization_size,
    country_region: r.country_region,
    state_province: r.state_province,
    zip_postal_code: r.zip_postal_code,
    first_join_time: r.first_join_time,
    last_exit_time: r.last_exit_time,
    total_recording_watch_minutes: r.total_recording_watch_minutes,
    chats_sent: r.chats_sent,
    total_questions_asked: r.total_questions_asked,
    poll_quiz_responses: r.poll_quiz_responses,
    reactions_sent: r.reactions_sent,
    clicks_cta: r.clicks_cta,
    resource_downloads: r.resource_downloads,
    registered_sessions: r.registered_sessions,
    text_opt_in: r.text_opt_in,
    age: r.age,
    registration_question: r.registration_question,
    custom_responses: r.custom_responses,
    attendance_bucket: r.attendance_bucket,
    lead_score: leadScore(r, opts.scheduledMinutes),
  }));

  // Chunked insert to stay within payload limits.
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const slice = records.slice(i, i + CHUNK);
    const { error } = await admin.from("attendees").insert(slice);
    if (error) {
      await admin.from("workshops").delete().eq("id", workshop.id);
      throw new Error(`Attendee insert failed (row ${i}): ${error.message}`);
    }
    inserted += slice.length;
  }

  return {
    workshopId: workshop.id,
    inserted,
    registered: parsed.rows.length,
    attended: parsed.rows.filter((r) => r.participation === "Live").length,
    customHeaders: parsed.customHeaders,
    registrationQuestionHeader: parsed.registrationQuestionHeader,
  };
}
