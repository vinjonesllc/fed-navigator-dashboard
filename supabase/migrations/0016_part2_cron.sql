-- Part 2 call scheduler — runs entirely inside Supabase (free-tier friendly):
-- pg_cron fires on a schedule and pg_net POSTs to the app's dispatch route,
-- which dials any targets that are due. Available on Supabase's free plan.
--
-- SETUP (run in the SQL editor; the schedule line needs your real secret):
--   1. Set CRON_SECRET in Vercel (and locally) to a long random string.
--   2. Run the two `create extension` lines below.
--   3. Run the `cron.schedule(...)` call with <CRON_SECRET> replaced by that
--      same value. (It lives in the DB, which is private.)
-- To change cadence/secret later: cron.unschedule('part2-dial-due'), re-run.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- NOTE: replace <CRON_SECRET> with your real CRON_SECRET before running.
-- select cron.schedule(
--   'part2-dial-due',
--   '*/15 * * * *',
--   $$
--   select net.http_post(
--     url := 'https://dashboard.fednavigator.com/api/calls/cron',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'x-cron-secret', '<CRON_SECRET>'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
