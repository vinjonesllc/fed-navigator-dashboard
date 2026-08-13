-- Allow workshop_intents.source = 'eval'.
--
-- The worried_confused list now also mines the post-workshop evaluation
-- comments (not just live chat + Q&A) — e.g. someone who wrote "Even though it
-- is unquestionably overwhelming ..." on their eval should surface in the list.
-- Those rows are tagged source = 'eval' so the UI can show the written-feedback
-- quote alongside the live-transcript ones.
--
-- The original source CHECK (migration 0002) was an inline, auto-named
-- constraint; drop whichever check constrains that column, then add a named one
-- that includes the new value.
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
      and pg_get_constraintdef(con.oid) ilike '%source%'
  loop
    execute format('alter table workshop_intents drop constraint %I', c.conname);
  end loop;
end $$;

alter table workshop_intents
  add constraint workshop_intents_source_check
  check (source in ('chat', 'qa', 'both', 'eval'));
