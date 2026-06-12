-- Per-attempt call log, used to learn the best times to call: we record the
-- local hour + weekday (in the workshop's timezone) and whether the call was
-- answered vs voicemail vs no-answer. Aggregated over time to bias scheduling
-- toward hours people actually pick up. Not surfaced in the UI.
create table call_attempts (
  id uuid primary key default gen_random_uuid(),
  target_id uuid references call_targets(id) on delete set null,
  campaign_id uuid references call_campaigns(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  attempted_at timestamptz not null default now(),
  local_hour int,      -- 0-23 in the workshop timezone
  local_weekday int,   -- 0=Sunday .. 6=Saturday in the workshop timezone
  outcome text not null check (outcome in ('answered', 'voicemail', 'no_answer', 'failed')),
  provider_call_id text,
  created_at timestamptz not null default now()
);

create index call_attempts_hour_outcome_idx on call_attempts(local_hour, outcome);
create index call_attempts_client_idx on call_attempts(client_id);

alter table call_attempts enable row level security;
create policy call_attempts_admin_all on call_attempts for all
  using (is_admin()) with check (is_admin());
