-- =====================================================================================================
-- 1_WORKSPACE_TEAM.sql   (LEXON v5)   RUN ON: Supabase PROJECT A  = the ONE shared project of Lexon Workspace + Lexon Team
-- FRESH install: run this whole file ONCE in Project A > SQL Editor.   (Already have v4 running? Use 4A_UPGRADE_workspace_team.sql instead.)
-- Contents: 0001-0011 core schema, roles, RLS, messaging, calls, integrations, retention, single owner  +  0012 (v5):
--   email-bound invitation codes, grantable permissions (Office access), resource-level RLS, tamper guards, Realtime Authorization,
--   personal links and performance for the Team app.
-- BEFORE running: search for  <<<  near the end of section 0011 and put YOUR owner email there (optionally a password).
-- Passwords are never in SQL: Supabase Auth stores only a bcrypt hash.
-- =====================================================================================================
-- LEXON WORKSPACE: core schema (v1)
create extension if not exists "pgcrypto";

-- ENUMS
create type member_role as enum ('owner','admin','manager','member','agent');
create type presence_status as enum ('online','away','offline');
create type task_status as enum ('todo','in_progress','review','done');
create type task_priority as enum ('low','medium','high','urgent');
create type project_status as enum ('active','on_track','at_risk','paused','archived');
create type conversation_kind as enum ('direct','group','project','agent');

-- HELPERS
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- PROFILES (1:1 with auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  job_title text,
  department text,
  rating numeric(2,1) check (rating between 0 and 5),
  skills text[] default '{}',
  about text,
  presence presence_status not null default 'offline',
  last_seen timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Sensitive fields live in a separate table (never on team cards)
create table profile_private (
  profile_id uuid primary key references profiles(id) on delete cascade,
  phone text, email text, address text, emergency_contact text, notes text,
  updated_at timestamptz not null default now()
);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id),
  branding jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role member_role not null default 'member',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index on workspace_members(user_id);

-- Authorized emails (allow-list for private login)
create table authorized_emails (
  workspace_id uuid references workspaces(id) on delete cascade,
  email text not null,
  role member_role not null default 'member',
  primary key (workspace_id, email)
);

-- Permissions per role (extensible)
create table role_permissions (
  workspace_id uuid references workspaces(id) on delete cascade,
  role member_role not null,
  permission text not null, -- e.g. 'team.view_private','tasks.create'
  primary key (workspace_id, role, permission)
);

-- PROJECT REGISTRY
create table projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  type text, url text, repository text, icon text, environment text,
  status project_status not null default 'active',
  health int check (health between 0 and 100),
  progress int not null default 0 check (progress between 0 and 100),
  last_activity timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on projects(workspace_id);
create table project_members (
  project_id uuid references projects(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  primary key (project_id, user_id)
);

-- TASKS
create table tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  description text,
  status task_status not null default 'todo',
  priority task_priority not null default 'medium',
  progress int not null default 0 check (progress between 0 and 100),
  start_date date, due_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on tasks(workspace_id, status);
create index on tasks(project_id);
create table task_assignees (
  task_id uuid references tasks(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  primary key (task_id, user_id)
);
create index on task_assignees(user_id);

-- FILES
create table folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  parent_id uuid references folders(id) on delete cascade,
  name text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create table files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  folder_id uuid references folders(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  name text not null,
  storage_path text not null unique,
  mime_type text, size_bytes bigint,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index on files(workspace_id, folder_id);

-- MESSAGING
create table conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind conversation_kind not null,
  title text,
  project_id uuid references projects(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table conversation_members (
  conversation_id uuid references conversations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  pinned boolean not null default false,
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  body text, file_id uuid references files(id),
  reply_to uuid references messages(id),
  reactions jsonb not null default '{}',
  edited_at timestamptz, deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index on messages(conversation_id, created_at desc);

-- NOTIFICATIONS / ACTIVITY / ATTENDANCE / SECURITY
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null, title text not null, body text,
  entity_type text, entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications(user_id, read_at, created_at desc);
create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  actor_id uuid references profiles(id),
  action text not null, entity_type text, entity_id uuid,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on activity_logs(workspace_id, created_at desc);
create table attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  clock_in timestamptz not null default now(),
  clock_out timestamptz
);
create table security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  event text not null, ip inet, user_agent text,
  created_at timestamptz not null default now()
);
create table integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider text not null, config jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- updated_at triggers
create trigger t_profiles before update on profiles for each row execute function set_updated_at();
create trigger t_projects before update on projects for each row execute function set_updated_at();
create trigger t_tasks before update on tasks for each row execute function set_updated_at();

-- SECURITY HELPERS (security definer avoids RLS recursion)
create or replace function is_member(ws uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(select 1 from workspace_members
    where workspace_id = ws and user_id = auth.uid() and active) $$;

create or replace function has_role(ws uuid, roles member_role[]) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(select 1 from workspace_members
    where workspace_id = ws and user_id = auth.uid() and active and role = any(roles)) $$;

-- Auto-profile on signup, ONLY for allow-listed emails
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare a authorized_emails%rowtype; ws uuid;
begin
  -- Bootstrap: very first user ever becomes Owner and creates the workspace
  if not exists (select 1 from workspaces) then
    insert into workspaces(name, owner_id) values ('Lexon Workspace', new.id) returning id into ws;
    insert into profiles(id, full_name, avatar_url)
      values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.raw_user_meta_data->>'avatar_url');
    insert into workspace_members(workspace_id, user_id, role) values (ws, new.id, 'owner');
    return new;
  end if;
  select * into a from authorized_emails where lower(email) = lower(new.email) limit 1;
  if not found then
    raise exception 'Email not authorized for this workspace';
  end if;
  insert into profiles(id, full_name, avatar_url)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.raw_user_meta_data->>'avatar_url');
  insert into workspace_members(workspace_id, user_id, role) values (a.workspace_id, new.id, a.role);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Notify assignees (delivered to Lexon Team via Realtime)
create or replace function notify_task_assignee() returns trigger
language plpgsql security definer set search_path = public as $$
declare t tasks%rowtype;
begin
  select * into t from tasks where id = new.task_id;
  insert into notifications(user_id, type, title, body, entity_type, entity_id)
  values (new.user_id, 'task_assigned', 'New task assigned', t.title, 'task', t.id);
  insert into activity_logs(workspace_id, actor_id, action, entity_type, entity_id)
  values (t.workspace_id, auth.uid(), 'task_assigned', 'task', t.id);
  return new;
end $$;
create trigger on_task_assigned after insert on task_assignees
  for each row execute function notify_task_assignee();

-- ROW LEVEL SECURITY
alter table profiles enable row level security;
alter table profile_private enable row level security;
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table authorized_emails enable row level security;
alter table role_permissions enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table tasks enable row level security;
alter table task_assignees enable row level security;
alter table folders enable row level security;
alter table files enable row level security;
alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;
alter table notifications enable row level security;
alter table activity_logs enable row level security;
alter table attendance enable row level security;
alter table security_events enable row level security;
alter table integrations enable row level security;

-- profiles: visible to people sharing a workspace; self-editable
create policy profiles_read on profiles for select using (
  id = auth.uid() or exists (
    select 1 from workspace_members a join workspace_members b on a.workspace_id = b.workspace_id
    where a.user_id = auth.uid() and b.user_id = profiles.id and a.active));
create policy profiles_self_update on profiles for update using (id = auth.uid());
create policy profiles_admin_update on profiles for update using (exists (
  select 1 from workspace_members b where b.user_id = profiles.id
  and has_role(b.workspace_id, array['owner','admin']::member_role[])));

-- private info: self, or owner/admin only
create policy private_read on profile_private for select using (
  profile_id = auth.uid() or exists (
    select 1 from workspace_members b where b.user_id = profile_private.profile_id
    and has_role(b.workspace_id, array['owner','admin']::member_role[])));
create policy private_write on profile_private for all using (
  profile_id = auth.uid() or exists (
    select 1 from workspace_members b where b.user_id = profile_private.profile_id
    and has_role(b.workspace_id, array['owner','admin']::member_role[])));

create policy ws_read on workspaces for select using (is_member(id));
create policy ws_owner_update on workspaces for update using (owner_id = auth.uid());

create policy wm_read on workspace_members for select using (is_member(workspace_id));
create policy wm_admin_write on workspace_members for all using (
  has_role(workspace_id, array['owner','admin']::member_role[]));

create policy ae_admin on authorized_emails for all using (
  has_role(workspace_id, array['owner','admin']::member_role[]));
create policy rp_read on role_permissions for select using (is_member(workspace_id));
create policy rp_owner on role_permissions for all using (has_role(workspace_id, array['owner']::member_role[]));

create policy projects_read on projects for select using (is_member(workspace_id));
create policy projects_write on projects for all using (
  has_role(workspace_id, array['owner','admin','manager']::member_role[]));
create policy pm_read on project_members for select using (
  exists (select 1 from projects p where p.id = project_id and is_member(p.workspace_id)));
create policy pm_write on project_members for all using (
  exists (select 1 from projects p where p.id = project_id
    and has_role(p.workspace_id, array['owner','admin','manager']::member_role[])));

create policy tasks_read on tasks for select using (is_member(workspace_id));
create policy tasks_write on tasks for all using (
  has_role(workspace_id, array['owner','admin','manager']::member_role[]));
create policy tasks_assignee_update on tasks for update using (
  exists (select 1 from task_assignees a where a.task_id = tasks.id and a.user_id = auth.uid()));
create policy ta_read on task_assignees for select using (
  exists (select 1 from tasks t where t.id = task_id and is_member(t.workspace_id)));
create policy ta_write on task_assignees for all using (
  exists (select 1 from tasks t where t.id = task_id
    and has_role(t.workspace_id, array['owner','admin','manager']::member_role[])));

create policy folders_read on folders for select using (is_member(workspace_id));
create policy folders_write on folders for all using (is_member(workspace_id)) with check (is_member(workspace_id));
create policy files_read on files for select using (is_member(workspace_id));
create policy files_write on files for all using (is_member(workspace_id)) with check (is_member(workspace_id));

-- messaging: only conversation members
create or replace function in_conversation(cid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(select 1 from conversation_members where conversation_id = cid and user_id = auth.uid()) $$;
create policy conv_read on conversations for select using (in_conversation(id));
create policy conv_create on conversations for insert with check (is_member(workspace_id));
create policy cm_read on conversation_members for select using (in_conversation(conversation_id));
create policy cm_self on conversation_members for update using (user_id = auth.uid());
create policy msg_read on messages for select using (in_conversation(conversation_id));
create policy msg_send on messages for insert with check (sender_id = auth.uid() and in_conversation(conversation_id));
create policy msg_edit on messages for update using (sender_id = auth.uid());

create policy notif_own on notifications for select using (user_id = auth.uid());
create policy notif_mark on notifications for update using (user_id = auth.uid());
create policy activity_read on activity_logs for select using (is_member(workspace_id));
create policy attendance_own on attendance for all using (user_id = auth.uid());
create policy attendance_admin on attendance for select using (exists (
  select 1 from workspace_members b where b.user_id = attendance.user_id
  and has_role(b.workspace_id, array['owner','admin','manager']::member_role[])));
create policy secev_own on security_events for select using (user_id = auth.uid());
create policy integ_admin on integrations for all using (
  has_role(workspace_id, array['owner','admin']::member_role[]));

-- STORAGE (private bucket; path = <workspace_id>/<file_id>/<name>)
insert into storage.buckets (id, name, public, file_size_limit)
values ('workspace-files','workspace-files', false, 524288000)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars','avatars', false, 2097152)
on conflict (id) do nothing;

create policy "ws files read" on storage.objects for select to authenticated using (
  bucket_id = 'workspace-files' and is_member(((storage.foldername(name))[1])::uuid));
create policy "ws files write" on storage.objects for insert to authenticated with check (
  bucket_id = 'workspace-files' and is_member(((storage.foldername(name))[1])::uuid));
create policy "ws files delete" on storage.objects for delete to authenticated using (
  bucket_id = 'workspace-files' and has_role(((storage.foldername(name))[1])::uuid, array['owner','admin','manager']::member_role[]));
create policy "avatars read" on storage.objects for select to authenticated using (bucket_id = 'avatars');
create policy "avatars own write" on storage.objects for insert to authenticated with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- REALTIME
alter publication supabase_realtime add table messages, notifications, tasks, activity_logs, profiles;
-- Invite details are stored with the allow-list entry and copied to the profile on first login.
alter table authorized_emails
  add column if not exists full_name text,
  add column if not exists job_title text,
  add column if not exists department text;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare a authorized_emails%rowtype; ws uuid;
begin
  if not exists (select 1 from workspaces) then
    insert into workspaces(name, owner_id) values ('Lexon Workspace', new.id) returning id into ws;
    insert into profiles(id, full_name, avatar_url)
      values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.raw_user_meta_data->>'avatar_url');
    insert into workspace_members(workspace_id, user_id, role) values (ws, new.id, 'owner');
    return new;
  end if;

  select * into a from authorized_emails where lower(email) = lower(new.email) limit 1;
  if not found then
    raise exception 'Email not authorized for this workspace';
  end if;

  insert into profiles(id, full_name, avatar_url, job_title, department)
    values (new.id,
            coalesce(nullif(a.full_name,''), new.raw_user_meta_data->>'full_name', ''),
            new.raw_user_meta_data->>'avatar_url', a.job_title, a.department);
  insert into workspace_members(workspace_id, user_id, role) values (a.workspace_id, new.id, a.role);
  return new;
end $$;
-- Permission-based access, attendance/activity rules, avatar storage, task/project automation.

create or replace function has_permission(ws uuid, perm text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.active
      and (m.role = 'owner' or exists(
        select 1 from role_permissions rp
        where rp.workspace_id = ws and rp.role = m.role and rp.permission = perm))) $$;

-- Default permission matrix (owner always has everything; editable in Settings -> Permissions)
create or replace function seed_role_permissions(ws uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into role_permissions(workspace_id, role, permission)
  select ws, 'admin', p from unnest(array['team.view_private','team.edit','team.rate','team.invite',
    'team.view_attendance','projects.manage','tasks.create','tasks.edit']) p on conflict do nothing;
  insert into role_permissions(workspace_id, role, permission)
  select ws, 'manager', p from unnest(array['team.rate','team.view_attendance','projects.manage',
    'tasks.create','tasks.edit']) p on conflict do nothing;
end $$;

create or replace function on_workspace_created() returns trigger language plpgsql as $$
begin perform seed_role_permissions(new.id); return new; end $$;
create trigger t_seed_permissions after insert on workspaces for each row execute function on_workspace_created();
select seed_role_permissions(id) from workspaces;

-- Replace role-based policies with permission-based ones
drop policy if exists private_read on profile_private;
drop policy if exists private_write on profile_private;
create policy private_access on profile_private for all using (
  profile_id = auth.uid() or exists (select 1 from workspace_members b
    where b.user_id = profile_private.profile_id and has_permission(b.workspace_id, 'team.view_private')));

drop policy if exists profiles_admin_update on profiles;
create policy profiles_perm_update on profiles for update using (exists (
  select 1 from workspace_members b where b.user_id = profiles.id
  and (has_permission(b.workspace_id, 'team.edit') or has_permission(b.workspace_id, 'team.rate'))));

drop policy if exists ae_admin on authorized_emails;
create policy ae_invite on authorized_emails for all using (has_permission(workspace_id, 'team.invite'));

drop policy if exists wm_admin_write on workspace_members;
create policy wm_edit on workspace_members for all using (has_permission(workspace_id, 'team.edit') and role <> 'owner');

drop policy if exists attendance_admin on attendance;
create policy attendance_view on attendance for select using (exists (
  select 1 from workspace_members b where b.user_id = attendance.user_id
  and has_permission(b.workspace_id, 'team.view_attendance')));

drop policy if exists projects_write on projects;
create policy projects_manage on projects for all using (has_permission(workspace_id, 'projects.manage'));
drop policy if exists pm_write on project_members;
create policy pm_manage on project_members for all using (exists (
  select 1 from projects p where p.id = project_id and has_permission(p.workspace_id, 'projects.manage')));

drop policy if exists tasks_write on tasks;
create policy tasks_insert on tasks for insert with check (has_permission(workspace_id, 'tasks.create'));
create policy tasks_edit on tasks for update using (has_permission(workspace_id, 'tasks.edit'));
create policy tasks_delete on tasks for delete using (has_permission(workspace_id, 'tasks.edit'));
drop policy if exists ta_write on task_assignees;
create policy ta_manage on task_assignees for all using (exists (
  select 1 from tasks t where t.id = task_id
  and (has_permission(t.workspace_id, 'tasks.create') or has_permission(t.workspace_id, 'tasks.edit'))));

-- Field-level guard: rating needs team.rate; editing others' details needs team.edit
create or replace function guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare can_edit boolean; can_rate boolean;
begin
  if auth.uid() is null then return new; end if; -- server-side/service role
  select coalesce(bool_or(has_permission(m.workspace_id, 'team.edit')), false),
         coalesce(bool_or(has_permission(m.workspace_id, 'team.rate')), false)
    into can_edit, can_rate from workspace_members m where m.user_id = new.id;
  if new.rating is distinct from old.rating and not can_rate then
    raise exception 'You are not allowed to change ratings';
  end if;
  if auth.uid() <> new.id and not can_edit and
     (new.full_name, new.job_title, new.department, new.skills, new.about, new.avatar_url)
       is distinct from (old.full_name, old.job_title, old.department, old.skills, old.about, old.avatar_url) then
    raise exception 'You are not allowed to edit this member';
  end if;
  return new;
end $$;
create trigger t_guard_profile before update on profiles for each row execute function guard_profile_update();

-- Avatars: public-read bucket (non-sensitive images); write only own folder or with team.edit
update storage.buckets set public = true where id = 'avatars';
drop policy if exists "avatars own write" on storage.objects;
create policy "avatars write" on storage.objects for insert to authenticated with check (
  bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or exists (
    select 1 from workspace_members m where m.user_id::text = (storage.foldername(name))[1]
    and has_permission(m.workspace_id, 'team.edit'))));
create policy "avatars update" on storage.objects for update to authenticated using (
  bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or exists (
    select 1 from workspace_members m where m.user_id::text = (storage.foldername(name))[1]
    and has_permission(m.workspace_id, 'team.edit'))));

-- Task rules: done <-> 100%
create or replace function task_normalize() returns trigger language plpgsql as $$
begin
  if new.status = 'done' then new.progress := 100; end if;
  return new;
end $$;
create trigger t_task_normalize before insert or update on tasks for each row execute function task_normalize();

-- Project progress = average task progress; also refreshes last_activity
create or replace function recompute_project(pid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if pid is null then return; end if;
  update projects set last_activity = now(),
    progress = coalesce((select round(avg(progress))::int from tasks where project_id = pid), 0)
  where id = pid;
end $$;
create or replace function task_project_sync() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then perform recompute_project(old.project_id); return old; end if;
  perform recompute_project(new.project_id);
  if tg_op = 'UPDATE' and old.project_id is distinct from new.project_id then perform recompute_project(old.project_id); end if;
  return new;
end $$;
create trigger t_task_project_sync after insert or update or delete on tasks for each row execute function task_project_sync();

-- Activity feed
create or replace function task_activity() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into activity_logs(workspace_id, actor_id, action, entity_type, entity_id, meta)
    values (new.workspace_id, auth.uid(), 'task_created', 'task', new.id, jsonb_build_object('title', new.title));
  elsif new.status = 'done' and old.status <> 'done' then
    insert into activity_logs(workspace_id, actor_id, action, entity_type, entity_id, meta)
    values (new.workspace_id, auth.uid(), 'task_completed', 'task', new.id, jsonb_build_object('title', new.title));
  end if;
  return new;
end $$;
create trigger t_task_activity after insert or update on tasks for each row execute function task_activity();

create or replace function project_activity() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into activity_logs(workspace_id, actor_id, action, entity_type, entity_id, meta)
  values (new.workspace_id, auth.uid(), 'project_created', 'project', new.id, jsonb_build_object('title', new.name));
  return new;
end $$;
create trigger t_project_activity after insert on projects for each row execute function project_activity();

-- Fix: task assignment activity should carry the task title
create or replace function notify_task_assignee() returns trigger
language plpgsql security definer set search_path = public as $$
declare t tasks%rowtype;
begin
  select * into t from tasks where id = new.task_id;
  if new.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) then
    insert into notifications(user_id, type, title, body, entity_type, entity_id)
    values (new.user_id, 'task_assigned', 'New task assigned', t.title, 'task', t.id);
  end if;
  insert into activity_logs(workspace_id, actor_id, action, entity_type, entity_id, meta)
  values (t.workspace_id, auth.uid(), 'task_assigned', 'task', t.id, jsonb_build_object('title', t.title));
  return new;
end $$;
-- Messaging RPCs, notifications for messages, files rules.

-- Conversation list with last message, unread count and the other person (for DMs)
create or replace function my_conversations(ws uuid)
returns table(id uuid, kind conversation_kind, title text, pinned boolean, last_body text, last_at timestamptz,
  last_sender uuid, unread bigint, other_id uuid, other_name text, other_avatar text,
  other_presence presence_status, other_last_seen timestamptz)
language sql stable security invoker set search_path = public as $$
  select c.id, c.kind, c.title, cm.pinned, lm.body, lm.created_at, lm.sender_id,
    (select count(*) from messages m where m.conversation_id = c.id and m.sender_id <> auth.uid()
       and m.deleted_at is null and (cm.last_read_at is null or m.created_at > cm.last_read_at)),
    o.id, o.full_name, o.avatar_url, o.presence, o.last_seen
  from conversations c
  join conversation_members cm on cm.conversation_id = c.id and cm.user_id = auth.uid()
  left join lateral (select m.body, m.created_at, m.sender_id, m.file_id from messages m
     where m.conversation_id = c.id and m.deleted_at is null order by m.created_at desc limit 1) lm on true
  left join lateral (select p.id, p.full_name, p.avatar_url, p.presence, p.last_seen
     from conversation_members x join profiles p on p.id = x.user_id
     where x.conversation_id = c.id and x.user_id <> auth.uid() and c.kind = 'direct' limit 1) o on true
  where c.workspace_id = ws
  order by coalesce(lm.created_at, c.created_at) desc
$$;

create or replace function start_direct(ws uuid, other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if other = auth.uid() or not is_member(ws)
     or not exists (select 1 from workspace_members where workspace_id = ws and user_id = other and active) then
    raise exception 'Not allowed';
  end if;
  select c.id into cid from conversations c
   where c.workspace_id = ws and c.kind = 'direct'
     and exists (select 1 from conversation_members a where a.conversation_id = c.id and a.user_id = auth.uid())
     and exists (select 1 from conversation_members b where b.conversation_id = c.id and b.user_id = other)
   limit 1;
  if cid is null then
    insert into conversations(workspace_id, kind) values (ws, 'direct') returning id into cid;
    insert into conversation_members(conversation_id, user_id) values (cid, auth.uid()), (cid, other);
  end if;
  return cid;
end $$;

create or replace function create_group(ws uuid, group_title text, members uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if not is_member(ws) or coalesce(trim(group_title), '') = '' then raise exception 'Not allowed'; end if;
  insert into conversations(workspace_id, kind, title) values (ws, 'group', trim(group_title)) returning id into cid;
  insert into conversation_members(conversation_id, user_id) values (cid, auth.uid());
  insert into conversation_members(conversation_id, user_id)
    select cid, m.user_id from workspace_members m
    where m.workspace_id = ws and m.active and m.user_id = any(members) and m.user_id <> auth.uid()
  on conflict do nothing;
  return cid;
end $$;

-- Reactions: {"emoji": ["user-id", ...]}
create or replace function toggle_reaction(msg uuid, emoji text) returns void
language plpgsql security definer set search_path = public as $$
declare r jsonb; arr jsonb; uid text := auth.uid()::text;
begin
  select reactions into r from messages where id = msg and in_conversation(conversation_id) for update;
  if not found then raise exception 'Not allowed'; end if;
  arr := coalesce(r -> emoji, '[]'::jsonb);
  if arr ? uid then
    arr := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements_text(arr) x where x <> uid);
  else
    arr := arr || to_jsonb(uid);
  end if;
  if jsonb_array_length(arr) = 0 then r := r - emoji; else r := jsonb_set(r, array[emoji], arr); end if;
  update messages set reactions = r where id = msg;
end $$;

-- Notify other conversation members about new messages
create or replace function notify_new_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare sname text;
begin
  select full_name into sname from profiles where id = new.sender_id;
  insert into notifications(user_id, type, title, body, entity_type, entity_id)
  select cm.user_id, 'message', coalesce(nullif(sname, ''), 'New message'),
         left(coalesce(new.body, 'Sent an attachment'), 120), 'conversation', new.conversation_id
  from conversation_members cm
  where cm.conversation_id = new.conversation_id and cm.user_id <> new.sender_id;
  return new;
end $$;
create trigger t_notify_message after insert on messages for each row execute function notify_new_message();

-- Members can leave/pin only their own membership row (already allowed by cm_self update)

-- FILES: chat attachments are tagged so the Files page can hide them
alter table files add column if not exists source text not null default 'upload';

drop policy if exists files_write on files;
create policy files_insert on files for insert with check (is_member(workspace_id) and uploaded_by = auth.uid());
create policy files_update on files for update using (has_permission(workspace_id, 'files.delete') or uploaded_by = auth.uid());
create policy files_delete on files for delete using (has_permission(workspace_id, 'files.delete'));
drop policy if exists folders_write on folders;
create policy folders_insert on folders for insert with check (is_member(workspace_id));
create policy folders_update on folders for update using (is_member(workspace_id));
create policy folders_delete on folders for delete using (has_permission(workspace_id, 'files.delete'));

drop policy if exists "ws files delete" on storage.objects;
create policy "ws files delete" on storage.objects for delete to authenticated using (
  bucket_id = 'workspace-files' and has_permission(((storage.foldername(name))[1])::uuid, 'files.delete'));

-- New permission in the default matrix (admin + manager), backfilled for existing workspaces
create or replace function seed_role_permissions(ws uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into role_permissions(workspace_id, role, permission)
  select ws, 'admin', p from unnest(array['team.view_private','team.edit','team.rate','team.invite',
    'team.view_attendance','projects.manage','tasks.create','tasks.edit','files.delete']) p on conflict do nothing;
  insert into role_permissions(workspace_id, role, permission)
  select ws, 'manager', p from unnest(array['team.rate','team.view_attendance','projects.manage',
    'tasks.create','tasks.edit','files.delete']) p on conflict do nothing;
end $$;
select seed_role_permissions(id) from workspaces;
-- Security hardening: enforce 2FA (aal2) in the DATABASE for users who enabled it, and allow login-event logging.

-- True when the session is aal2, or the user has no verified 2FA factor yet.
create or replace function mfa_ok() returns boolean
language sql security definer stable set search_path = public, auth as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
$$;

-- Restrictive policies are ANDed with every other policy: a password/OAuth-only token cannot
-- read data once the account has 2FA, even by calling the API directly.
do $$
declare t text;
begin
  foreach t in array array['profiles','profile_private','workspaces','workspace_members','authorized_emails',
    'role_permissions','projects','project_members','tasks','task_assignees','folders','files','conversations',
    'conversation_members','messages','notifications','activity_logs','attendance','security_events','integrations']
  loop
    execute format('drop policy if exists mfa_gate on public.%I', t);
    execute format('create policy mfa_gate on public.%I as restrictive to authenticated using (mfa_ok())', t);
  end loop;
end $$;

drop policy if exists mfa_gate on storage.objects;
create policy mfa_gate on storage.objects as restrictive to authenticated using (mfa_ok());

-- Users can log their own security events (login, logout, 2FA changes)
create policy secev_insert on security_events for insert with check (user_id = auth.uid());
create index if not exists security_events_user_idx on security_events(user_id, created_at desc);
-- 0006: Team invites, calls (WebRTC signaling state), integrations (vault), automation registry/logs, agents.
-- (YouTube / Office / Instagram data live in their OWN Supabase projects, reached only through the project-gateway function.)

-- ===== Team: invite details, theme, protected identity fields =====
alter table authorized_emails add column if not exists phone text;
alter table profiles add column if not exists theme text not null default 'system' check (theme in ('light','dark','system'));

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare a authorized_emails%rowtype; ws uuid;
begin
  if not exists (select 1 from workspaces) then
    insert into workspaces(name, owner_id) values ('Lexon Workspace', new.id) returning id into ws;
    insert into profiles(id, full_name, avatar_url)
      values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.raw_user_meta_data->>'avatar_url');
    insert into profile_private(profile_id, email) values (new.id, new.email);
    insert into workspace_members(workspace_id, user_id, role) values (ws, new.id, 'owner');
    return new;
  end if;
  select * into a from authorized_emails where lower(email) = lower(new.email) limit 1;
  if not found then raise exception 'Email not authorized for this workspace'; end if;
  insert into profiles(id, full_name, avatar_url, job_title, department)
    values (new.id, coalesce(nullif(a.full_name,''), new.raw_user_meta_data->>'full_name', ''),
            new.raw_user_meta_data->>'avatar_url', a.job_title, a.department);
  insert into profile_private(profile_id, email, phone) values (new.id, new.email, a.phone);
  insert into workspace_members(workspace_id, user_id, role) values (a.workspace_id, new.id, a.role);
  return new;
end $$;

-- Members may only change: photo, about, skills, theme, presence (+ address in profile_private).
-- Name, role title, department, rating need team.edit / team.rate.
create or replace function guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare can_edit boolean; can_rate boolean;
begin
  if auth.uid() is null then return new; end if;
  select coalesce(bool_or(has_permission(m.workspace_id, 'team.edit')), false),
         coalesce(bool_or(has_permission(m.workspace_id, 'team.rate')), false)
    into can_edit, can_rate from workspace_members m where m.user_id = new.id;
  if new.rating is distinct from old.rating and not can_rate then raise exception 'You are not allowed to change ratings'; end if;
  if not can_edit and (new.full_name, new.job_title, new.department) is distinct from (old.full_name, old.job_title, old.department) then
    raise exception 'Name, role and department are managed by the owner';
  end if;
  if auth.uid() <> new.id and not can_edit and
     (new.skills, new.about, new.avatar_url) is distinct from (old.skills, old.about, old.avatar_url) then
    raise exception 'You are not allowed to edit this member';
  end if;
  return new;
end $$;

create or replace function guard_private_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare can_edit boolean;
begin
  if auth.uid() is null then return new; end if;
  select coalesce(bool_or(has_permission(m.workspace_id, 'team.edit')), false) into can_edit
    from workspace_members m where m.user_id = new.profile_id;
  if can_edit then return new; end if;
  if tg_op = 'UPDATE' and (new.phone, new.email) is distinct from (old.phone, old.email) then
    raise exception 'Phone and email are managed by the owner';
  end if;
  if tg_op = 'INSERT' and (new.phone is not null or new.email is not null)
     and not exists (select 1 from profile_private where profile_id = new.profile_id) then
    raise exception 'Phone and email are managed by the owner';
  end if;
  return new;
end $$;
drop trigger if exists t_guard_private on profile_private;
create trigger t_guard_private before insert or update on profile_private for each row execute function guard_private_update();

-- ===== New permissions =====
create or replace function seed_role_permissions(ws uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into role_permissions(workspace_id, role, permission)
  select ws, 'admin', p from unnest(array['team.view_private','team.edit','team.rate','team.invite',
    'team.view_attendance','projects.manage','tasks.create','tasks.edit','files.delete',
    'integrations.manage','automations.manage','agents.manage']) p on conflict do nothing;
  insert into role_permissions(workspace_id, role, permission)
  select ws, 'manager', p from unnest(array['team.rate','team.view_attendance','projects.manage',
    'tasks.create','tasks.edit','files.delete']) p on conflict do nothing;
end $$;
select seed_role_permissions(id) from workspaces;

-- ===== Calls (state only; SDP/ICE travel over Realtime broadcast) =====
do $$ begin create type call_kind as enum ('audio','video'); exception when duplicate_object then null; end $$;
do $$ begin create type call_status as enum ('ringing','accepted','declined','ended','missed','cancelled'); exception when duplicate_object then null; end $$;
create table if not exists call_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  caller_id uuid not null references profiles(id),
  callee_id uuid not null references profiles(id),
  kind call_kind not null,
  status call_status not null default 'ringing',
  created_at timestamptz not null default now(),
  answered_at timestamptz, ended_at timestamptz
);
create index if not exists call_caller_idx on call_sessions(caller_id, created_at desc);
create index if not exists call_callee_idx on call_sessions(callee_id, created_at desc);
alter table call_sessions enable row level security;
create policy calls_read on call_sessions for select using (caller_id = auth.uid() or callee_id = auth.uid());
create policy calls_insert on call_sessions for insert with check (
  caller_id = auth.uid() and caller_id <> callee_id and is_member(workspace_id)
  and exists (select 1 from workspace_members m where m.workspace_id = call_sessions.workspace_id and m.user_id = callee_id and m.active));
create policy calls_update on call_sessions for update using (caller_id = auth.uid() or callee_id = auth.uid());

create or replace function guard_call_update() returns trigger language plpgsql as $$
begin
  if (new.caller_id, new.callee_id, new.workspace_id, new.kind) is distinct from (old.caller_id, old.callee_id, old.workspace_id, old.kind) then
    raise exception 'Call participants cannot change';
  end if;
  if old.status in ('declined','ended','missed','cancelled') then raise exception 'Call already finished'; end if;
  return new;
end $$;
create trigger t_guard_call before update on call_sessions for each row execute function guard_call_update();

create or replace function notify_call() returns trigger language plpgsql security definer set search_path = public as $$
declare cname text;
begin
  select full_name into cname from profiles where id = new.caller_id;
  insert into notifications(user_id, type, title, body, entity_type, entity_id)
  values (new.callee_id, 'call', 'Incoming ' || new.kind::text || ' call', coalesce(nullif(cname, ''), 'Someone') || ' is calling you', 'call', new.id);
  return new;
end $$;
create trigger t_notify_call after insert on call_sessions for each row execute function notify_call();
alter publication supabase_realtime add table call_sessions;

-- ===== Integrations (tokens live in Supabase Vault, never in tables or the browser) =====
do $$ begin create extension if not exists supabase_vault; exception when others then raise notice 'Vault extension: %', sqlerrm; end $$;

alter table integrations
  add column if not exists status text not null default 'disconnected',
  add column if not exists scopes text[] not null default '{}',
  add column if not exists account_label text,
  add column if not exists connected_by uuid references profiles(id),
  add column if not exists connected_at timestamptz,
  add column if not exists last_error text,
  add column if not exists last_sync_at timestamptz;
create unique index if not exists integrations_ws_provider on integrations(workspace_id, provider);
drop policy if exists integ_admin on integrations;
create policy integ_manage on integrations for all using (has_permission(workspace_id, 'integrations.manage'))
  with check (has_permission(workspace_id, 'integrations.manage'));

create table if not exists integration_secrets (
  integration_id uuid primary key references integrations(id) on delete cascade,
  vault_secret_id uuid not null
);
alter table integration_secrets enable row level security; -- no policies: clients can never read it

create table if not exists integration_logs (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references integrations(id) on delete cascade,
  level text not null default 'info', message text not null, meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists integration_logs_idx on integration_logs(integration_id, created_at desc);
alter table integration_logs enable row level security;
create policy integ_logs_read on integration_logs for select using (exists (
  select 1 from integrations i where i.id = integration_id and has_permission(i.workspace_id, 'integrations.manage')));

create or replace function set_integration_secret(p_integration uuid, p_secret text) returns void
language plpgsql security definer set search_path = public, vault as $$
declare sid uuid;
begin
  select vault_secret_id into sid from integration_secrets where integration_id = p_integration;
  if sid is null then
    sid := vault.create_secret(p_secret, 'integration_' || p_integration::text);
    insert into integration_secrets(integration_id, vault_secret_id) values (p_integration, sid);
  else
    perform vault.update_secret(sid, p_secret);
  end if;
end $$;
create or replace function get_integration_secret(p_integration uuid) returns text
language plpgsql security definer set search_path = public, vault as $$
declare r text;
begin
  select ds.decrypted_secret into r from integration_secrets s join vault.decrypted_secrets ds on ds.id = s.vault_secret_id
   where s.integration_id = p_integration;
  return r;
end $$;
create or replace function delete_integration_secret(p_integration uuid) returns void
language plpgsql security definer set search_path = public, vault as $$
declare sid uuid;
begin
  select vault_secret_id into sid from integration_secrets where integration_id = p_integration;
  if sid is not null then
    delete from integration_secrets where integration_id = p_integration;
    delete from vault.secrets where id = sid;
  end if;
end $$;
revoke all on function set_integration_secret(uuid, text), get_integration_secret(uuid), delete_integration_secret(uuid) from public, anon, authenticated;
grant execute on function set_integration_secret(uuid, text), get_integration_secret(uuid), delete_integration_secret(uuid) to service_role;

-- ===== Automations (registry + logs; Instagram project plugs in here) =====
create table if not exists automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind text not null, name text not null,
  status text not null default 'not_configured',
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (workspace_id, kind)
);
create table if not exists automation_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  automation_id uuid references automations(id) on delete cascade,
  level text not null default 'info', event text not null, message text, meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists automation_logs_idx on automation_logs(workspace_id, created_at desc);
alter table automations enable row level security;
alter table automation_logs enable row level security;
create policy automations_manage on automations for all using (has_permission(workspace_id, 'automations.manage'))
  with check (has_permission(workspace_id, 'automations.manage'));
create policy automation_logs_read on automation_logs for select using (has_permission(workspace_id, 'automations.manage'));

create or replace function automation_log_activity() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into activity_logs(workspace_id, actor_id, action, entity_type, entity_id, meta)
  values (new.workspace_id, null, 'automation_event', 'automation', new.automation_id, jsonb_build_object('title', coalesce(new.message, new.event)));
  return new;
end $$;
create trigger t_automation_log_activity after insert on automation_logs for each row execute function automation_log_activity();

-- ===== Agents (architecture only: intentionally no rows) =====
create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null, kind text, status text not null default 'inactive',
  config jsonb not null default '{}',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists agent_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  event text not null, message text, meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists agent_events_idx on agent_events(agent_id, created_at desc);
alter table agents enable row level security;
alter table agent_events enable row level security;
create policy agents_read on agents for select using (is_member(workspace_id));
create policy agents_manage on agents for all using (has_permission(workspace_id, 'agents.manage'))
  with check (has_permission(workspace_id, 'agents.manage'));
create policy agent_events_read on agent_events for select using (is_member(workspace_id));

-- ===== 2FA gate on all new tables =====
do $$
declare t text;
begin
  foreach t in array array['call_sessions','integration_secrets','integration_logs','automations','automation_logs',
    'agents','agent_events']
  loop
    execute format('drop policy if exists mfa_gate on public.%I', t);
    execute format('create policy mfa_gate on public.%I as restrictive to authenticated using (mfa_ok())', t);
  end loop;
end $$;
-- 0007: rate limiting, workspace admin RPCs, linked-project status, and privilege hardening.

-- ===== Rate limiting (used by Edge Functions through the service role) =====
create table if not exists rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);
alter table rate_limits enable row level security; -- no policies: service role only

create or replace function rate_limit_hit(p_key text, p_max int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = public as $$
declare r rate_limits%rowtype;
begin
  insert into rate_limits(key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rate_limits.hits + 1 end,
    window_start = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now() else rate_limits.window_start end
  returning * into r;
  return r.hits <= p_max;
end $$;

-- ===== Permissions for new admin features =====
create or replace function seed_role_permissions(ws uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into role_permissions(workspace_id, role, permission)
  select ws, 'admin', p from unnest(array['team.view_private','team.edit','team.rate','team.invite',
    'team.view_attendance','projects.manage','tasks.create','tasks.edit','files.delete',
    'integrations.manage','automations.manage','agents.manage','notifications.broadcast']) p on conflict do nothing;
  insert into role_permissions(workspace_id, role, permission)
  select ws, 'manager', p from unnest(array['team.rate','team.view_attendance','projects.manage',
    'tasks.create','tasks.edit','files.delete']) p on conflict do nothing;
end $$;
select seed_role_permissions(id) from workspaces;

-- ===== Announcements to everyone (notifications admin) =====
create or replace function broadcast_notification(ws uuid, p_title text, p_body text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not has_permission(ws, 'notifications.broadcast') then raise exception 'Not allowed'; end if;
  if coalesce(trim(p_title), '') = '' or length(p_title) > 120 or length(coalesce(p_body, '')) > 1000 then raise exception 'Invalid announcement'; end if;
  insert into notifications(user_id, type, title, body, entity_type)
  select m.user_id, 'announcement', trim(p_title), nullif(trim(p_body), ''), 'announcement'
  from workspace_members m where m.workspace_id = ws and m.active and m.user_id <> auth.uid();
  get diagnostics n = row_count;
  insert into activity_logs(workspace_id, actor_id, action, entity_type, meta)
  values (ws, auth.uid(), 'announcement_sent', 'announcement', jsonb_build_object('title', trim(p_title)));
  return n;
end $$;

-- ===== Linked external projects (Office / Instagram / YouTube): status only, never secrets =====
create or replace function project_link_status(ws uuid) returns table(provider text, status text, account_label text, last_sync_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.provider, i.status, i.account_label, i.last_sync_at from integrations i
  where i.workspace_id = ws and i.provider in ('office', 'instagram', 'youtube')
    and (has_permission(ws, 'automations.manage') or has_permission(ws, 'integrations.manage'))
$$;

-- ===== Privilege hardening =====
-- Nothing in this schema is meant for unauthenticated callers.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
-- Server-only functions: never callable from a browser session
revoke execute on function set_integration_secret(uuid, text), get_integration_secret(uuid),
  delete_integration_secret(uuid), rate_limit_hit(text, int, int) from authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public revoke all on tables from anon;

do $$ begin
  execute 'drop policy if exists mfa_gate on public.rate_limits';
  execute 'create policy mfa_gate on public.rate_limits as restrictive to authenticated using (mfa_ok())';
end $$;
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

-- ===== 0009_home_repair.sql =====
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

-- ===== 0010_auth_hardening.sql =====
-- 0010: a deactivated member must lose access to chats too (in_conversation previously ignored workspace_members.active).
-- Re-runnable. No tables change; policies keep using the same function name.
create or replace function in_conversation(cid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from conversation_members cm
      join conversations c on c.id = cm.conversation_id
      join workspace_members m on m.workspace_id = c.workspace_id and m.user_id = cm.user_id and m.active
    where cm.conversation_id = cid and cm.user_id = auth.uid()) $$;
grant execute on function in_conversation(uuid) to authenticated, service_role;
notify pgrst, 'reload schema';

-- ===== 0011_single_owner.sql =====
-- 0011: ONE owner email (and optional password) chosen by you.
-- EDIT the two values in section 1 (and section 2 if you want the password created here), then run. Re-runnable.
--
-- Rule after this migration:
--   * The first account of a brand-new workspace can ONLY be the owner email below. Any other Gmail is rejected.
--   * Every other person needs an invite (authorized_emails) created by the owner inside Workspace > Team.

-- 1) Owner email -------------------------------------------------------------------------------
create table if not exists app_owner (
  id int primary key default 1 check (id = 1),
  email text not null check (email = lower(email) and position('@' in email) > 1)
);
alter table app_owner enable row level security;       -- no policies: only the server / SQL editor can read it
revoke all on app_owner from anon, authenticated;
insert into app_owner(id, email) values (1, lower('CHANGE_ME@gmail.com'))      -- <<< YOUR owner email
on conflict (id) do update set email = excluded.email
where app_owner.email = 'change_me@gmail.com';          -- never overwrite a real email by accident

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare a authorized_emails%rowtype; ws uuid; oe text;
begin
  if not exists (select 1 from workspaces) then
    select email into oe from app_owner where id = 1;
    if oe is null or oe = 'change_me@gmail.com' then
      raise exception 'Owner email not set. Edit app_owner (migration 0011) first';
    end if;
    if lower(new.email) <> oe then raise exception 'Email not authorized for this workspace'; end if;
    insert into workspaces(name, owner_id) values ('Lexon Workspace', new.id) returning id into ws;
    insert into profiles(id, full_name, avatar_url)
      values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.raw_user_meta_data->>'avatar_url');
    insert into profile_private(profile_id, email) values (new.id, new.email);
    insert into workspace_members(workspace_id, user_id, role) values (ws, new.id, 'owner');
    return new;
  end if;
  select * into a from authorized_emails where lower(email) = lower(new.email) limit 1;
  if not found then raise exception 'Email not authorized for this workspace'; end if;
  insert into profiles(id, full_name, avatar_url, job_title, department)
    values (new.id, coalesce(nullif(a.full_name,''), new.raw_user_meta_data->>'full_name', ''),
            new.raw_user_meta_data->>'avatar_url', a.job_title, a.department);
  insert into profile_private(profile_id, email, phone) values (new.id, new.email, a.phone);
  insert into workspace_members(workspace_id, user_id, role) values (a.workspace_id, new.id, a.role);
  return new;
end $$;

-- 2) OPTIONAL: create the owner login with a password right here ----------------------------------
-- Leave v_password empty ('') to skip: then sign in with Google, or create the user in
-- Dashboard > Authentication > Users > Add user (tick "Auto confirm"). The password is stored only as a bcrypt hash.
do $$
declare
  v_password text := '';                                -- <<< YOUR password, minimum 8 characters, or '' to skip
  v_email text; v_id uuid := gen_random_uuid();
begin
  if v_password = '' then raise notice 'Owner password step skipped'; return; end if;
  if length(v_password) < 8 then raise exception 'Password must be at least 8 characters'; end if;
  select email into v_email from app_owner where id = 1;
  if v_email is null or v_email = 'change_me@gmail.com' then raise exception 'Set the owner email in section 1 first'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then raise notice 'Owner user already exists, password unchanged'; return; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change, email_change_token_new)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
          extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
          'email', now(), now(), now());
  raise notice 'Owner created: %', v_email;
end $$;
notify pgrst, 'reload schema';


-- ===== 0012_secure_invites_permissions.sql (v5) =====
-- 0012: LEXON v5 security + Team access.  Safe to re-run (idempotent). Never deletes business data.
--   A. Email-bound invitation CODES  (hashed, expiring, attempt-limited, one code per invitation)
--   B. Per-member grantable permissions (Office access etc.) + my_permissions()
--   C. Resource-level access: members see only THEIR projects, chat attachments only inside their chats
--   D. Hole fixes: a row can no longer be "moved" into another conversation, tasks/attendance tamper guards
--   E. Realtime Authorization (private channels for chat + calls)
--   F. Personal links (member_links) + my_performance() for the Team app
-- Run on the SHARED Workspace + Team Supabase project (Project A) only.

-- =====================================================================================================
-- A. INVITATIONS
-- =====================================================================================================
create table if not exists team_invites (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  email         text not null check (email = lower(email)),
  full_name     text, phone text, job_title text, department text,
  code_hash     text not null,                       -- bcrypt of the normalised code. The code itself is NEVER stored.
  code_mode     text not null default 'random' check (code_mode in ('random','custom')),
  status        text not null default 'pending' check (status in ('pending','accepted','revoked','expired','locked')),
  expires_at    timestamptz not null,
  max_attempts  int  not null default 5 check (max_attempts between 3 and 10),
  attempts      int  not null default 0,
  last_attempt_at timestamptz,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz, accepted_user uuid references auth.users(id) on delete set null,
  revoked_at    timestamptz
);
-- at most ONE live invitation per person per workspace
create unique index if not exists team_invites_one_pending on team_invites(workspace_id, email) where status = 'pending';
create index if not exists team_invites_lookup on team_invites(email, status);
alter table team_invites enable row level security;        -- no policies: browsers can never read hashes; only RPCs / service role
revoke all on team_invites from anon, authenticated;

create or replace function invite_create(
  p_ws uuid, p_email text, p_name text, p_phone text, p_title text, p_dept text,
  p_code text, p_mode text, p_ttl_minutes int, p_max_attempts int, p_by uuid) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare em text := lower(trim(p_email)); norm text := upper(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9]', '', 'g')); iid uuid; ae authorized_emails%rowtype;
begin
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address'; end if;
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_by and active and role::text in ('owner','admin')) then
    raise exception 'Only an Admin can invite members';
  end if;
  if p_mode not in ('random','custom') then raise exception 'Invalid code mode'; end if;
  if length(norm) < 6 or length(norm) > 32 then raise exception 'Code must be 6 to 32 letters or digits'; end if;
  if (select count(distinct c) from regexp_split_to_table(norm, '') c) < 3 then raise exception 'Code is too simple. Use at least 3 different characters'; end if;
  if p_ttl_minutes < 5 or p_ttl_minutes > 10080 then raise exception 'Expiry must be between 5 minutes and 7 days'; end if;
  if p_max_attempts < 3 or p_max_attempts > 10 then raise exception 'Attempt limit must be between 3 and 10'; end if;
  if exists (select 1 from workspace_members m join auth.users u on u.id = m.user_id where m.workspace_id = p_ws and lower(u.email) = em) then
    raise exception 'This person is already a member. Reactivate or manage them from the Team page';
  end if;
  select * into ae from authorized_emails where workspace_id = p_ws and lower(email) = em;
  if found and ae.role::text in ('owner','admin') then raise exception 'This email belongs to an Admin'; end if;

  update team_invites set status = 'revoked', revoked_at = now() where workspace_id = p_ws and email = em and status = 'pending';
  insert into authorized_emails(workspace_id, email, role, full_name, phone, job_title, department, invited_by, invited_at)
  values (p_ws, em, 'member', nullif(trim(p_name),''), nullif(trim(p_phone),''), nullif(trim(p_title),''), nullif(trim(p_dept),''), p_by, now())
  on conflict (workspace_id, email) do update set full_name = excluded.full_name, phone = excluded.phone,
    job_title = excluded.job_title, department = excluded.department, invited_by = excluded.invited_by, invited_at = now();
  insert into team_invites(workspace_id, email, full_name, phone, job_title, department, code_hash, code_mode, expires_at, max_attempts, created_by)
  values (p_ws, em, nullif(trim(p_name),''), nullif(trim(p_phone),''), nullif(trim(p_title),''), nullif(trim(p_dept),''),
          extensions.crypt(norm, extensions.gen_salt('bf', 8)), p_mode, now() + make_interval(mins => p_ttl_minutes), p_max_attempts, p_by)
  returning id into iid;
  insert into activity_logs(workspace_id, actor_id, action, entity_type, entity_id, meta)
  values (p_ws, p_by, 'invite_created', 'invite', iid, jsonb_build_object('title', coalesce(nullif(trim(p_name),''), em)));
  return iid;
end $$;

-- Verifies a code. Counts every wrong attempt atomically (row lock), locks the invitation at the limit.
create or replace function invite_verify(p_email text, p_code text)
returns table(result text, o_invite uuid, o_ws uuid, o_name text, o_left int)
language plpgsql security definer set search_path = public, extensions as $$
declare i team_invites%rowtype; norm text := upper(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9]', '', 'g')); n int;
begin
  select * into i from team_invites t where t.email = lower(trim(p_email)) and t.status = 'pending' order by t.created_at desc limit 1 for update;
  if not found then return query select 'none'::text, null::uuid, null::uuid, null::text, 0; return; end if;
  if i.expires_at <= now() then
    update team_invites set status = 'expired' where id = i.id;
    return query select 'expired'::text, i.id, i.workspace_id, null::text, 0; return;
  end if;
  if length(norm) >= 6 and i.code_hash = extensions.crypt(norm, i.code_hash) then
    update team_invites set status = 'accepted', accepted_at = now(), last_attempt_at = now() where id = i.id;
    return query select 'ok'::text, i.id, i.workspace_id, i.full_name, i.max_attempts - i.attempts; return;
  end if;
  n := i.attempts + 1;
  update team_invites set attempts = n, last_attempt_at = now(), status = case when n >= i.max_attempts then 'locked' else 'pending' end where id = i.id;
  if n >= i.max_attempts and i.created_by is not null then
    insert into notifications(user_id, type, title, body, entity_type, entity_id)
    values (i.created_by, 'invite_locked', 'Invitation locked', coalesce(i.full_name, i.email) || ' entered a wrong code too many times. Issue a new code from Team > Invites.', 'invite', i.id);
  end if;
  return query select case when n >= i.max_attempts then 'locked' else 'invalid' end::text, i.id, i.workspace_id, null::text, greatest(i.max_attempts - n, 0);
end $$;

-- If account creation fails after a correct code, give the invitation back (attempts unchanged).
create or replace function invite_reopen(p_id uuid) returns void language sql security definer set search_path = public as $$
  update team_invites set status = 'pending', accepted_at = null where id = p_id and status = 'accepted' and accepted_user is null and expires_at > now() $$;
create or replace function invite_mark_user(p_id uuid, p_user uuid) returns void language sql security definer set search_path = public as $$
  update team_invites set accepted_user = p_user where id = p_id $$;

create or replace function invite_revoke(p_ws uuid, p_email text, p_by uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
declare em text := lower(trim(p_email));
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_by and active and role::text in ('owner','admin')) then raise exception 'Not allowed'; end if;
  if exists (select 1 from workspace_members m join auth.users u on u.id = m.user_id where m.workspace_id = p_ws and lower(u.email) = em) then
    raise exception 'This person already joined. Deactivate them from their profile instead';
  end if;
  update team_invites set status = 'revoked', revoked_at = now() where workspace_id = p_ws and email = em and status = 'pending';
  delete from authorized_emails where workspace_id = p_ws and lower(email) = em and role::text = 'member';
end $$;

-- Is this email allowed in? (used by the Team sign-in function, service role only)
create or replace function team_gate(p_email text) returns text
language sql security definer stable set search_path = public, auth as $$
  select case
    when exists (select 1 from workspace_members m join auth.users u on u.id = m.user_id where lower(u.email) = lower(trim(p_email)) and m.active) then 'member'
    when exists (select 1 from team_invites t where t.email = lower(trim(p_email)) and t.status = 'pending' and t.expires_at > now()) then 'invited'
    else 'denied' end $$;

-- Admin view of invitations (never returns hashes). Replaces the older list_invites().
drop function if exists list_invites(uuid);
create or replace function list_invites(ws uuid)
returns table(email text, full_name text, phone text, invited_at timestamptz, status text, last_sign_in_at timestamptz,
              expires_at timestamptz, attempts int, max_attempts int, code_mode text)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not has_permission(ws, 'team.invite') then raise exception 'Not allowed'; end if;
  return query
    with latest as (select distinct on (t.email) t.* from team_invites t where t.workspace_id = ws order by t.email, t.created_at desc)
    select a.email, coalesce(l.full_name, a.full_name), coalesce(l.phone, a.phone), coalesce(l.created_at, a.invited_at),
           case when u.last_sign_in_at is not null and exists (select 1 from workspace_members m where m.workspace_id = ws and m.user_id = u.id) then 'joined'
                when l.status = 'pending' and l.expires_at <= now() then 'expired'
                when l.status = 'revoked' then 'revoked'
                when l.status = 'accepted' then 'pending'
                when l.status is not null then l.status
                else 'not_registered' end,
           u.last_sign_in_at, l.expires_at, coalesce(l.attempts, 0), l.max_attempts, l.code_mode
    from authorized_emails a
    left join latest l on l.email = lower(a.email)
    left join auth.users u on lower(u.email) = lower(a.email)
    where a.workspace_id = ws and a.role::text = 'member'
    order by coalesce(l.created_at, a.invited_at) desc;
end $$;

-- =====================================================================================================
-- B. GRANTABLE PERMISSIONS  (Admin / Owner always have everything; Team Members get only what an Admin grants)
-- =====================================================================================================
create table if not exists user_permissions (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  permission   text not null,
  granted_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id, permission)
);
alter table user_permissions enable row level security;
drop policy if exists up_read on user_permissions;
create policy up_read on user_permissions for select using (user_id = auth.uid() or is_admin(workspace_id));   -- writes only through set_user_permission()
drop policy if exists mfa_gate on user_permissions;
create policy mfa_gate on user_permissions as restrictive to authenticated using (mfa_ok());

create or replace function grantable_permissions() returns text[] language sql immutable as $$
  select array['office.access','office.edit','tasks.create','tasks.edit','projects.manage','files.delete'] $$;
create or replace function all_permissions() returns text[] language sql immutable as $$
  select grantable_permissions() || array['team.view_private','team.edit','team.rate','team.invite','team.view_attendance',
    'integrations.manage','automations.manage','agents.manage','notifications.broadcast'] $$;

create or replace function has_permission(ws uuid, perm text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.active
      and (m.role::text in ('owner','admin')
           or exists (select 1 from role_permissions rp where rp.workspace_id = ws and rp.role = m.role and rp.permission = perm)
           or exists (select 1 from user_permissions up where up.workspace_id = ws and up.user_id = m.user_id and up.permission = perm))) $$;

create or replace function my_permissions(ws uuid) returns text[]
language sql security definer stable set search_path = public as $$
  select case
    when is_admin(ws) then all_permissions()
    when is_member(ws) then coalesce((select array_agg(distinct p) from (
        select rp.permission p from role_permissions rp join workspace_members m on m.workspace_id = rp.workspace_id and m.role = rp.role
          where m.workspace_id = ws and m.user_id = auth.uid()
        union select up.permission from user_permissions up where up.workspace_id = ws and up.user_id = auth.uid()) x), '{}')
    else '{}'::text[] end $$;

create or replace function set_user_permission(ws uuid, target uuid, perm text, granted boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(ws) then raise exception 'Only an Admin can change permissions'; end if;
  if not (perm = any(grantable_permissions())) then raise exception 'Unknown permission'; end if;
  if not exists (select 1 from workspace_members where workspace_id = ws and user_id = target and active and role::text = 'member') then
    raise exception 'Permissions can only be set for active Team Members (Admins already have everything)';
  end if;
  if granted then
    insert into user_permissions(workspace_id, user_id, permission, granted_by) values (ws, target, perm, auth.uid()) on conflict do nothing;
  else
    delete from user_permissions where workspace_id = ws and user_id = target and permission = perm;
  end if;
  insert into activity_logs(workspace_id, actor_id, action, entity_type, entity_id, meta)
  values (ws, auth.uid(), case when granted then 'permission_granted' else 'permission_revoked' end, 'member', target, jsonb_build_object('title', perm));
end $$;

-- =====================================================================================================
-- C. RESOURCE-LEVEL ACCESS
-- =====================================================================================================
-- Members see only projects they belong to or have a task in. Admins see all. VOLATILE so INSERT ... RETURNING works.
create or replace function can_see_project(pid uuid) returns boolean
language sql security definer volatile set search_path = public as $$
  select exists (select 1 from projects p where p.id = pid and is_member(p.workspace_id) and (
      is_admin(p.workspace_id)
      or exists (select 1 from project_members pm where pm.project_id = p.id and pm.user_id = auth.uid())
      or exists (select 1 from tasks t join task_assignees a on a.task_id = t.id where t.project_id = p.id and a.user_id = auth.uid()))) $$;
drop policy if exists projects_read on projects;
create policy projects_read on projects for select using (can_see_project(id));
drop policy if exists pm_read on project_members;
create policy pm_read on project_members for select using (user_id = auth.uid() or can_see_project(project_id));

-- Chat attachments are visible only to people inside that conversation (table AND storage).
drop policy if exists files_read on files;
create policy files_read on files for select using (
  is_member(workspace_id) and (source <> 'chat' or uploaded_by = auth.uid()
    or exists (select 1 from messages m where m.file_id = files.id and in_conversation(m.conversation_id))));

create or replace function chat_path_ok(p_name text) returns boolean
language sql security definer stable set search_path = public, storage as $$
  select case
    when (storage.foldername(p_name))[2] = 'chat' then
      (storage.foldername(p_name))[3] ~ '^[0-9a-fA-F-]{36}$' and in_conversation(((storage.foldername(p_name))[3])::uuid)
    else true end $$;
drop policy if exists "ws files read" on storage.objects;
create policy "ws files read" on storage.objects for select to authenticated using (
  bucket_id = 'workspace-files' and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and is_member(((storage.foldername(name))[1])::uuid) and chat_path_ok(name));
drop policy if exists "ws files write" on storage.objects;
create policy "ws files write" on storage.objects for insert to authenticated with check (
  bucket_id = 'workspace-files' and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and is_member(((storage.foldername(name))[1])::uuid) and chat_path_ok(name));

-- A conversation can only be created through start_direct()/create_group() (security definer), never by a raw insert.
drop policy if exists conv_create on conversations;

-- =====================================================================================================
-- D. HOLE FIXES  (guards that make "direct API request" tampering impossible)
-- =====================================================================================================
-- Messages: identity columns are immutable (never move or re-attribute a message); only the sender changes body/edited_at/deleted_at.
-- Reactions change through toggle_reaction() (security definer, any chat member).
create or replace function guard_message_update() returns trigger language plpgsql as $$
begin
  if auth.uid() is null then return new; end if;
  if (new.id, new.conversation_id, new.sender_id, new.file_id, new.reply_to, new.created_at)
     is distinct from (old.id, old.conversation_id, old.sender_id, old.file_id, old.reply_to, old.created_at) then
    raise exception 'Messages cannot be moved or re-attributed';
  end if;
  if (new.body, new.edited_at, new.deleted_at) is distinct from (old.body, old.edited_at, old.deleted_at) and old.sender_id <> auth.uid() then
    raise exception 'Only the sender can edit a message';
  end if;
  return new;
end $$;
drop trigger if exists t_guard_message on messages;
create trigger t_guard_message before update on messages for each row execute function guard_message_update();

-- Conversation membership rows: only pinned / last_read_at may change (stops "moving" yourself into another chat).
create or replace function guard_cm_update() returns trigger language plpgsql as $$
begin
  if auth.uid() is null then return new; end if;
  if (new.conversation_id, new.user_id) is distinct from (old.conversation_id, old.user_id) then raise exception 'Membership cannot be changed'; end if;
  return new;
end $$;
drop trigger if exists t_guard_cm on conversation_members;
create trigger t_guard_cm before update on conversation_members for each row execute function guard_cm_update();
drop policy if exists cm_self on conversation_members;
create policy cm_self on conversation_members for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Messages: replying must stay inside the same conversation.
create or replace function guard_message_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.reply_to is not null and not exists (select 1 from messages r where r.id = new.reply_to and r.conversation_id = new.conversation_id) then
    raise exception 'Invalid reply target';
  end if;
  if new.file_id is not null and not exists (select 1 from files f where f.id = new.file_id and f.uploaded_by = new.sender_id) then
    raise exception 'You can only attach files you uploaded';
  end if;
  return new;
end $$;
drop trigger if exists t_guard_message_insert on messages;
create trigger t_guard_message_insert before insert on messages for each row execute function guard_message_insert();

-- Tasks: an assignee without tasks.edit may change ONLY status and progress.
create or replace function guard_task_update() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or has_permission(old.workspace_id, 'tasks.edit') then return new; end if;
  if (new.workspace_id, new.project_id, new.title, new.description, new.priority, new.start_date, new.due_at, new.created_by)
     is distinct from (old.workspace_id, old.project_id, old.title, old.description, old.priority, old.start_date, old.due_at, old.created_by) then
    raise exception 'You can only update the status and progress of your own tasks';
  end if;
  return new;
end $$;
drop trigger if exists t_guard_task on tasks;
create trigger t_guard_task before update on tasks for each row execute function guard_task_update();

-- Attendance: members can clock in/out for themselves only, cannot rewrite or delete history.
drop policy if exists attendance_own on attendance;
drop policy if exists attendance_self_read on attendance;
drop policy if exists attendance_self_insert on attendance;
drop policy if exists attendance_self_update on attendance;
create policy attendance_self_read on attendance for select using (user_id = auth.uid());
create or replace function has_open_clock(uid uuid) returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from attendance where user_id = uid and clock_out is null) $$;
create policy attendance_self_insert on attendance for insert with check (user_id = auth.uid() and clock_out is null and not has_open_clock(auth.uid()));
create policy attendance_self_update on attendance for update using (user_id = auth.uid() and clock_out is null) with check (user_id = auth.uid());
create or replace function guard_attendance_update() returns trigger language plpgsql as $$
begin
  if auth.uid() is null then return new; end if;
  if (new.id, new.user_id, new.clock_in) is distinct from (old.id, old.user_id, old.clock_in) then raise exception 'Attendance history cannot be edited'; end if;
  return new;
end $$;
drop trigger if exists t_guard_attendance on attendance;
create trigger t_guard_attendance before update on attendance for each row execute function guard_attendance_update();

-- Notifications: users may only mark their own as read (not rewrite the text).
create or replace function guard_notification_update() returns trigger language plpgsql as $$
begin
  if auth.uid() is null then return new; end if;
  if (new.id, new.user_id, new.type, new.title, new.body, new.entity_type, new.entity_id, new.created_at)
     is distinct from (old.id, old.user_id, old.type, old.title, old.body, old.entity_type, old.entity_id, old.created_at) then
    raise exception 'Notifications can only be marked as read';
  end if;
  return new;
end $$;
drop trigger if exists t_guard_notification on notifications;
create trigger t_guard_notification before update on notifications for each row execute function guard_notification_update();

-- =====================================================================================================
-- E. REALTIME AUTHORIZATION  (private channels: chat:<conversation>, call:<call>, incoming:<user>)
-- =====================================================================================================
create or replace function rt_topic_ok(topic text) returns boolean
language sql security definer stable set search_path = public as $$
  select case
    when topic ~ '^chat:[0-9a-fA-F-]{36}$'     then in_conversation(substr(topic, 6)::uuid)
    when topic ~ '^call:[0-9a-fA-F-]{36}$'     then exists (select 1 from call_sessions c where c.id = substr(topic, 6)::uuid and auth.uid() in (c.caller_id, c.callee_id))
    when topic ~ '^incoming:[0-9a-fA-F-]{36}$' then substr(topic, 10)::uuid = auth.uid()
    else false end $$;
do $$ begin
  if to_regclass('realtime.messages') is not null then
    execute 'alter table realtime.messages enable row level security';
    execute 'drop policy if exists lexon_rt_read on realtime.messages';
    execute 'drop policy if exists lexon_rt_write on realtime.messages';
    execute 'create policy lexon_rt_read on realtime.messages for select to authenticated using (public.rt_topic_ok(realtime.topic()))';
    execute 'create policy lexon_rt_write on realtime.messages for insert to authenticated with check (public.rt_topic_ok(realtime.topic()))';
  else raise notice 'realtime.messages not found: enable Realtime in the Supabase dashboard, then re-run this section';
  end if;
exception when others then raise notice 'Realtime policies skipped: %', sqlerrm;
end $$;

-- =====================================================================================================
-- F. TEAM APP: personal links + personal performance
-- =====================================================================================================
create table if not exists member_links (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  label        text not null check (char_length(label) between 1 and 60),
  url          text not null check (url ~* '^https://[^\s]+$' and char_length(url) <= 600),
  created_by   uuid references profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists member_links_user on member_links(user_id);
alter table member_links enable row level security;
drop policy if exists ml_read on member_links;
drop policy if exists ml_insert on member_links;
drop policy if exists ml_delete on member_links;
create policy ml_read   on member_links for select using (user_id = auth.uid() or is_admin(workspace_id));
create policy ml_insert on member_links for insert with check (is_member(workspace_id) and (user_id = auth.uid() or is_admin(workspace_id))
  and exists (select 1 from workspace_members m where m.workspace_id = member_links.workspace_id and m.user_id = member_links.user_id and m.active));
create policy ml_delete on member_links for delete using (user_id = auth.uid() or is_admin(workspace_id));
drop policy if exists mfa_gate on member_links;
create policy mfa_gate on member_links as restrictive to authenticated using (mfa_ok());

-- Runs with the caller's rights (security invoker): RLS decides what is counted.
create or replace function my_performance(ws uuid) returns jsonb
language sql stable security invoker set search_path = public as $$
  with mine as (select t.* from tasks t join task_assignees a on a.task_id = t.id where a.user_id = auth.uid() and t.workspace_id = ws)
  select jsonb_build_object(
    'total',     (select count(*) from mine),
    'done',      (select count(*) from mine where status = 'done'),
    'in_progress',(select count(*) from mine where status in ('in_progress','review')),
    'overdue',   (select count(*) from mine where status <> 'done' and due_at is not null and due_at < now()),
    'avg_progress', coalesce((select round(avg(progress)) from mine where status <> 'done'), 0),
    'rating',    (select rating from profiles where id = auth.uid()),
    'hours_7d',  coalesce((select round(sum(extract(epoch from (coalesce(clock_out, now()) - clock_in))) / 3600.0, 1) from attendance where user_id = auth.uid() and clock_in > now() - interval '7 days'), 0),
    'done_by_week', coalesce((select jsonb_agg(jsonb_build_object('week', w, 'done', c) order by w) from (
        select date_trunc('week', t.updated_at)::date w, count(*) c from mine t where t.status = 'done' and t.updated_at > now() - interval '8 weeks' group by 1) q), '[]'::jsonb)
  ) $$;

-- =====================================================================================================
-- G. 2FA gate + privileges for the new objects
-- =====================================================================================================
do $$ begin
  execute 'drop policy if exists mfa_gate on public.team_invites';
  execute 'create policy mfa_gate on public.team_invites as restrictive to authenticated using (mfa_ok())';
end $$;

revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated, service_role;
-- server-only: never callable from a browser session
revoke execute on function set_integration_secret(uuid, text), get_integration_secret(uuid), delete_integration_secret(uuid),
  rate_limit_hit(text, int, int), auth_user_info(text),
  invite_create(uuid, text, text, text, text, text, text, text, int, int, uuid), invite_verify(text, text), invite_reopen(uuid),
  invite_mark_user(uuid, uuid), invite_revoke(uuid, text, uuid), team_gate(text) from authenticated;
grant execute on function invite_create(uuid, text, text, text, text, text, text, text, int, int, uuid), invite_verify(text, text), invite_reopen(uuid),
  invite_mark_user(uuid, uuid), invite_revoke(uuid, text, uuid), team_gate(text) to service_role;
-- realtime policy helpers must be callable by signed-in users
grant execute on function rt_topic_ok(text), chat_path_ok(text) to authenticated, service_role;

insert into retention_settings(id) values (1) on conflict do nothing;
notify pgrst, 'reload schema';


-- ===== 0012_secure_invites_permissions.sql (v5) =====
-- 0012: LEXON v5 security + Team access.  Safe to re-run (idempotent). Never deletes business data.
--   A. Email-bound invitation CODES  (hashed, expiring, attempt-limited, one code per invitation)
--   B. Per-member grantable permissions (Office access etc.) + my_permissions()
--   C. Resource-level access: members see only THEIR projects, chat attachments only inside their chats
--   D. Hole fixes: a row can no longer be "moved" into another conversation, tasks/attendance tamper guards
--   E. Realtime Authorization (private channels for chat + calls)
--   F. Personal links (member_links) + my_performance() for the Team app
-- Run on the SHARED Workspace + Team Supabase project (Project A) only.

-- =====================================================================================================
-- A. INVITATIONS
-- =====================================================================================================
create table if not exists team_invites (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  email         text not null check (email = lower(email)),
  full_name     text, phone text, job_title text, department text,
  code_hash     text not null,                       -- bcrypt of the normalised code. The code itself is NEVER stored.
  code_mode     text not null default 'random' check (code_mode in ('random','custom')),
  status        text not null default 'pending' check (status in ('pending','accepted','revoked','expired','locked')),
  expires_at    timestamptz not null,
  max_attempts  int  not null default 5 check (max_attempts between 3 and 10),
  attempts      int  not null default 0,
  last_attempt_at timestamptz,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz, accepted_user uuid references auth.users(id) on delete set null,
  revoked_at    timestamptz
);
-- at most ONE live invitation per person per workspace
create unique index if not exists team_invites_one_pending on team_invites(workspace_id, email) where status = 'pending';
create index if not exists team_invites_lookup on team_invites(email, status);
alter table team_invites enable row level security;        -- no policies: browsers can never read hashes; only RPCs / service role
revoke all on team_invites from anon, authenticated;

create or replace function invite_create(
  p_ws uuid, p_email text, p_name text, p_phone text, p_title text, p_dept text,
  p_code text, p_mode text, p_ttl_minutes int, p_max_attempts int, p_by uuid) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare em text := lower(trim(p_email)); norm text := upper(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9]', '', 'g')); iid uuid; ae authorized_emails%rowtype;
begin
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address'; end if;
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_by and active and role::text in ('owner','admin')) then
    raise exception 'Only an Admin can invite members';
  end if;
  if p_mode not in ('random','custom') then raise exception 'Invalid code mode'; end if;
  if length(norm) < 6 or length(norm) > 32 then raise exception 'Code must be 6 to 32 letters or digits'; end if;
  if (select count(distinct c) from regexp_split_to_table(norm, '') c) < 3 then raise exception 'Code is too simple. Use at least 3 different characters'; end if;
  if p_ttl_minutes < 5 or p_ttl_minutes > 10080 then raise exception 'Expiry must be between 5 minutes and 7 days'; end if;
  if p_max_attempts < 3 or p_max_attempts > 10 then raise exception 'Attempt limit must be between 3 and 10'; end if;
  if exists (select 1 from workspace_members m join auth.users u on u.id = m.user_id where m.workspace_id = p_ws and lower(u.email) = em) then
    raise exception 'This person is already a member. Reactivate or manage them from the Team page';
  end if;
  select * into ae from authorized_emails where workspace_id = p_ws and lower(email) = em;
  if found and ae.role::text in ('owner','admin') then raise exception 'This email belongs to an Admin'; end if;

  update team_invites set status = 'revoked', revoked_at = now() where workspace_id = p_ws and email = em and status = 'pending';
  insert into authorized_emails(workspace_id, email, role, full_name, phone, job_title, department, invited_by, invited_at)
  values (p_ws, em, 'member', nullif(trim(p_name),''), nullif(trim(p_phone),''), nullif(trim(p_title),''), nullif(trim(p_dept),''), p_by, now())
  on conflict (workspace_id, email) do update set full_name = excluded.full_name, phone = excluded.phone,
    job_title = excluded.job_title, department = excluded.department, invited_by = excluded.invited_by, invited_at = now();
  insert into team_invites(workspace_id, email, full_name, phone, job_title, department, code_hash, code_mode, expires_at, max_attempts, created_by)
  values (p_ws, em, nullif(trim(p_name),''), nullif(trim(p_phone),''), nullif(trim(p_title),''), nullif(trim(p_dept),''),
          extensions.crypt(norm, extensions.gen_salt('bf', 8)), p_mode, now() + make_interval(mins => p_ttl_minutes), p_max_attempts, p_by)
  returning id into iid;
  insert into activity_logs(workspace_id, actor_id, action, entity_type, entity_id, meta)
  values (p_ws, p_by, 'invite_created', 'invite', iid, jsonb_build_object('title', coalesce(nullif(trim(p_name),''), em)));
  return iid;
end $$;

-- Verifies a code. Counts every wrong attempt atomically (row lock), locks the invitation at the limit.
create or replace function invite_verify(p_email text, p_code text)
returns table(result text, o_invite uuid, o_ws uuid, o_name text, o_left int)
language plpgsql security definer set search_path = public, extensions as $$
declare i team_invites%rowtype; norm text := upper(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9]', '', 'g')); n int;
begin
  select * into i from team_invites t where t.email = lower(trim(p_email)) and t.status = 'pending' order by t.created_at desc limit 1 for update;
  if not found then return query select 'none'::text, null::uuid, null::uuid, null::text, 0; return; end if;
  if i.expires_at <= now() then
    update team_invites set status = 'expired' where id = i.id;
    return query select 'expired'::text, i.id, i.workspace_id, null::text, 0; return;
  end if;
  if length(norm) >= 6 and i.code_hash = extensions.crypt(norm, i.code_hash) then
    update team_invites set status = 'accepted', accepted_at = now(), last_attempt_at = now() where id = i.id;
    return query select 'ok'::text, i.id, i.workspace_id, i.full_name, i.max_attempts - i.attempts; return;
  end if;
  n := i.attempts + 1;
  update team_invites set attempts = n, last_attempt_at = now(), status = case when n >= i.max_attempts then 'locked' else 'pending' end where id = i.id;
  if n >= i.max_attempts and i.created_by is not null then
    insert into notifications(user_id, type, title, body, entity_type, entity_id)
    values (i.created_by, 'invite_locked', 'Invitation locked', coalesce(i.full_name, i.email) || ' entered a wrong code too many times. Issue a new code from Team > Invites.', 'invite', i.id);
  end if;
  return query select case when n >= i.max_attempts then 'locked' else 'invalid' end::text, i.id, i.workspace_id, null::text, greatest(i.max_attempts - n, 0);
end $$;

-- If account creation fails after a correct code, give the invitation back (attempts unchanged).
create or replace function invite_reopen(p_id uuid) returns void language sql security definer set search_path = public as $$
  update team_invites set status = 'pending', accepted_at = null where id = p_id and status = 'accepted' and accepted_user is null and expires_at > now() $$;
create or replace function invite_mark_user(p_id uuid, p_user uuid) returns void language sql security definer set search_path = public as $$
  update team_invites set accepted_user = p_user where id = p_id $$;

create or replace function invite_revoke(p_ws uuid, p_email text, p_by uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
declare em text := lower(trim(p_email));
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_by and active and role::text in ('owner','admin')) then raise exception 'Not allowed'; end if;
  if exists (select 1 from workspace_members m join auth.users u on u.id = m.user_id where m.workspace_id = p_ws and lower(u.email) = em) then
    raise exception 'This person already joined. Deactivate them from their profile instead';
  end if;
  update team_invites set status = 'revoked', revoked_at = now() where workspace_id = p_ws and email = em and status = 'pending';
  delete from authorized_emails where workspace_id = p_ws and lower(email) = em and role::text = 'member';
end $$;

-- Is this email allowed in? (used by the Team sign-in function, service role only)
create or replace function team_gate(p_email text) returns text
language sql security definer stable set search_path = public, auth as $$
  select case
    when exists (select 1 from workspace_members m join auth.users u on u.id = m.user_id where lower(u.email) = lower(trim(p_email)) and m.active) then 'member'
    when exists (select 1 from team_invites t where t.email = lower(trim(p_email)) and t.status = 'pending' and t.expires_at > now()) then 'invited'
    else 'denied' end $$;

-- Admin view of invitations (never returns hashes). Replaces the older list_invites().
drop function if exists list_invites(uuid);
create or replace function list_invites(ws uuid)
returns table(email text, full_name text, phone text, invited_at timestamptz, status text, last_sign_in_at timestamptz,
              expires_at timestamptz, attempts int, max_attempts int, code_mode text)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not has_permission(ws, 'team.invite') then raise exception 'Not allowed'; end if;
  return query
    with latest as (select distinct on (t.email) t.* from team_invites t where t.workspace_id = ws order by t.email, t.created_at desc)
    select a.email, coalesce(l.full_name, a.full_name), coalesce(l.phone, a.phone), coalesce(l.created_at, a.invited_at),
           case when u.last_sign_in_at is not null and exists (select 1 from workspace_members m where m.workspace_id = ws and m.user_id = u.id) then 'joined'
                when l.status = 'pending' and l.expires_at <= now() then 'expired'
                when l.status = 'revoked' then 'revoked'
                when l.status = 'accepted' then 'pending'
                when l.status is not null then l.status
                else 'not_registered' end,
           u.last_sign_in_at, l.expires_at, coalesce(l.attempts, 0), l.max_attempts, l.code_mode
    from authorized_emails a
    left join latest l on l.email = lower(a.email)
    left join auth.users u on lower(u.email) = lower(a.email)
    where a.workspace_id = ws and a.role::text = 'member'
    order by coalesce(l.created_at, a.invited_at) desc;
end $$;

-- =====================================================================================================
-- B. GRANTABLE PERMISSIONS  (Admin / Owner always have everything; Team Members get only what an Admin grants)
-- =====================================================================================================
create table if not exists user_permissions (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  permission   text not null,
  granted_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id, permission)
);
alter table user_permissions enable row level security;
drop policy if exists up_read on user_permissions;
create policy up_read on user_permissions for select using (user_id = auth.uid() or is_admin(workspace_id));   -- writes only through set_user_permission()
drop policy if exists mfa_gate on user_permissions;
create policy mfa_gate on user_permissions as restrictive to authenticated using (mfa_ok());

create or replace function grantable_permissions() returns text[] language sql immutable as $$
  select array['office.access','office.edit','tasks.create','tasks.edit','projects.manage','files.delete'] $$;
create or replace function all_permissions() returns text[] language sql immutable as $$
  select grantable_permissions() || array['team.view_private','team.edit','team.rate','team.invite','team.view_attendance',
    'integrations.manage','automations.manage','agents.manage','notifications.broadcast'] $$;

create or replace function has_permission(ws uuid, perm text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.active
      and (m.role::text in ('owner','admin')
           or exists (select 1 from role_permissions rp where rp.workspace_id = ws and rp.role = m.role and rp.permission = perm)
           or exists (select 1 from user_permissions up where up.workspace_id = ws and up.user_id = m.user_id and up.permission = perm))) $$;

create or replace function my_permissions(ws uuid) returns text[]
language sql security definer stable set search_path = public as $$
  select case
    when is_admin(ws) then all_permissions()
    when is_member(ws) then coalesce((select array_agg(distinct p) from (
        select rp.permission p from role_permissions rp join workspace_members m on m.workspace_id = rp.workspace_id and m.role = rp.role
          where m.workspace_id = ws and m.user_id = auth.uid()
        union select up.permission from user_permissions up where up.workspace_id = ws and up.user_id = auth.uid()) x), '{}')
    else '{}'::text[] end $$;

create or replace function set_user_permission(ws uuid, target uuid, perm text, granted boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(ws) then raise exception 'Only an Admin can change permissions'; end if;
  if not (perm = any(grantable_permissions())) then raise exception 'Unknown permission'; end if;
  if not exists (select 1 from workspace_members where workspace_id = ws and user_id = target and active and role::text = 'member') then
    raise exception 'Permissions can only be set for active Team Members (Admins already have everything)';
  end if;
  if granted then
    insert into user_permissions(workspace_id, user_id, permission, granted_by) values (ws, target, perm, auth.uid()) on conflict do nothing;
  else
    delete from user_permissions where workspace_id = ws and user_id = target and permission = perm;
  end if;
  insert into activity_logs(workspace_id, actor_id, action, entity_type, entity_id, meta)
  values (ws, auth.uid(), case when granted then 'permission_granted' else 'permission_revoked' end, 'member', target, jsonb_build_object('title', perm));
end $$;

-- =====================================================================================================
-- C. RESOURCE-LEVEL ACCESS
-- =====================================================================================================
-- Members see only projects they belong to or have a task in. Admins see all. VOLATILE so INSERT ... RETURNING works.
create or replace function can_see_project(pid uuid) returns boolean
language sql security definer volatile set search_path = public as $$
  select exists (select 1 from projects p where p.id = pid and is_member(p.workspace_id) and (
      is_admin(p.workspace_id)
      or exists (select 1 from project_members pm where pm.project_id = p.id and pm.user_id = auth.uid())
      or exists (select 1 from tasks t join task_assignees a on a.task_id = t.id where t.project_id = p.id and a.user_id = auth.uid()))) $$;
drop policy if exists projects_read on projects;
create policy projects_read on projects for select using (can_see_project(id));
drop policy if exists pm_read on project_members;
create policy pm_read on project_members for select using (user_id = auth.uid() or can_see_project(project_id));

-- Chat attachments are visible only to people inside that conversation (table AND storage).
drop policy if exists files_read on files;
create policy files_read on files for select using (
  is_member(workspace_id) and (source <> 'chat' or uploaded_by = auth.uid()
    or exists (select 1 from messages m where m.file_id = files.id and in_conversation(m.conversation_id))));

create or replace function chat_path_ok(p_name text) returns boolean
language sql security definer stable set search_path = public, storage as $$
  select case
    when (storage.foldername(p_name))[2] = 'chat' then
      (storage.foldername(p_name))[3] ~ '^[0-9a-fA-F-]{36}$' and in_conversation(((storage.foldername(p_name))[3])::uuid)
    else true end $$;
drop policy if exists "ws files read" on storage.objects;
create policy "ws files read" on storage.objects for select to authenticated using (
  bucket_id = 'workspace-files' and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and is_member(((storage.foldername(name))[1])::uuid) and chat_path_ok(name));
drop policy if exists "ws files write" on storage.objects;
create policy "ws files write" on storage.objects for insert to authenticated with check (
  bucket_id = 'workspace-files' and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and is_member(((storage.foldername(name))[1])::uuid) and chat_path_ok(name));

-- A conversation can only be created through start_direct()/create_group() (security definer), never by a raw insert.
drop policy if exists conv_create on conversations;

-- =====================================================================================================
-- D. HOLE FIXES  (guards that make "direct API request" tampering impossible)
-- =====================================================================================================
-- Messages: identity columns are immutable (never move or re-attribute a message); only the sender changes body/edited_at/deleted_at.
-- Reactions change through toggle_reaction() (security definer, any chat member).
create or replace function guard_message_update() returns trigger language plpgsql as $$
begin
  if auth.uid() is null then return new; end if;
  if (new.id, new.conversation_id, new.sender_id, new.file_id, new.reply_to, new.created_at)
     is distinct from (old.id, old.conversation_id, old.sender_id, old.file_id, old.reply_to, old.created_at) then
    raise exception 'Messages cannot be moved or re-attributed';
  end if;
  if (new.body, new.edited_at, new.deleted_at) is distinct from (old.body, old.edited_at, old.deleted_at) and old.sender_id <> auth.uid() then
    raise exception 'Only the sender can edit a message';
  end if;
  return new;
end $$;
drop trigger if exists t_guard_message on messages;
create trigger t_guard_message before update on messages for each row execute function guard_message_update();

-- Conversation membership rows: only pinned / last_read_at may change (stops "moving" yourself into another chat).
create or replace function guard_cm_update() returns trigger language plpgsql as $$
begin
  if auth.uid() is null then return new; end if;
  if (new.conversation_id, new.user_id) is distinct from (old.conversation_id, old.user_id) then raise exception 'Membership cannot be changed'; end if;
  return new;
end $$;
drop trigger if exists t_guard_cm on conversation_members;
create trigger t_guard_cm before update on conversation_members for each row execute function guard_cm_update();
drop policy if exists cm_self on conversation_members;
create policy cm_self on conversation_members for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Messages: replying must stay inside the same conversation.
create or replace function guard_message_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.reply_to is not null and not exists (select 1 from messages r where r.id = new.reply_to and r.conversation_id = new.conversation_id) then
    raise exception 'Invalid reply target';
  end if;
  if new.file_id is not null and not exists (select 1 from files f where f.id = new.file_id and f.uploaded_by = new.sender_id) then
    raise exception 'You can only attach files you uploaded';
  end if;
  return new;
end $$;
drop trigger if exists t_guard_message_insert on messages;
create trigger t_guard_message_insert before insert on messages for each row execute function guard_message_insert();

-- Tasks: an assignee without tasks.edit may change ONLY status and progress.
create or replace function guard_task_update() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or has_permission(old.workspace_id, 'tasks.edit') then return new; end if;
  if (new.workspace_id, new.project_id, new.title, new.description, new.priority, new.start_date, new.due_at, new.created_by)
     is distinct from (old.workspace_id, old.project_id, old.title, old.description, old.priority, old.start_date, old.due_at, old.created_by) then
    raise exception 'You can only update the status and progress of your own tasks';
  end if;
  return new;
end $$;
drop trigger if exists t_guard_task on tasks;
create trigger t_guard_task before update on tasks for each row execute function guard_task_update();

-- Attendance: members can clock in/out for themselves only, cannot rewrite or delete history.
drop policy if exists attendance_own on attendance;
drop policy if exists attendance_self_read on attendance;
drop policy if exists attendance_self_insert on attendance;
drop policy if exists attendance_self_update on attendance;
create policy attendance_self_read on attendance for select using (user_id = auth.uid());
create or replace function has_open_clock(uid uuid) returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from attendance where user_id = uid and clock_out is null) $$;
create policy attendance_self_insert on attendance for insert with check (user_id = auth.uid() and clock_out is null and not has_open_clock(auth.uid()));
create policy attendance_self_update on attendance for update using (user_id = auth.uid() and clock_out is null) with check (user_id = auth.uid());
create or replace function guard_attendance_update() returns trigger language plpgsql as $$
begin
  if auth.uid() is null then return new; end if;
  if (new.id, new.user_id, new.clock_in) is distinct from (old.id, old.user_id, old.clock_in) then raise exception 'Attendance history cannot be edited'; end if;
  return new;
end $$;
drop trigger if exists t_guard_attendance on attendance;
create trigger t_guard_attendance before update on attendance for each row execute function guard_attendance_update();

-- Notifications: users may only mark their own as read (not rewrite the text).
create or replace function guard_notification_update() returns trigger language plpgsql as $$
begin
  if auth.uid() is null then return new; end if;
  if (new.id, new.user_id, new.type, new.title, new.body, new.entity_type, new.entity_id, new.created_at)
     is distinct from (old.id, old.user_id, old.type, old.title, old.body, old.entity_type, old.entity_id, old.created_at) then
    raise exception 'Notifications can only be marked as read';
  end if;
  return new;
end $$;
drop trigger if exists t_guard_notification on notifications;
create trigger t_guard_notification before update on notifications for each row execute function guard_notification_update();

-- =====================================================================================================
-- E. REALTIME AUTHORIZATION  (private channels: chat:<conversation>, call:<call>, incoming:<user>)
-- =====================================================================================================
create or replace function rt_topic_ok(topic text) returns boolean
language sql security definer stable set search_path = public as $$
  select case
    when topic ~ '^chat:[0-9a-fA-F-]{36}$'     then in_conversation(substr(topic, 6)::uuid)
    when topic ~ '^call:[0-9a-fA-F-]{36}$'     then exists (select 1 from call_sessions c where c.id = substr(topic, 6)::uuid and auth.uid() in (c.caller_id, c.callee_id))
    when topic ~ '^incoming:[0-9a-fA-F-]{36}$' then substr(topic, 10)::uuid = auth.uid()
    else false end $$;
do $$ begin
  if to_regclass('realtime.messages') is not null then
    execute 'alter table realtime.messages enable row level security';
    execute 'drop policy if exists lexon_rt_read on realtime.messages';
    execute 'drop policy if exists lexon_rt_write on realtime.messages';
    execute 'create policy lexon_rt_read on realtime.messages for select to authenticated using (public.rt_topic_ok(realtime.topic()))';
    execute 'create policy lexon_rt_write on realtime.messages for insert to authenticated with check (public.rt_topic_ok(realtime.topic()))';
  else raise notice 'realtime.messages not found: enable Realtime in the Supabase dashboard, then re-run this section';
  end if;
exception when others then raise notice 'Realtime policies skipped: %', sqlerrm;
end $$;

-- =====================================================================================================
-- F. TEAM APP: personal links + personal performance
-- =====================================================================================================
create table if not exists member_links (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  label        text not null check (char_length(label) between 1 and 60),
  url          text not null check (url ~* '^https://[^\s]+$' and char_length(url) <= 600),
  created_by   uuid references profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists member_links_user on member_links(user_id);
alter table member_links enable row level security;
drop policy if exists ml_read on member_links;
drop policy if exists ml_insert on member_links;
drop policy if exists ml_delete on member_links;
create policy ml_read   on member_links for select using (user_id = auth.uid() or is_admin(workspace_id));
create policy ml_insert on member_links for insert with check (is_member(workspace_id) and (user_id = auth.uid() or is_admin(workspace_id))
  and exists (select 1 from workspace_members m where m.workspace_id = member_links.workspace_id and m.user_id = member_links.user_id and m.active));
create policy ml_delete on member_links for delete using (user_id = auth.uid() or is_admin(workspace_id));
drop policy if exists mfa_gate on member_links;
create policy mfa_gate on member_links as restrictive to authenticated using (mfa_ok());

-- Runs with the caller's rights (security invoker): RLS decides what is counted.
create or replace function my_performance(ws uuid) returns jsonb
language sql stable security invoker set search_path = public as $$
  with mine as (select t.* from tasks t join task_assignees a on a.task_id = t.id where a.user_id = auth.uid() and t.workspace_id = ws)
  select jsonb_build_object(
    'total',     (select count(*) from mine),
    'done',      (select count(*) from mine where status = 'done'),
    'in_progress',(select count(*) from mine where status in ('in_progress','review')),
    'overdue',   (select count(*) from mine where status <> 'done' and due_at is not null and due_at < now()),
    'avg_progress', coalesce((select round(avg(progress)) from mine where status <> 'done'), 0),
    'rating',    (select rating from profiles where id = auth.uid()),
    'hours_7d',  coalesce((select round(sum(extract(epoch from (coalesce(clock_out, now()) - clock_in))) / 3600.0, 1) from attendance where user_id = auth.uid() and clock_in > now() - interval '7 days'), 0),
    'done_by_week', coalesce((select jsonb_agg(jsonb_build_object('week', w, 'done', c) order by w) from (
        select date_trunc('week', t.updated_at)::date w, count(*) c from mine t where t.status = 'done' and t.updated_at > now() - interval '8 weeks' group by 1) q), '[]'::jsonb)
  ) $$;

-- =====================================================================================================
-- G. 2FA gate + privileges for the new objects
-- =====================================================================================================
do $$ begin
  execute 'drop policy if exists mfa_gate on public.team_invites';
  execute 'create policy mfa_gate on public.team_invites as restrictive to authenticated using (mfa_ok())';
end $$;

revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated, service_role;
-- server-only: never callable from a browser session
revoke execute on function set_integration_secret(uuid, text), get_integration_secret(uuid), delete_integration_secret(uuid),
  rate_limit_hit(text, int, int), auth_user_info(text),
  invite_create(uuid, text, text, text, text, text, text, text, int, int, uuid), invite_verify(text, text), invite_reopen(uuid),
  invite_mark_user(uuid, uuid), invite_revoke(uuid, text, uuid), team_gate(text) from authenticated;
grant execute on function invite_create(uuid, text, text, text, text, text, text, text, int, int, uuid), invite_verify(text, text), invite_reopen(uuid),
  invite_mark_user(uuid, uuid), invite_revoke(uuid, text, uuid), team_gate(text) to service_role;
-- realtime policy helpers must be callable by signed-in users
grant execute on function rt_topic_ok(text), chat_path_ok(text) to authenticated, service_role;

insert into retention_settings(id) values (1) on conflict do nothing;
notify pgrst, 'reload schema';
