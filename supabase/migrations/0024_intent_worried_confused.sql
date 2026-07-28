-- Add a third workshop-intent type: worried_confused.
--
-- These are attendees who signaled — after the early "numbers"/goals warm-up
-- (~minute 15) — that they feel worried, apprehensive, overwhelmed, or confused
-- about their federal benefits. The strongest cluster is the reaction to the
-- presenter's "aren't you on a roller coaster trying to reach retirement?"
-- question (Amen / Me / Yeah / agreeing emojis), plus standalone overwhelm or
-- confusion remarks elsewhere in the transcript.
--
-- The original CHECK on workshop_intents.intent_type (migration 0002) was an
-- inline, auto-named constraint. Drop whichever check constrains that column,
-- then add a named one that includes the new value.

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where rel.relname = 'workshop_intents'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%intent_type%'
  loop
    execute format('alter table workshop_intents drop constraint %I', c.conname);
  end loop;
end $$;

alter table workshop_intents
  add constraint workshop_intents_intent_type_check
  check (intent_type in ('retiring_soon', 'cliff_notes_request', 'worried_confused'));
