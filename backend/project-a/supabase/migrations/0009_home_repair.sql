-- 0009: safe, re-runnable repair for Home "Could not load data".
-- Run in Supabase SQL Editor (project A). It only adds what is missing; it never deletes data.

-- Home reads profiles.assistant_name (added in 0008). Missing column = whole Home failed before this fix.
alter table profiles add column if not exists assistant_name text not null default 'Lexon Assistant';
alter table profiles drop constraint if exists profiles_assistant_name_len;
alter table profiles add constraint profiles_assistant_name_len check (char_length(assistant_name) between 1 and 40);

-- Projects v2 columns/status used by Home and Projects.
alter table projects add column if not exists description text;

-- Functions used inside RLS policies must stay executable for signed-in users.
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function set_integration_secret(uuid, text), get_integration_secret(uuid), delete_integration_secret(uuid),
  rate_limit_hit(text, int, int), auth_user_info(text) from authenticated;

notify pgrst, 'reload schema';
