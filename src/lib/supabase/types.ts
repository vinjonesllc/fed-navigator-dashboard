export type AppRole = "admin" | "editor" | "super_advisor" | "advisor" | "client";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  editor: "Editor",
  super_advisor: "Super-Advisor",
  advisor: "Advisor",
  client: "Advisor", // legacy
};

export type AppUser = {
  id: string;
  client_id: string | null;
  role: AppRole;
  email: string;
  full_name: string | null;
  created_at: string;
};

export const CLIENT_BRANDS = [
  "Fed Pilot",
  "Feducate",
  "Feducate DMV",
  "MyFedNav",
  "FedRetire SME",
  "Fed Ret Inst",
] as const;
export type ClientBrand = (typeof CLIENT_BRANDS)[number];

export const NEXT_WORKSHOP_TIMEZONES = ["Eastern", "Central", "Mountain", "Pacific"] as const;
export type NextWorkshopTz = (typeof NEXT_WORKSHOP_TIMEZONES)[number];

export type Client = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  contact_email: string | null;
  accent_color: string | null;
  eval_sheet_url: string | null;
  brand: ClientBrand;
  next_workshop_date: string | null;
  next_workshop_hour: number | null;
  next_workshop_tz: NextWorkshopTz | null;
  next_workshop_registrant_tab: string | null;
  next_workshop_reg_url: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkshopEvalComment = {
  id: string;
  workshop_id: string;
  comment_text: string;
  comment_author: string | null;
  comment_agency: string | null;
  comment_email: string | null;
  comment_date: string | null;
  display_order: number;
  created_at: string;
};

export type Workshop = {
  id: string;
  client_id: string;
  title: string;
  workshop_date: string;
  presenter: string | null;
  topic: string | null;
  notes: string | null;
  scheduled_minutes: number | null;
  registered_count: number;
  attended_count: number;
  part2_enabled: boolean;
  eval_rating_avg: number | null;
  eval_rating_responses: number | null;
  created_at: string;
  updated_at: string;
};

export type AttendanceBucket =
  | "no_show"
  | "lobby_only"
  | "partial"
  | "full"
  | "full_engaged";

// NOTE: phone_e164 / phone_extension are normalized at upload (see lib/phone
// parsePhone). phone_e164 null = uncallable number (too short/long/foreign).
export type Attendee = {
  id: string;
  workshop_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  email_domain: string | null;
  agency: string | null;
  phone: string | null;
  phone_e164: string | null;
  phone_extension: string | null;
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
  attendance_bucket: AttendanceBucket | null;
  lead_score: number | null;
  created_at: string;
};

export type QuestionTheme = {
  id: string;
  workshop_id: string;
  theme_label: string;
  description: string | null;
  count: number;
  example_quotes: string[];
  created_at: string;
};

export type AgencyLookup = {
  domain: string;
  agency_name: string;
  agency_short: string | null;
  created_at: string;
};

export type WorkshopChat = {
  id: string;
  workshop_id: string;
  is_reply: boolean;
  message: string | null;
  sender_name: string | null;
  sender_email: string | null;
  sent_at: string | null;
  total_reactions: number;
  total_responses: number;
  created_at: string;
};

export type WorkshopQA = {
  id: string;
  workshop_id: string;
  question: string;
  sender_name: string | null;
  sender_email: string | null;
  sender_auth_status: string | null;
  submitted_at: string | null;
  answer: string | null;
  responder_name: string | null;
  responder_email: string | null;
  responded_at: string | null;
  dismissed: boolean;
  created_at: string;
};

// ----------------------------------------------------------------------------
// Part 2 Booking module
// ----------------------------------------------------------------------------

export type CampaignStatus = "draft" | "running" | "paused" | "completed";
export type CalendarProvider = "calendly" | "calcom" | "google";
export type VoiceProvider = "vapi" | "retell";

export type CallCampaign = {
  id: string;
  client_id: string;
  workshop_id: string | null;
  name: string;
  status: CampaignStatus;
  calendar_provider: CalendarProvider;
  calendar_config: Record<string, unknown>;
  voice_provider: VoiceProvider;
  voice_config: Record<string, unknown>;
  max_attempts: number;
  created_at: string;
  updated_at: string;
};

export type RegistrationSource = "manual" | "ai_call" | "self_serve";

export const REGISTRATION_SOURCE_LABELS: Record<RegistrationSource, string> = {
  manual: "Marked manually",
  ai_call: "Booked by AI call",
  self_serve: "Self-registered",
};

export type Part2Registration = {
  id: string;
  client_id: string;
  attendee_id: string | null;
  workshop_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  agency: string | null;
  source: RegistrationSource;
  event_time: string | null;
  event_ref: string | null;
  marked_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CallTargetStatus =
  | "queued"
  | "calling"
  | "no_answer"
  | "voicemail"
  | "completed"
  | "booked"
  | "declined"
  | "failed"
  | "skipped";

export const CALL_TARGET_STATUS_LABELS: Record<CallTargetStatus, string> = {
  queued: "Queued",
  calling: "Calling",
  no_answer: "No answer",
  voicemail: "Voicemail left",
  completed: "Call completed",
  booked: "Booked",
  declined: "Declined",
  failed: "Failed",
  skipped: "Skipped",
};

export type CallTarget = {
  id: string;
  campaign_id: string;
  attendee_id: string | null;
  full_name: string | null;
  phone: string | null;
  agency: string | null;
  status: CallTargetStatus;
  attempts: number;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  provider_call_id: string | null;
  recording_url: string | null;
  transcript: string | null;
  outcome_notes: string | null;
  booked_event_time: string | null;
  registration_id: string | null;
  /** How the booking link was sent, when one was: "text" | "email". */
  link_channel: string | null;
  created_at: string;
  updated_at: string;
};

export type IntentType = "retiring_soon" | "cliff_notes_request";

export type WorkshopIntent = {
  id: string;
  workshop_id: string;
  intent_type: IntentType;
  attendee_name: string | null;
  attendee_email: string | null;
  detail: string | null;
  source: "chat" | "qa" | "both" | null;
  source_quote: string | null;
  created_at: string;
};
