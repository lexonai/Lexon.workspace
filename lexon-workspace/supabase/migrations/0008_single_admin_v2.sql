-- 0008: Single-admin roles (Admin + Team Member), 7-day retention, invite lifecycle, projects v2,
--       task/activity visibility, unified activity events, announcements v2, assistant name.

-- ===== Roles: only Admin (owner/admin) and Team Member =====
update workspace_members set role = 'member' where role::text in ('manager', 'agent');
update authorized_emails set role = 'member' where role::text in ('manager', 'agent');
delete from role_permissions where role::text in ('manager', 'agent');
alter table workspace_members drop constraint if exists wm_role_chk;
alter table workspace_members add constraint wm_role_chk check (role::text in ('owner', 'admin', 'member'));
alter table authorized_emails drop constraint if exists ae_role_chk;
alter table authorized_emails add constraint ae_role_chk check (role::text in ('owner', 'admin', 'member'));

create or replace function is_admin(ws uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid() and active and role::text in ('owner', 'admin')) $$;

-- Admins have every permission automatically. Team Members have a fixed, predefined access (no permission editor).
create or replace function has_permission(ws uuid, perm text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.active
      and (m.role::text in ('owner', 'admin') or exists (
        select 1 from role_permissions rp where rp.workspace_id = ws and rp.role = m.role and rp.permission = perm))) $$;
create or replace function seed_role_permissions(ws uuid) returns void language plpgsql as $$ begin null; end $$;

-- Only the owner may allow-list another Admin; invites can only create Team Members
create or replace function guard_authorized_emails() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.role::text in ('admin', 'owner') and not exists (
    select 1 from workspace_members where workspace_id = new.workspace_id and user_id = auth.uid() and role::text = 'owner' and active) then
    raise exception 'Only the owner can approve another Admin';
  end if;
  new.email := lower(trim(new.email));
  return new;
end $$;
drop trigger if exists t_guard_authorized_emails on authorized_emails;
create trigger t_guard_authorized_emails before insert or update on authorized_emails for each row execute function guard_authorized_emails();

alter table authorized_emails add column if not exists invited_at timestamptz not null default now();
alter table authorized_emails add column if not exists invited_by uuid;

-- ===== Visibility: Team Members only see their own tasks and activity =====
-- VOLATILE on purpose: lets INSERT ... RETURNING see the row just created by the same statement.
create or replace function can_see_task(tid uuid) returns boolean
language sql security definer volatile set search_path = public as $$
  select exists (select 1 from tasks t where t.id = tid and (
    is_admin(t.workspace_id) or t.created_by = auth.uid()
    or exists (select 1 from task_assignees a where a.task_id = t.id and a.user_id = auth.uid()))) $$;
drop policy if exists tasks_read on tasks;
create policy tasks_read on tasks for select using (can_see_task(id));
drop policy if exists ta_read on task_assignees;
create policy ta_read on task_assignees for select using (can_see_task(task_id));
drop policy if exists activity_read on activity_logs;
create policy activity_read on activity_logs for select using (is_admin(workspace_id) or actor_id = auth.uid());

-- ===== Projects v2: Active / Inactive / Coming Soon, description up to ~5000 words =====
alter table projects add column if not exists description text;
alter table projects drop constraint if exists projects_desc_len;
alter table projects add constraint projects_desc_len check (description is null or char_length(description) <= 40000);
alter table projects alter column status drop default;
alter table projects alter column status type text using (case status::text when 'active' then 'active' when 'on_track' then 'active' when 'at_risk' then 'active' else 'inactive' end);
alter table projects alter column status set default 'active';
alter table projects drop constraint if exists projects_status_chk;
alter table projects add constraint projects_status_chk check (status in ('active', 'inactive', 'coming_soon'));

-- ===== Retention (7 days attendance + activity; login history 7-30 days) =====
create table if not exists retention_settings (
  id int primary key default 1 check (id = 1),
  activity_days int not null default 7 check (activity_days between 1 and 30),
  attendance_days int not null default 7 check (attendance_days between 1 and 30),
  security_days int not null default 30 check (security_days between 7 and 30)
);
insert into retention_settings(id) values (1) on conflict do nothing;
alter table retention_settings enable row level security;
drop policy if exists retention_read on retention_settings;
create policy retention_read on retention_settings for select to authenticated using (
  exists (select 1 from workspace_members where user_id = auth.uid() and active and role::text in ('owner', 'admin')));

create or replace function run_retention_cleanup() returns void
language plpgsql security definer set search_path = public as $$
declare r retention_settings%rowtype;
begin
  select * into r from retention_settings where id = 1;
  delete from attendance where clock_in < now() - make_interval(days => r.attendance_days);
  delete from activity_logs where created_at < now() - make_interval(days => r.activity_days);
  delete from automation_logs where created_at < now() - make_interval(days => r.activity_days);
  delete from security_events where created_at < now() - make_interval(days => r.security_days);
  delete from integration_logs where created_at < now() - interval '30 days';
  delete from notifications where read_at is not null and created_at < now() - interval '30 days';
end $$;

create or replace function set_security_retention(p_days int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from workspace_members where user_id = auth.uid() and active and role::text in ('owner', 'admin')) then raise exception 'Not allowed'; end if;
  if p_days < 7 or p_days > 30 then raise exception 'Retention must be between 7 and 30 days'; end if;
  update retention_settings set security_days = p_days where id = 1;
end $$;

-- Nightly schedule when pg_cron is available; the app also triggers the cleanup once a day for admins.
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('lexon-retention', '17 3 * * *', 'select public.run_retention_cleanup()');
exception when others then raise notice 'pg_cron not enabled (%). The app runs the cleanup daily instead.', sqlerrm;
end $$;

-- ===== Unified activity events =====
alter table automation_logs add column if not exists source text;
create or replace function automation_log_activity() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into activity_logs(workspace_id, actor_id, action, entity_type, entity_id, meta)
  values (new.workspace_id, null, 'automation_event', 'automation', new.automation_id,
          jsonb_build_object('title', coalesce(new.message, new.event), 'source', coalesce(new.source, 'automation'), 'level', new.level));
  return new;
end $$;

create or replace function file_activity() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.source = 'upload' then
    insert into activity_logs(workspace_id, actor_id, action, entity_type, entity_id, meta)
    values (new.workspace_id, new.uploaded_by, 'file_uploaded', 'file', new.id, jsonb_build_object('title', new.name));
  end if;
  return new;
end $$;
drop trigger if exists t_file_activity on files;
create trigger t_file_activity after insert on files for each row execute function file_activity();

create or replace function agent_activity() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into activity_logs(workspace_id, actor_id, action, entity_type, entity_id, meta)
  values (new.workspace_id, null, 'agent_event', 'agent', new.agent_id, jsonb_build_object('title', coalesce(new.message, new.event)));
  return new;
end $$;
drop trigger if exists t_agent_activity on agent_events;
create trigger t_agent_activity after insert on agent_events for each row execute function agent_activity();

create or replace function member_activity() returns trigger language plpgsql security definer set search_path = public as $$
declare n text;
begin
  if new.role::text = 'member' then
    select coalesce(nullif(full_name, ''), 'New member') into n from profiles where id = new.user_id;
    insert into activity_logs(workspace_id, actor_id, action, entity_type, entity_id, meta)
    values (new.workspace_id, null, 'member_added', 'member', new.user_id, jsonb_build_object('title', n));
  end if;
  return new;
end $$;
drop trigger if exists t_member_activity on workspace_members;
create trigger t_member_activity after insert on workspace_members for each row execute function member_activity();

-- ===== Announcements v2 (audience options) =====
drop function if exists broadcast_notification(uuid, text, text);
create or replace function broadcast_notification(ws uuid, p_title text, p_body text, p_audience text default 'all', p_users uuid[] default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin(ws) then raise exception 'Not allowed'; end if;
  if coalesce(trim(p_title), '') = '' or length(p_title) > 120 or length(coalesce(p_body, '')) > 1000 then raise exception 'Invalid announcement'; end if;
  if p_audience not in ('all', 'members', 'admins', 'selected') then raise exception 'Invalid audience'; end if;
  insert into notifications(user_id, type, title, body, entity_type)
  select m.user_id, 'announcement', trim(p_title), nullif(trim(p_body), ''), 'announcement'
  from workspace_members m
  where m.workspace_id = ws and m.active and m.user_id <> auth.uid()
    and (p_audience = 'all'
      or (p_audience = 'members' and m.role::text = 'member')
      or (p_audience = 'admins' and m.role::text in ('owner', 'admin'))
      or (p_audience = 'selected' and m.user_id = any(coalesce(p_users, '{}'))));
  get diagnostics n = row_count;
  insert into activity_logs(workspace_id, actor_id, action, entity_type, meta)
  values (ws, auth.uid(), 'announcement_sent', 'announcement', jsonb_build_object('title', trim(p_title), 'audience', p_audience, 'recipients', n));
  return n;
end $$;

-- ===== Invite lifecycle =====
create or replace function list_invites(ws uuid)
returns table(email text, full_name text, phone text, invited_at timestamptz, status text, last_sign_in_at timestamptz)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not has_permission(ws, 'team.invite') then raise exception 'Not allowed'; end if;
  return query
    select a.email, a.full_name, a.phone, a.invited_at,
           case when u.id is null then 'not_registered' when u.last_sign_in_at is null then 'pending' else 'joined' end,
           u.last_sign_in_at
    from authorized_emails a left join auth.users u on lower(u.email) = lower(a.email)
    where a.workspace_id = ws and a.role::text = 'member'
    order by a.invited_at desc;
end $$;

create or replace function list_admins(ws uuid)
returns table(email text, full_name text, role text, status text)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not is_admin(ws) then raise exception 'Not allowed'; end if;
  return query
    select pp.email, p.full_name, m.role::text, 'active'::text
      from workspace_members m join profiles p on p.id = m.user_id left join profile_private pp on pp.profile_id = p.id
      where m.workspace_id = ws and m.active and m.role::text in ('owner', 'admin')
    union all
    select a.email, a.full_name, 'admin'::text, 'allowlisted'::text
      from authorized_emails a
      where a.workspace_id = ws and a.role::text = 'admin'
        and not exists (select 1 from auth.users u where lower(u.email) = lower(a.email));
end $$;

create or replace function remove_admin(ws uuid, p_email text) returns void
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid;
begin
  if not exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid() and role::text = 'owner' and active) then raise exception 'Only the owner can remove an Admin'; end if;
  select u.id into uid from auth.users u where lower(u.email) = lower(p_email);
  if uid = auth.uid() then raise exception 'You cannot remove yourself'; end if;
  delete from authorized_emails where workspace_id = ws and lower(email) = lower(p_email) and role::text = 'admin';
  if uid is not null then update workspace_members set active = false where workspace_id = ws and user_id = uid and role::text = 'admin'; end if;
end $$;

-- service-role helper for the invite Edge Function
create or replace function auth_user_info(p_email text) returns table(id uuid, last_sign_in_at timestamptz)
language sql security definer stable set search_path = public, auth as $$
  select u.id, u.last_sign_in_at from auth.users u where lower(u.email) = lower(p_email) limit 1 $$;

-- ===== Assistant name =====
alter table profiles add column if not exists assistant_name text not null default 'Lexon Assistant';
alter table profiles drop constraint if exists profiles_assistant_name_len;
alter table profiles add constraint profiles_assistant_name_len check (char_length(assistant_name) between 1 and 40);

-- ===== Re-apply privilege hardening for new objects =====
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function set_integration_secret(uuid, text), get_integration_secret(uuid), delete_integration_secret(uuid),
  rate_limit_hit(text, int, int), auth_user_info(text) from authenticated;

do $$ begin
  execute 'drop policy if exists mfa_gate on public.retention_settings';
  execute 'create policy mfa_gate on public.retention_settings as restrictive to authenticated using (mfa_ok())';
end $$;

notify pgrst, 'reload schema';
