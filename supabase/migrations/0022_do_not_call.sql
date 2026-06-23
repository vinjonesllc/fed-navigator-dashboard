-- "Do not call": a human can flag an attendee to be permanently kept off the
-- Part 2 call list. The flag lives on the attendee (so they're excluded from the
-- callable list and never re-added), and any existing call target is moved to a
-- 'do_not_call' status so the dialer leaves it alone.
alter table attendees add column if not exists do_not_call boolean not null default false;

alter table call_targets drop constraint if exists call_targets_status_check;
alter table call_targets add constraint call_targets_status_check
  check (status in (
    'queued', 'calling', 'no_answer', 'voicemail',
    'completed', 'booked', 'declined', 'failed', 'skipped', 'handoff', 'do_not_call'
  ));
