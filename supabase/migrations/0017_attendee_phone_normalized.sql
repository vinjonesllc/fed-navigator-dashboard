-- Normalized phone fields, populated at upload time (see src/lib/phone
-- parsePhone). Lets us E.164 numbers up front, capture extensions, and hard-flag
-- numbers that should never be dialed.
--
--   phone_e164      dialable US number in E.164 (+1XXXXXXXXXX). NULL means the
--                   raw number isn't callable (too short/long/foreign) — i.e.
--                   "do not call"; such attendees are excluded from call lists.
--   phone_extension digits from a trailing extension ("x123", "ext. 123", "#123").
--
-- Backfill of existing rows is done by scripts/backfill-phone-e164.mjs after this
-- migration is applied.
alter table attendees add column if not exists phone_e164 text;
alter table attendees add column if not exists phone_extension text;

create index if not exists attendees_phone_e164_idx
  on attendees(phone_e164) where phone_e164 is not null;
