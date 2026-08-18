-- part2_booking_notifications shipped in 0025 without row-level security, so
-- it was readable — and writable — by anyone holding the anon key. That key is
-- published in the browser bundle by design, so the table was effectively
-- public. Supabase's linter flagged it as rls_disabled_in_public.
--
-- The table is a de-duplication ledger for "Part 2 booked" ClickUp alerts:
-- one row per Calendly invitee, carrying their name, email and booked slot.
-- Names and emails of people who booked a call is exactly the sort of thing
-- that should never have been reachable without a session.
--
-- Only lib/part2-notify.ts touches it, and only through the service-role
-- client, which bypasses RLS. Enabling RLS with no policies therefore denies
-- anon and authenticated roles outright while leaving the webhook and the
-- reconciler working unchanged. Every other table in the schema already does
-- this; 0025 was the one that missed it.

alter table part2_booking_notifications enable row level security;
