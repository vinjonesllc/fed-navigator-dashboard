-- Tracks whether a booked/registered contact has been removed from the PART2
-- Post-Event Contacting automation in ActiveCampaign. The Calendly webhook sets
-- it true on success; a reconciliation sweep in the call cron retries any left
-- false (e.g. AC was down at booking time) until they succeed — so a hiccup
-- self-heals instead of silently leaving someone in the automation.
alter table part2_registrations
  add column if not exists ac_removed boolean not null default false;

create index if not exists part2_registrations_ac_removed_idx
  on part2_registrations(ac_removed) where ac_removed = false;
