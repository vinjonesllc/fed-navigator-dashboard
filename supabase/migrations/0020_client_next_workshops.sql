-- Multiple Next Workshops per client.
--
-- Previously a client had a single next workshop stored in the five
-- next_workshop_* columns. We now store a LIST of upcoming workshops in a jsonb
-- array (driving the multi-tile overview display + per-tile registration
-- downloads). The original singular columns are kept and, on every save, mirror
-- the SOONEST FUTURE entry of the array — so the AI-call module, the call cron,
-- Part 2, the upload warnings, and the ActiveCampaign sync (all of which want a
-- single upcoming workshop) keep working unchanged.
--
-- Each array element: { date, hour, tz, registrant_tab, reg_url }.

alter table clients
  add column if not exists next_workshops jsonb not null default '[]'::jsonb;

-- Backfill: lift the existing single next workshop into the array.
update clients
set next_workshops = jsonb_build_array(
  jsonb_strip_nulls(
    jsonb_build_object(
      'date', next_workshop_date,
      'hour', next_workshop_hour,
      'tz', next_workshop_tz,
      'registrant_tab', next_workshop_registrant_tab,
      'reg_url', next_workshop_reg_url
    )
  )
)
where next_workshop_date is not null
  and (next_workshops is null or next_workshops = '[]'::jsonb);
