-- Extend account roles from {admin,client} to {admin,editor,super_advisor,advisor}.
-- Keep 'client' as a legacy value (no new rows should use it) and migrate existing
-- 'client' rows to 'advisor'.

alter table app_users drop constraint if exists app_users_role_check;
alter table app_users add constraint app_users_role_check
  check (role in ('admin', 'editor', 'super_advisor', 'advisor', 'client'));

update app_users set role = 'advisor' where role = 'client';

-- Super-advisor → client view grants. Many-to-many.
create table if not exists super_advisor_clients (
  user_id uuid not null references app_users(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, client_id)
);

create index if not exists super_advisor_clients_user_idx
  on super_advisor_clients(user_id);

alter table super_advisor_clients enable row level security;

create policy super_advisor_clients_select on super_advisor_clients for select using (
  exists(select 1 from app_users where id = auth.uid() and role in ('admin', 'editor'))
  or user_id = auth.uid()
);
create policy super_advisor_clients_admin_all on super_advisor_clients for all using (
  exists(select 1 from app_users where id = auth.uid() and role = 'admin')
) with check (
  exists(select 1 from app_users where id = auth.uid() and role = 'admin')
);

-- Helper functions that replace is_admin() in RLS policies (admin alone is no longer enough
-- for general read access — editors also need it, and super_advisor/advisor get scoped access).

create or replace function is_admin_or_editor() returns boolean
  language sql security definer stable as $$
    select exists(
      select 1 from app_users
      where id = auth.uid()
      and role in ('admin', 'editor')
    );
  $$;

create or replace function user_can_see_client(target_client_id uuid) returns boolean
  language sql security definer stable as $$
    select is_admin_or_editor()
      or exists(select 1 from app_users where id = auth.uid() and client_id = target_client_id)
      or exists(select 1 from super_advisor_clients where user_id = auth.uid() and client_id = target_client_id);
  $$;

-- Replace existing SELECT policies with the role-aware helper.
drop policy if exists clients_select on clients;
create policy clients_select on clients for select using (user_can_see_client(id));

drop policy if exists clients_admin_all on clients;
create policy clients_write on clients for all using (is_admin_or_editor())
  with check (is_admin_or_editor());

drop policy if exists workshops_select on workshops;
create policy workshops_select on workshops for select using (user_can_see_client(client_id));

drop policy if exists workshops_admin_all on workshops;
create policy workshops_write on workshops for all using (is_admin_or_editor())
  with check (is_admin_or_editor());

drop policy if exists attendees_select on attendees;
create policy attendees_select on attendees for select using (
  workshop_id in (select id from workshops where user_can_see_client(client_id))
);

drop policy if exists attendees_admin_all on attendees;
create policy attendees_write on attendees for all using (is_admin_or_editor())
  with check (is_admin_or_editor());

drop policy if exists question_themes_select on question_themes;
create policy question_themes_select on question_themes for select using (
  workshop_id in (select id from workshops where user_can_see_client(client_id))
);
drop policy if exists question_themes_admin_all on question_themes;
create policy question_themes_write on question_themes for all using (is_admin_or_editor())
  with check (is_admin_or_editor());

drop policy if exists workshop_chats_select on workshop_chats;
create policy workshop_chats_select on workshop_chats for select using (
  workshop_id in (select id from workshops where user_can_see_client(client_id))
);
drop policy if exists workshop_chats_admin_all on workshop_chats;
create policy workshop_chats_write on workshop_chats for all using (is_admin_or_editor())
  with check (is_admin_or_editor());

drop policy if exists workshop_qa_select on workshop_qa;
create policy workshop_qa_select on workshop_qa for select using (
  workshop_id in (select id from workshops where user_can_see_client(client_id))
);
drop policy if exists workshop_qa_admin_all on workshop_qa;
create policy workshop_qa_write on workshop_qa for all using (is_admin_or_editor())
  with check (is_admin_or_editor());

drop policy if exists workshop_intents_select on workshop_intents;
create policy workshop_intents_select on workshop_intents for select using (
  workshop_id in (select id from workshops where user_can_see_client(client_id))
);
drop policy if exists workshop_intents_admin_all on workshop_intents;
create policy workshop_intents_write on workshop_intents for all using (is_admin_or_editor())
  with check (is_admin_or_editor());

drop policy if exists workshop_eval_comments_select on workshop_eval_comments;
create policy workshop_eval_comments_select on workshop_eval_comments for select using (
  workshop_id in (select id from workshops where user_can_see_client(client_id))
);
drop policy if exists workshop_eval_comments_admin_all on workshop_eval_comments;
create policy workshop_eval_comments_write on workshop_eval_comments for all using (is_admin_or_editor())
  with check (is_admin_or_editor());

drop policy if exists agency_lookup_admin_all on agency_lookup;
create policy agency_lookup_write on agency_lookup for all using (is_admin_or_editor())
  with check (is_admin_or_editor());

-- app_users: only admin can insert/update/delete (manages team)
drop policy if exists app_users_admin_all on app_users;
create policy app_users_admin_write on app_users for all using (
  exists(select 1 from app_users u where u.id = auth.uid() and u.role = 'admin')
) with check (
  exists(select 1 from app_users u where u.id = auth.uid() and u.role = 'admin')
);
