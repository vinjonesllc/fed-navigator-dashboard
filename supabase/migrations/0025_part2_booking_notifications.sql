-- Durable ClickUp-notification ledger for Part 2 bookings.
--
-- WHY: the Calendly `invitee.created` webhook posts the "Part 2 booked" alert to
-- ClickUp as a best-effort side effect wrapped in try/catch. When the ClickUp
-- API hiccups (rate limit / transient 5xx) the alert is lost silently — there
-- was no retry, no flag, and no reconciler (unlike the AC-removal path). And
-- part2_registrations can't be used as the notification ledger because its
-- client_id is NOT NULL: a self-serve booking whose attendee hasn't been loaded
-- yet (e.g. same-day workshop roster uploaded that evening) never gets a row,
-- yet still needs a ClickUp alert.
--
-- This table records EVERY Part 2 booking we've told ClickUp about, keyed on the
-- Calendly invitee uri (globally unique, one per booking). It is independent of
-- client_id, so the reconciler (see /api/calls/reconcile-clickup) can treat
-- Calendly as the source of truth and backfill any booking the webhook dropped
-- or never received. The primary key doubles as the dedupe guard for rebookings
-- and duplicate webhook deliveries.
create table if not exists part2_booking_notifications (
  event_ref   text primary key,        -- Calendly invitee uri
  full_name   text,
  email       text,
  event_time  timestamptz,             -- the booked Part 2 slot
  source      text,                    -- 'ai_call' | 'self_serve' | 'reconciled'
  notified_at timestamptz not null default now()
);

create index if not exists part2_booking_notifications_notified_at_idx
  on part2_booking_notifications(notified_at);

-- ----------------------------------------------------------------------------
-- SCHEDULING (Supabase pg_cron → pg_net, same pattern as 0016_part2_cron.sql).
-- The reconciler is a safety net, so a slower cadence than the dial loop is
-- fine. Replace <CRON_SECRET> with your real CRON_SECRET before running.
--
-- select cron.schedule(
--   'part2-clickup-reconcile',
--   '*/30 * * * *',
--   $$
--   select net.http_post(
--     url := 'https://dashboard.fednavigator.com/api/calls/reconcile-clickup',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'x-cron-secret', '<CRON_SECRET>'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
-- To change cadence/secret later: cron.unschedule('part2-clickup-reconcile'), re-run.
