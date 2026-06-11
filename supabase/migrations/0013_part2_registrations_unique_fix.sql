-- Fix: part2_registrations upsert uses ON CONFLICT (attendee_id), but the
-- original unique index was PARTIAL (`where attendee_id is not null`). Postgres
-- can't infer a partial unique index for ON CONFLICT, so the upsert errored
-- (42P10) and — since the caller didn't check the error — failed silently
-- (booking flipped to booked, but no ledger row was written).
--
-- A plain unique index on attendee_id still allows multiple NULL attendee_ids
-- (Postgres treats NULLs as distinct), so we keep "at most one registration per
-- known attendee" while making ON CONFLICT (attendee_id) work.

drop index if exists part2_registrations_attendee_uk;

create unique index part2_registrations_attendee_uk
  on part2_registrations(attendee_id);
