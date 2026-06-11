-- Part 2 Booking module
-- ----------------------------------------------------------------------------
-- Outbound AI-call campaigns that follow up with workshop attendees and book
-- them into "Part 2", PLUS the registration ledger that is the source of truth
-- for "who has signed up" — whether the AI booked them, an advisor marked them
-- manually, or they self-served. The ledger doubles as the call-suppression
-- list: anyone with a part2_registrations row is excluded from new call lists.
--
-- Phase 1 ships call_campaigns + part2_registrations + call_targets and the
-- manual "mark registered" UI + call-list builder. The voice/telephony columns
-- (provider_call_id, recording_url, transcript, etc.) are added now so Phase 2
-- (Vapi agent + webhooks) needs no further migration.

-- ----------------------------------------------------------------------------
-- Part 2 booking is opt-in per workshop. Most workshops won't use it, so the
-- dashboard hides the Part 2 Booking UI unless this flag is on.
-- ----------------------------------------------------------------------------
alter table workshops
  add column if not exists part2_enabled boolean not null default false;

-- ----------------------------------------------------------------------------
-- call_campaigns — one batch of Part 2 booking calls, scoped to a client and
-- (usually) a single workshop.
-- ----------------------------------------------------------------------------
create table call_campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  workshop_id uuid references workshops(id) on delete set null,
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'running', 'paused', 'completed')),
  -- which calendar the agent books into, and its config (Calendly event-type
  -- uri + scheduling url, advisor name, etc.). Calendar-provider-agnostic so
  -- Calendly advisors and (later) Cal.com / Google advisors share one model.
  calendar_provider text not null default 'calendly'
    check (calendar_provider in ('calendly', 'calcom', 'google')),
  calendar_config jsonb not null default '{}'::jsonb,
  voice_provider text not null default 'vapi'
    check (voice_provider in ('vapi', 'retell')),
  voice_config jsonb not null default '{}'::jsonb,
  max_attempts int not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index call_campaigns_client_id_idx on call_campaigns(client_id);
create index call_campaigns_workshop_id_idx on call_campaigns(workshop_id);

-- ----------------------------------------------------------------------------
-- part2_registrations — source of truth for "signed up for Part 2".
-- One row per person who has registered, regardless of how. Acts as the
-- call-suppression list (call lists exclude anyone with a row here).
-- ----------------------------------------------------------------------------
create table part2_registrations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  attendee_id uuid references attendees(id) on delete set null,
  workshop_id uuid references workshops(id) on delete set null,
  full_name text,
  email text,
  phone text,
  agency text,
  source text not null check (source in ('manual', 'ai_call', 'self_serve')),
  event_time timestamptz,          -- the booked Part 2 slot, when known
  event_ref text,                  -- calendar event id / Calendly invitee uri
  marked_by uuid references app_users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one registration per known attendee (manual + AI can't double-count).
create unique index part2_registrations_attendee_uk
  on part2_registrations(attendee_id) where attendee_id is not null;
create index part2_registrations_client_id_idx on part2_registrations(client_id);
create index part2_registrations_workshop_id_idx on part2_registrations(workshop_id);

-- ----------------------------------------------------------------------------
-- call_targets — one row per person in a campaign's call list, tracking call
-- progress and outcome. Telephony columns are populated in Phase 2.
-- ----------------------------------------------------------------------------
create table call_targets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references call_campaigns(id) on delete cascade,
  attendee_id uuid references attendees(id) on delete set null,
  full_name text,
  phone text,
  agency text,
  status text not null default 'queued'
    check (status in (
      'queued', 'calling', 'no_answer', 'voicemail',
      'completed', 'booked', 'declined', 'failed', 'skipped'
    )),
  attempts int not null default 0,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  -- telephony / voice-agent fields (Phase 2)
  provider_call_id text,
  recording_url text,
  transcript text,
  outcome_notes text,
  booked_event_time timestamptz,
  registration_id uuid references part2_registrations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index call_targets_campaign_id_idx on call_targets(campaign_id);
create index call_targets_status_idx on call_targets(status);
create index call_targets_attendee_id_idx on call_targets(attendee_id);

-- ----------------------------------------------------------------------------
-- RLS — mirror the existing tables: admins see everything, a client user sees
-- only their own client's rows. The app reads/writes via the service-role
-- client (which bypasses RLS); these policies are the backstop for direct access.
-- ----------------------------------------------------------------------------
alter table call_campaigns       enable row level security;
alter table part2_registrations  enable row level security;
alter table call_targets         enable row level security;

create policy call_campaigns_select on call_campaigns for select using (
  is_admin() or client_id = current_client_id()
);
create policy call_campaigns_admin_all on call_campaigns for all
  using (is_admin()) with check (is_admin());

create policy part2_registrations_select on part2_registrations for select using (
  is_admin() or client_id = current_client_id()
);
create policy part2_registrations_admin_all on part2_registrations for all
  using (is_admin()) with check (is_admin());

create policy call_targets_select on call_targets for select using (
  is_admin() or campaign_id in (
    select id from call_campaigns where client_id = current_client_id()
  )
);
create policy call_targets_admin_all on call_targets for all
  using (is_admin()) with check (is_admin());
