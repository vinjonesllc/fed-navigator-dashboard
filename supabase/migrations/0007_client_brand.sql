-- Fed Navigator — per-client brand / product line.
-- Each client is served under one of three Fed Pilot brands. Drives downstream
-- branding/behavior (to be built next).

alter table clients add column if not exists brand text not null default 'Fed Pilot';

alter table clients drop constraint if exists clients_brand_check;
alter table clients add constraint clients_brand_check
  check (brand in ('Fed Pilot', 'Feducate', 'MyFedNav'));
