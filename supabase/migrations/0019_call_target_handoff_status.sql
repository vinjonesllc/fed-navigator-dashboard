-- "handoff" disposition: the caller asked for a callback (or was busy / wanted a
-- real person), or the call dropped before finishing. These are NOT completed and
-- are NOT auto-retried by the AI — a human follows up. We also DM the Part 2
-- calling group on ClickUp when one happens.
alter table call_targets drop constraint if exists call_targets_status_check;
alter table call_targets add constraint call_targets_status_check
  check (status in (
    'queued', 'calling', 'no_answer', 'voicemail',
    'completed', 'booked', 'declined', 'failed', 'skipped', 'handoff'
  ));

-- Calls the agent felt were "off" or couldn't cleanly categorize — surfaced for
-- manual review (DM'd to the calling group) so we can refine the rules.
alter table call_targets add column if not exists flagged_for_review boolean not null default false;
