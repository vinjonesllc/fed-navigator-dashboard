-- Store the evaluation respondent's email alongside each extracted testimonial,
-- so "What attendees said" cards can link to the same person record (by email)
-- as the attendees table / Q&A / intent panels. Nullable: the eval sheet may not
-- have an email column, and existing rows stay null until re-fetched.
alter table workshop_eval_comments
  add column if not exists comment_email text;
