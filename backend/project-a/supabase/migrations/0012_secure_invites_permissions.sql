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
