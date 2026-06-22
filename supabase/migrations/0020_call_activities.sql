-- Per-person call activity log: every action taken on an attendee, by the AI or
-- by a human caller, with notes. Powers the Part 2 "Record action" popup + the
-- per-person history (date / who / result / notes, repeated per action).
create table call_activities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  attendee_id uuid references attendees(id) on delete cascade,
  campaign_id uuid references call_campaigns(id) on delete set null,
  workshop_id uuid references workshops(id) on delete set null,
  -- registered / voicemail / no_answer / declined / call_later (human) plus AI:
  -- completed / callback / handoff / booking_link_sent / booked / other
  action text not null,
  notes text,
  actor_user_id uuid references app_users(id) on delete set null,
  actor_name text not null, -- "AI" or the person's name (Kelly / Kevin / …)
  created_at timestamptz not null default now()
);

create index call_activities_attendee_idx on call_activities(attendee_id, created_at desc);
create index call_activities_client_idx on call_activities(client_id);

alter table call_activities enable row level security;
create policy call_activities_select on call_activities for select using (
  is_admin() or client_id = current_client_id()
);
create policy call_activities_admin_all on call_activities for all
  using (is_admin()) with check (is_admin());
