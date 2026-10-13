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
