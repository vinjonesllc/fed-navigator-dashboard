-- Workshop type: a full workshop runs an evaluation, a Lunch & Learn does not.
--
-- Everything eval-shaped keys off this column: the report's "What attendees
-- said" section, the "Download evaluations" button, the eval columns appended
-- to the attendee export, and the post-upload eval fetch. L&Ls skip all of it.
--
-- Existing rows are full workshops — that was the only kind until now.

alter table public.workshops
  add column if not exists workshop_type text not null default 'full';

alter table public.workshops
  drop constraint if exists workshops_workshop_type_check;

alter table public.workshops
  add constraint workshops_workshop_type_check
  check (workshop_type in ('full', 'lnl'));

comment on column public.workshops.workshop_type is
  'full = full workshop (has an evaluation); lnl = Lunch & Learn (no evaluation, all eval UI and exports suppressed)';
