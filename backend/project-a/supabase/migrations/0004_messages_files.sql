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
