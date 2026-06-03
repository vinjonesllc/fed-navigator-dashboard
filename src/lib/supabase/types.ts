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

export const CLIENT_BRANDS = ["Fed Pilot", "Feducate", "Feducate DMV", "MyFedNav"] as const;
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
  created_at: string;
  updated_at: string;
};

export type WorkshopEvalComment = {
  id: string;
  workshop_id: string;
  comment_text: string;
  comment_author: string | null;
  comment_agency: string | null;
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

export type Attendee = {
  id: string;
  workshop_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  email_domain: string | null;
  agency: string | null;
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
