-- Fed Navigator — per-client "next workshop" scheduling fields shown on the
-- client overview "Next Workshop" card. Date + time are set manually on the
-- client Settings tab; the registrant count is pulled live from a tab of the
-- client's existing evaluations Google Sheet (eval_sheet_url).

alter table clients add column if not exists next_workshop_date date;
alter table clients add column if not exists next_workshop_hour int;
alter table clients add column if not exists next_workshop_tz text;
alter table clients add column if not exists next_workshop_registrant_tab text;

alter table clients drop constraint if exists clients_next_workshop_hour_check;
alter table clients add constraint clients_next_workshop_hour_check
  check (next_workshop_hour is null or (next_workshop_hour between 0 and 23));

alter table clients drop constraint if exists clients_next_workshop_tz_check;
alter table clients add constraint clients_next_workshop_tz_check
  check (next_workshop_tz is null or next_workshop_tz in ('Eastern', 'Central', 'Mountain', 'Pacific'));
