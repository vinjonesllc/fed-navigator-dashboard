-- Public share links used to be keyed on the workshop's own UUID
-- (/share/workshops/<workshop.id>), which meant the id doubled as an access
-- token: anyone who saw a workshop id anywhere could read the public summary,
-- and a leaked link could not be rotated without destroying the workshop row.
--
-- Give every workshop a separate, purpose-built share token. The public route
-- now looks up on this column only; rotating a link is a single UPDATE.
--
-- gen_random_bytes lives in pgcrypto (gen_random_uuid is core in PG13+, this
-- one is not).
create extension if not exists pgcrypto;

alter table workshops
  add column if not exists share_token text
  default encode(gen_random_bytes(16), 'hex');

-- Backfill rows that predate the column (the default only applies to inserts).
update workshops
  set share_token = encode(gen_random_bytes(16), 'hex')
  where share_token is null;

alter table workshops alter column share_token set not null;

-- Unique so a token identifies exactly one workshop; the index also makes the
-- public page's lookup a single index hit.
create unique index if not exists workshops_share_token_key
  on workshops (share_token);
