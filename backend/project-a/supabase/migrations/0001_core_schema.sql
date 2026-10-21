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
