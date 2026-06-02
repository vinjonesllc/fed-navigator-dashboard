-- Fed Navigator — chat + Q&A transcript ingest + Claude-extracted intents.

create table workshop_chats (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  is_reply boolean default false,
  message text,
  sender_name text,
  sender_email text,
  sent_at timestamptz,
  total_reactions int default 0,
  total_responses int default 0,
  created_at timestamptz not null default now()
);

create index workshop_chats_workshop_id_idx on workshop_chats(workshop_id);
create index workshop_chats_sender_email_idx on workshop_chats(sender_email);

create table workshop_qa (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  question text not null,
  sender_name text,
  sender_email text,
  sender_auth_status text,
  submitted_at timestamptz,
  answer text,
  responder_name text,
  responder_email text,
  responded_at timestamptz,
  dismissed boolean default false,
  created_at timestamptz not null default now()
);

create index workshop_qa_workshop_id_idx on workshop_qa(workshop_id);

create table workshop_intents (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  intent_type text not null check (intent_type in ('retiring_soon', 'cliff_notes_request')),
  attendee_name text,
  attendee_email text,
  detail text,
  source text check (source in ('chat', 'qa', 'both')),
  source_quote text,
  created_at timestamptz not null default now()
);

create index workshop_intents_workshop_id_idx on workshop_intents(workshop_id);
create index workshop_intents_type_idx on workshop_intents(workshop_id, intent_type);

alter table workshop_chats   enable row level security;
alter table workshop_qa      enable row level security;
alter table workshop_intents enable row level security;

create policy workshop_chats_select on workshop_chats for select using (
  is_admin() or workshop_id in (select id from workshops where client_id = current_client_id())
);
create policy workshop_chats_admin_all on workshop_chats for all using (is_admin()) with check (is_admin());

create policy workshop_qa_select on workshop_qa for select using (
  is_admin() or workshop_id in (select id from workshops where client_id = current_client_id())
);
create policy workshop_qa_admin_all on workshop_qa for all using (is_admin()) with check (is_admin());

create policy workshop_intents_select on workshop_intents for select using (
  is_admin() or workshop_id in (select id from workshops where client_id = current_client_id())
);
create policy workshop_intents_admin_all on workshop_intents for all using (is_admin()) with check (is_admin());
