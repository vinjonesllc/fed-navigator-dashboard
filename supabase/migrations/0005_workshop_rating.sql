alter table workshops
  add column if not exists eval_rating_avg numeric(3,2),
  add column if not exists eval_rating_responses int;
