-- The question_themes clustering was fetched, passed into the workshop report
-- component, and discarded without rendering. It cost one Anthropic call per
-- CSV upload and produced nothing visible, so the feature is gone.
--
-- REVERSIBLE: the underlying source data is retained. Themes were derived from
-- attendees.registration_question, which stays. If the feature is ever wanted
-- again it can be recomputed from scratch for every workshop — nothing that
-- only lived in this table is lost.
--
-- `cascade` also drops question_themes_workshop_id_idx and the RLS policies
-- attached to the table (question_themes_select + question_themes_write, per
-- 0001_init.sql and 0006_extended_roles.sql).

drop table if exists question_themes cascade;
