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
