-- Persist the "Registrations tab" chosen at upload (or in the edit form) so the
-- leads export reads exactly that tab — no date/name inference. Nullable: older
-- workshops (and any where it hasn't been set) fall back to the attendee export.
alter table workshops add column if not exists registrant_tab text;
