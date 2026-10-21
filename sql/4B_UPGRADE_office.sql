-- 4B_UPGRADE_office.sql (v4 -> v5)   RUN ON: Supabase PROJECT B (your EXISTING Office project). Additive and re-runnable; no data is touched.
begin;
do $$ begin if to_regclass('public.people') is null then raise exception 'This is not the Office project (table people missing). Run it on Project B.'; end if; end $$;
-- ===== v5 hardening (Office = its own backend, no independent registration, one identity with Workspace) =====
create table if not exists office_meta (key text primary key, value text not null, updated_at timestamptz not null default now());
insert into office_meta(key, value) values ('schema_version', '5') on conflict (key) do update set value = '5', updated_at = now();
alter table office_meta enable row level security;       -- no policies: service role only
revoke all on office_meta from anon, authenticated;

-- ONE identity: link an Office person to the Workspace account (set by the Office server / admin, never by the browser)
alter table people add column if not exists workspace_user_id uuid unique, add column if not exists workspace_email text;

-- NO self-registration: an Auth user can only be created with app_metadata.office_role set, which only the service role / dashboard can do.
-- Also switch OFF "Allow new users to sign up" in this project's Authentication settings (defense in depth).
create or replace function office_require_role() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'office_role', '') not in ('owner', 'employee') then
    raise exception 'Office has no self-registration. People open Office from Lexon Workspace.';
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_office_only on auth.users;
create trigger on_auth_user_office_only before insert on auth.users for each row execute function office_require_role();

create or replace function office_health() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('schema_version', (select value from office_meta where key = 'schema_version'),
    'people', (select count(*) from people), 'tasks_active', (select count(*) from tasks where status = 'active'), 'rooms', (select count(*) from rooms)) $$;

-- Browsers (anon) never get anything here; signed-in users only through the RLS policies above.
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function office_health() from authenticated;
notify pgrst, 'reload schema';

commit;
