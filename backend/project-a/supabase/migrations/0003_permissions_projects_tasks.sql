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
