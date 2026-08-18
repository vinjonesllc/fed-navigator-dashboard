-- Querying app_users with a user session fails outright:
--   "infinite recursion detected in policy for relation app_users"
--
-- Two policies on app_users read app_users while Postgres is deciding whether
-- you may read app_users:
--
--   app_users_select (0001)      calls is_admin() and current_client_id(),
--                                both of which select from app_users
--   app_users_admin_write (0006) inlines exists(select 1 from app_users ...)
--
-- Either way, evaluating the policy re-enters the policy. security definer on
-- the helpers does not save it: a definer's queries are still subject to RLS
-- unless the definer owns the table and force row level security is off.
--
-- The fix is to stop app_users' own policies from consulting app_users.
--
-- A user may read their own row, expressed without a subquery or a helper, so
-- it cannot recurse. Writes get no anon/authenticated policy at all: every
-- reader and writer in the app — lib/auth, the login and bootstrap routes, the
-- team console and the settings page — goes through the service-role client,
-- which bypasses RLS entirely. Team management stays server-side by design.
--
-- This also repairs the helpers rather than only silencing the error. Policies
-- on clients, workshops, attendees and the rest call is_admin() and
-- current_client_id(); those calls select the caller's own app_users row, which
-- the self-select policy below permits. They start returning the right answer
-- instead of erroring.

drop policy if exists app_users_select on app_users;
drop policy if exists app_users_admin_all on app_users;
drop policy if exists app_users_admin_write on app_users;

create policy app_users_self_select on app_users
  for select using (id = auth.uid());
