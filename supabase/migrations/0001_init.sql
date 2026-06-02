-- Fed Navigator Client Dashboard — initial schema
-- Multi-tenant: each client sees only their own workshops + attendees via RLS.

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- clients
-- ----------------------------------------------------------------------------
create table clients (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  logo_url text,
  contact_email text,
  accent_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- app_users (mirror of auth.users with role + client membership)
-- ----------------------------------------------------------------------------
create table app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  role text not null check (role in ('admin', 'client')),
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

create index app_users_client_id_idx on app_users(client_id);

-- ----------------------------------------------------------------------------
-- workshops
-- ----------------------------------------------------------------------------
create table workshops (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  title text not null,
  workshop_date date not null,
  presenter text,
  topic text,
  notes text,
  scheduled_minutes int,
  registered_count int default 0,
  attended_count int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workshops_client_id_idx on workshops(client_id);
create index workshops_date_idx on workshops(workshop_date desc);

-- ----------------------------------------------------------------------------
-- attendees (one row per CSV row, all Zoom fixed columns + dynamic responses)
-- ----------------------------------------------------------------------------
create table attendees (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  -- identity
  first_name text,
  last_name text,
  email text,
  email_domain text,
  agency text,                -- derived from agency_lookup
  phone text,
  -- Zoom fixed cols
  authentication_status text,
  engagement_score numeric(4,1),
  participation text,         -- 'Live' | 'Lobby only' | 'Recording only' | null (no-show)
  ticket_type text,
  sessions_attended int,
  sessions_registered int,
  total_time_minutes int,
  lobby_attendance text,
  last_registration_time timestamptz,
  registration_method text,
  authentication_method text,
  external_id text,
  marketing_opt_in text,
  marketing_consent_pre_checked text,
  registration_source text,
  organization text,
  job_title text,
  industry text,
  organization_size text,
  country_region text,
  state_province text,
  zip_postal_code text,
  first_join_time timestamptz,
  last_exit_time timestamptz,
  total_recording_watch_minutes int,
  chats_sent int default 0,
  total_questions_asked int default 0,
  poll_quiz_responses int default 0,
  reactions_sent int default 0,
  clicks_cta int default 0,
  resource_downloads int default 0,
  registered_sessions text,
  -- normalized custom registration questions
  text_opt_in boolean,
  age int,
  registration_question text,
  custom_responses jsonb default '{}'::jsonb,
  -- derived
  attendance_bucket text,     -- 'no_show' | 'lobby_only' | 'partial' | 'full' | 'full_engaged'
  lead_score numeric(4,2),
  created_at timestamptz not null default now()
);

create index attendees_workshop_id_idx on attendees(workshop_id);
create index attendees_email_idx on attendees(email);
create index attendees_agency_idx on attendees(agency);
create index attendees_text_opt_in_idx on attendees(text_opt_in) where text_opt_in = true;

-- ----------------------------------------------------------------------------
-- question_themes (Claude-clustered registration question themes per workshop)
-- ----------------------------------------------------------------------------
create table question_themes (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  theme_label text not null,
  description text,
  count int not null default 0,
  example_quotes jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index question_themes_workshop_id_idx on question_themes(workshop_id);

-- ----------------------------------------------------------------------------
-- agency_lookup (email domain → agency name dictionary, editable in admin UI)
-- ----------------------------------------------------------------------------
create table agency_lookup (
  domain text primary key,
  agency_name text not null,
  agency_short text,
  created_at timestamptz not null default now()
);

-- Seed common federal agencies
insert into agency_lookup (domain, agency_name, agency_short) values
  ('dhs.gov',        'Department of Homeland Security',     'DHS'),
  ('uscis.dhs.gov',  'U.S. Citizenship and Immigration Services', 'USCIS'),
  ('cbp.dhs.gov',    'Customs and Border Protection',       'CBP'),
  ('ice.dhs.gov',    'Immigration and Customs Enforcement', 'ICE'),
  ('fema.dhs.gov',   'Federal Emergency Management Agency', 'FEMA'),
  ('tsa.dhs.gov',    'Transportation Security Administration', 'TSA'),
  ('va.gov',         'Department of Veterans Affairs',      'VA'),
  ('irs.gov',        'Internal Revenue Service',            'IRS'),
  ('treasury.gov',   'Department of the Treasury',          'Treasury'),
  ('state.gov',      'Department of State',                 'State'),
  ('dol.gov',        'Department of Labor',                 'DOL'),
  ('usdoj.gov',      'Department of Justice',               'DOJ'),
  ('justice.gov',    'Department of Justice',               'DOJ'),
  ('fbi.gov',        'Federal Bureau of Investigation',     'FBI'),
  ('usmarshals.gov', 'U.S. Marshals Service',               'USMS'),
  ('bop.gov',        'Federal Bureau of Prisons',           'BOP'),
  ('ios.doi.gov',    'Department of the Interior',          'DOI'),
  ('doi.gov',        'Department of the Interior',          'DOI'),
  ('nps.gov',        'National Park Service',               'NPS'),
  ('blm.gov',        'Bureau of Land Management',           'BLM'),
  ('fws.gov',        'Fish and Wildlife Service',           'FWS'),
  ('usgs.gov',       'U.S. Geological Survey',              'USGS'),
  ('usda.gov',       'Department of Agriculture',           'USDA'),
  ('fs.fed.us',      'U.S. Forest Service',                 'USFS'),
  ('hhs.gov',        'Department of Health and Human Services', 'HHS'),
  ('cdc.gov',        'Centers for Disease Control',         'CDC'),
  ('nih.gov',        'National Institutes of Health',       'NIH'),
  ('fda.hhs.gov',    'Food and Drug Administration',        'FDA'),
  ('cms.hhs.gov',    'Centers for Medicare & Medicaid Services', 'CMS'),
  ('ed.gov',         'Department of Education',             'ED'),
  ('hud.gov',        'Department of Housing and Urban Development', 'HUD'),
  ('dot.gov',        'Department of Transportation',        'DOT'),
  ('faa.gov',        'Federal Aviation Administration',     'FAA'),
  ('energy.gov',     'Department of Energy',                'DOE'),
  ('epa.gov',        'Environmental Protection Agency',     'EPA'),
  ('nasa.gov',       'National Aeronautics and Space Administration', 'NASA'),
  ('ssa.gov',        'Social Security Administration',      'SSA'),
  ('sba.gov',        'Small Business Administration',       'SBA'),
  ('gsa.gov',        'General Services Administration',     'GSA'),
  ('opm.gov',        'Office of Personnel Management',      'OPM'),
  ('army.mil',       'U.S. Army',                           'Army'),
  ('navy.mil',       'U.S. Navy',                           'Navy'),
  ('af.mil',         'U.S. Air Force',                      'USAF'),
  ('uscg.mil',       'U.S. Coast Guard',                    'USCG'),
  ('mail.mil',       'Department of Defense',               'DoD');

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table clients          enable row level security;
alter table app_users        enable row level security;
alter table workshops        enable row level security;
alter table attendees        enable row level security;
alter table question_themes  enable row level security;
alter table agency_lookup    enable row level security;

-- Helper: is current user a Fed Pilot admin?
create or replace function is_admin() returns boolean
  language sql security definer stable as $$
    select exists(select 1 from app_users where id = auth.uid() and role = 'admin');
  $$;

-- Helper: which client does the current user belong to?
create or replace function current_client_id() returns uuid
  language sql security definer stable as $$
    select client_id from app_users where id = auth.uid();
  $$;

-- Policies: admins see everything; client users see only their client.
create policy clients_select on clients for select using (
  is_admin() or id = current_client_id()
);
create policy clients_admin_all on clients for all using (is_admin()) with check (is_admin());

create policy app_users_select on app_users for select using (
  is_admin() or id = auth.uid() or client_id = current_client_id()
);
create policy app_users_admin_all on app_users for all using (is_admin()) with check (is_admin());

create policy workshops_select on workshops for select using (
  is_admin() or client_id = current_client_id()
);
create policy workshops_admin_all on workshops for all using (is_admin()) with check (is_admin());

create policy attendees_select on attendees for select using (
  is_admin() or workshop_id in (select id from workshops where client_id = current_client_id())
);
create policy attendees_admin_all on attendees for all using (is_admin()) with check (is_admin());

create policy question_themes_select on question_themes for select using (
  is_admin() or workshop_id in (select id from workshops where client_id = current_client_id())
);
create policy question_themes_admin_all on question_themes for all using (is_admin()) with check (is_admin());

-- agency_lookup is shared global reference data
create policy agency_lookup_select_all on agency_lookup for select using (true);
create policy agency_lookup_admin_all  on agency_lookup for all using (is_admin()) with check (is_admin());
