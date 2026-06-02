-- Fed Navigator — per-client Google Sheets eval link + per-workshop featured comments.

alter table clients add column if not exists eval_sheet_url text;

create table workshop_eval_comments (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  comment_text text not null,
  comment_author text,
  comment_date date,
  display_order int not null default 0,
  source_row jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index workshop_eval_comments_workshop_id_idx
  on workshop_eval_comments(workshop_id, display_order);

alter table workshop_eval_comments enable row level security;

create policy workshop_eval_comments_select on workshop_eval_comments for select using (
  is_admin() or workshop_id in (select id from workshops where client_id = current_client_id())
);
create policy workshop_eval_comments_admin_all on workshop_eval_comments
  for all using (is_admin()) with check (is_admin());
