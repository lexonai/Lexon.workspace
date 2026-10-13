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
