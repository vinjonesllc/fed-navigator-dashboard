import Papa from "papaparse";
import type { AttendanceBucket } from "@/lib/supabase/types";

const TEXT_OPT_IN_RE = /text.*update|text.*you.*update/i;
const AGE_RE = /^age$/i;
const REGISTRATION_QUESTION_RE = /most important question|one question/i;

const FIXED_HEADERS: Record<string, keyof ParsedAttendee> = {
  "First name": "first_name",
  "Last name": "last_name",
  Email: "email",
  "Authentication status": "authentication_status",
  "Engagement score": "engagement_score",
  Participation: "participation",
  "Ticket type": "ticket_type",
  "Sessions attended": "sessions_attended",
  "Sessions registered": "sessions_registered",
  "Total time spent(Minutes)": "total_time_minutes",
  "Lobby attendance": "lobby_attendance",
  "Last registration time": "last_registration_time",
  "Registration method": "registration_method",
  "Authentication method": "authentication_method",
  "External ID": "external_id",
  "Marketing opt-in": "marketing_opt_in",
  "Marketing consent pre-checked?": "marketing_consent_pre_checked",
  "Registration source": "registration_source",
  Organization: "organization",
  "Job title": "job_title",
  Industry: "industry",
  "Organization size": "organization_size",
  "Country/Region": "country_region",
  "State/Province": "state_province",
  "ZIP/Postal code": "zip_postal_code",
  Phone: "phone",
  "First join time": "first_join_time",
  "Last exit time": "last_exit_time",
  "Total recording watch time(Minutes)": "total_recording_watch_minutes",
  "Chats sent": "chats_sent",
  "Total questions asked": "total_questions_asked",
  "Poll & quiz responses": "poll_quiz_responses",
  "Reactions sent": "reactions_sent",
  "Clicks/CTA": "clicks_cta",
  "Resource downloads": "resource_downloads",
  "Registered session(s)": "registered_sessions",
};

const INT_FIELDS = new Set<keyof ParsedAttendee>([
  "sessions_attended",
  "sessions_registered",
  "total_time_minutes",
  "total_recording_watch_minutes",
  "chats_sent",
  "total_questions_asked",
  "poll_quiz_responses",
  "reactions_sent",
  "clicks_cta",
  "resource_downloads",
]);

const COUNTER_FIELDS = new Set<keyof ParsedAttendee>([
  "chats_sent",
  "total_questions_asked",
  "poll_quiz_responses",
  "reactions_sent",
  "clicks_cta",
  "resource_downloads",
]);

const FLOAT_FIELDS = new Set<keyof ParsedAttendee>(["engagement_score"]);

const TIMESTAMP_FIELDS = new Set<keyof ParsedAttendee>([
  "last_registration_time",
  "first_join_time",
  "last_exit_time",
]);

export type ParsedAttendee = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  email_domain: string | null;
  phone: string | null;
  authentication_status: string | null;
  engagement_score: number | null;
  participation: string | null;
  ticket_type: string | null;
  sessions_attended: number | null;
  sessions_registered: number | null;
  total_time_minutes: number | null;
  lobby_attendance: string | null;
  last_registration_time: string | null;
  registration_method: string | null;
  authentication_method: string | null;
  external_id: string | null;
  marketing_opt_in: string | null;
  marketing_consent_pre_checked: string | null;
  registration_source: string | null;
  organization: string | null;
  job_title: string | null;
  industry: string | null;
  organization_size: string | null;
  country_region: string | null;
  state_province: string | null;
  zip_postal_code: string | null;
  first_join_time: string | null;
  last_exit_time: string | null;
  total_recording_watch_minutes: number | null;
  chats_sent: number;
  total_questions_asked: number;
  poll_quiz_responses: number;
  reactions_sent: number;
  clicks_cta: number;
  resource_downloads: number;
  registered_sessions: string | null;
  text_opt_in: boolean | null;
  age: number | null;
  registration_question: string | null;
  custom_responses: Record<string, string>;
  attendance_bucket: AttendanceBucket;
};

export type ParseResult = {
  rows: ParsedAttendee[];
  customHeaders: string[];
  textOptInHeader: string | null;
  ageHeader: string | null;
  registrationQuestionHeader: string | null;
};

function naToNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s || s.toUpperCase() === "N/A") return null;
  return s;
}

function parseInteger(v: unknown): number | null {
  const s = naToNull(v);
  if (s === null) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function parseFloatLike(v: unknown): number | null {
  const s = naToNull(v);
  if (s === null) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function parseTimestamp(v: unknown): string | null {
  const s = naToNull(v);
  if (s === null) return null;
  // Zoom format examples:
  //   "Wed, May 20, 2026 10:00 AM CDT"
  //   "Tue, May 5, 2026 2:40 PM CDT"
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}

function parseBoolish(v: unknown): boolean | null {
  const s = naToNull(v);
  if (s === null) return null;
  const upper = s.toUpperCase().replace(/[^A-Z]/g, "");
  if (["YES", "Y", "TRUE", "1"].includes(upper)) return true;
  if (["NO", "N", "FALSE", "0"].includes(upper)) return false;
  return null;
}

function emailDomain(email: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase();
}

function bucket(row: Omit<ParsedAttendee, "attendance_bucket">, scheduledMinutes: number): AttendanceBucket {
  const part = row.participation;
  const time = row.total_time_minutes ?? 0;
  const engaged =
    (row.chats_sent ?? 0) > 0 ||
    (row.total_questions_asked ?? 0) > 0 ||
    (row.poll_quiz_responses ?? 0) > 0;

  if (!part || part === "") return "no_show";
  if (part === "Lobby only") return "lobby_only";
  if (part === "Recording only") return "partial";
  // Live
  const pct = scheduledMinutes > 0 ? time / scheduledMinutes : 0;
  if (pct < 0.5) return "partial";
  return engaged ? "full_engaged" : "full";
}

export function parseZoomCsv(csv: string, scheduledMinutes: number): ParseResult {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/^﻿/, "").trim(),
  });

  const headers = result.meta.fields ?? [];
  const fixedHeaderSet = new Set(Object.keys(FIXED_HEADERS));

  let textOptInHeader: string | null = null;
  let ageHeader: string | null = null;
  let registrationQuestionHeader: string | null = null;
  const customHeaders: string[] = [];

  for (const h of headers) {
    if (fixedHeaderSet.has(h)) continue;
    if (!textOptInHeader && TEXT_OPT_IN_RE.test(h)) {
      textOptInHeader = h;
      continue;
    }
    if (!ageHeader && AGE_RE.test(h)) {
      ageHeader = h;
      continue;
    }
    if (!registrationQuestionHeader && REGISTRATION_QUESTION_RE.test(h)) {
      registrationQuestionHeader = h;
      continue;
    }
    customHeaders.push(h);
  }

  const rows: ParsedAttendee[] = [];

  for (const raw of result.data) {
    const out: Partial<ParsedAttendee> = {
      chats_sent: 0,
      total_questions_asked: 0,
      poll_quiz_responses: 0,
      reactions_sent: 0,
      clicks_cta: 0,
      resource_downloads: 0,
      custom_responses: {},
    };

    for (const [csvHeader, dbField] of Object.entries(FIXED_HEADERS)) {
      const v = raw[csvHeader];
      if (INT_FIELDS.has(dbField)) {
        const n = parseInteger(v);
        (out as Record<string, unknown>)[dbField] =
          n === null && COUNTER_FIELDS.has(dbField) ? 0 : n;
      } else if (FLOAT_FIELDS.has(dbField)) {
        (out as Record<string, unknown>)[dbField] = parseFloatLike(v);
      } else if (TIMESTAMP_FIELDS.has(dbField)) {
        (out as Record<string, unknown>)[dbField] = parseTimestamp(v);
      } else {
        (out as Record<string, unknown>)[dbField] = naToNull(v);
      }
    }

    out.email_domain = emailDomain(out.email ?? null);

    if (textOptInHeader) out.text_opt_in = parseBoolish(raw[textOptInHeader]);
    else out.text_opt_in = null;

    if (ageHeader) out.age = parseInteger(raw[ageHeader]);
    else out.age = null;

    if (registrationQuestionHeader) out.registration_question = naToNull(raw[registrationQuestionHeader]);
    else out.registration_question = null;

    const custom: Record<string, string> = {};
    for (const h of customHeaders) {
      const v = naToNull(raw[h]);
      if (v) custom[h] = v;
    }
    out.custom_responses = custom;

    const full = out as ParsedAttendee;
    full.attendance_bucket = bucket(full, scheduledMinutes);
    rows.push(full);
  }

  return {
    rows,
    customHeaders,
    textOptInHeader,
    ageHeader,
    registrationQuestionHeader,
  };
}
