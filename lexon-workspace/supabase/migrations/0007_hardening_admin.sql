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
