-- =====================================================================================================
-- 2_OFFICE.sql   (LEXON v5)   RUN ON: Supabase PROJECT B = the SEPARATE Lexon Office project (never Project A, never Automation)
-- Fresh install: run ONCE in Project B > SQL Editor. Already on v4? Use 4B_UPGRADE_office.sql.
-- Office has no registration, login or password of its own: people reach it from Lexon Workspace (central-api > office token).
-- This database is the Office backend's own store (people, rooms, desks, tasks, handoffs, chat, calls, schedules, presence).
-- Seed demo people (optional): office/database/seed/001_seed.sql
-- =====================================================================================================
-- ===== schema/_extensions.sql =====
create extension if not exists pgcrypto;


-- ===== schema/departments.sql =====
-- departments
create table departments(id uuid primary key default gen_random_uuid(), name text not null unique);


-- ===== schema/rooms.sql =====
-- rooms
create table rooms(id uuid primary key default gen_random_uuid(), slug text unique not null, name text not null, x real, z real, w real, d real, department_id uuid references departments);


-- ===== schema/people.sql =====
-- people
create table people(id uuid primary key default gen_random_uuid(), name text not null, role text, department_id uuid references departments, manager_id uuid references people, avatar jsonb default '{}', is_owner boolean default false, created_at timestamptz default now());
create table relationships(person_id uuid references people, other_id uuid references people, kind text check (kind in ('manager','team_lead','assigned','department','project')), primary key(person_id,other_id));


-- ===== schema/desks.sql =====
-- desks
create table desks(id uuid primary key default gen_random_uuid(), room_id uuid references rooms on delete cascade, person_id uuid references people on delete set null, x real, z real, facing real default 3.14159);
create index on desks(room_id);


-- ===== schema/cameras.sql =====
-- cameras
create table cameras(id uuid primary key default gen_random_uuid(), code text unique not null, label text, room_id uuid references rooms, position real[3], target real[3]);


-- ===== schema/computers.sql =====
-- computers
create table computers(id uuid primary key default gen_random_uuid(), desk_id uuid references desks on delete cascade, powered boolean default false);


-- ===== schema/virtual_screens.sql =====
-- virtual_screens
create table virtual_screens(id uuid primary key default gen_random_uuid(), computer_id uuid references computers on delete cascade, app text, state text default 'idle', payload jsonb default '{}', updated_at timestamptz default now());


-- ===== schema/presence.sql =====
-- presence
create table presence(person_id uuid primary key references people on delete cascade, status text default 'offline' check (status in ('online','away','busy','offline')), anim_state text default 'IDLE', room_id uuid references rooms, x real, z real, ry real, current_task_id uuid, updated_at timestamptz default now());
create index on presence(room_id);


-- ===== schema/tasks.sql =====
-- tasks
create table tasks(id uuid primary key default gen_random_uuid(), title text not null, owner_id uuid references people, current_person_id uuid references people, chain uuid[] default '{}', step int default 0, status text default 'active', progress int default 0, due_at timestamptz, created_at timestamptz default now());
create index on tasks(current_person_id);


-- ===== schema/task_handoffs.sql =====
-- task_handoffs
create table task_handoffs(id uuid primary key default gen_random_uuid(), task_id uuid references tasks on delete cascade, from_person uuid references people, to_person uuid references people, output jsonb default '{}', created_at timestamptz default now());
create index on task_handoffs(task_id);


-- ===== schema/conversations.sql =====
-- conversations
create table conversations(id uuid primary key default gen_random_uuid(), kind text default 'direct', created_at timestamptz default now());
create table conversation_members(conversation_id uuid references conversations on delete cascade, person_id uuid references people on delete cascade, primary key(conversation_id,person_id));


-- ===== schema/messages.sql =====
-- messages
create table messages(id uuid primary key default gen_random_uuid(), conversation_id uuid references conversations on delete cascade, sender_id uuid references people, body text not null, created_at timestamptz default now());
create index on messages(conversation_id,created_at desc);


-- ===== schema/calls.sql =====
-- calls
create table calls(id uuid primary key default gen_random_uuid(), caller_id uuid references people, callee_id uuid references people, started_at timestamptz default now(), ended_at timestamptz);


-- ===== schema/schedules.sql =====
-- schedules
create table schedules(id uuid primary key default gen_random_uuid(), kind text, title text, room_id uuid references rooms, starts_at timestamptz, ends_at timestamptz, attendees uuid[] default '{}');
create index on schedules(starts_at);


-- ===== schema/activities.sql =====
-- activities
create table activities(id uuid primary key default gen_random_uuid(), person_id uuid references people, kind text, text text not null, task_id uuid references tasks, created_at timestamptz default now());
create index on activities(created_at desc);


-- ===== migrations/001_realtime_sync.sql =====
-- slug-based sync tables so the client can sync before people are seeded with uuids
alter table activities add column if not exists src text, add column if not exists slug text;
alter table messages add column if not exists src text, add column if not exists sender_slug text, add column if not exists peer_slug text;
alter table task_handoffs add column if not exists from_slug text, add column if not exists to_slug text;
alter table tasks add column if not exists chain_slugs text[];
alter table calls add column if not exists caller_slug text, add column if not exists callee_slug text;
alter table schedules add column if not exists src text, add column if not exists time_label text;
create table if not exists presence_live(slug text primary key, status text, anim_state text, x real, z real, task text, updated_at timestamptz default now());
alter table presence_live enable row level security;
alter publication supabase_realtime add table presence_live;


-- ===== migrations/002_people_identity.sql =====
alter table people add column if not exists slug text unique, add column if not exists auth_user_id uuid unique references auth.users on delete set null;
create unique index if not exists desks_person_uidx on desks(person_id) where person_id is not null;
create unique index if not exists computers_desk_uidx on computers(desk_id);
create unique index if not exists vscreens_computer_uidx on virtual_screens(computer_id);


-- ===== migrations/003_realtime_publication.sql =====
alter publication supabase_realtime add table presence, activities, tasks, task_handoffs, messages, schedules, virtual_screens, calls;


-- ===== policies/000_enable_rls.sql =====
do $$ declare t text; begin
 foreach t in array array['people','departments','rooms','desks','cameras','presence','presence_live','activities','tasks','task_handoffs','conversations','conversation_members','messages','calls','schedules','computers','virtual_screens','relationships'] loop
  execute format('alter table %I enable row level security',t);
  execute format('drop policy if exists "office read" on %I',t); execute format('drop policy if exists "office write" on %I',t); execute format('drop policy if exists "office rw" on %I',t);
 end loop; end $$;


-- ===== policies/001_role_policies.sql =====
-- Roles come from the JWT: set app_metadata.office_role = 'owner' | 'employee' (service role only; users cannot edit app_metadata).
-- Link an auth user to a person with people.auth_user_id.
create or replace function office_role() returns text language sql stable as $$ select coalesce(auth.jwt()->'app_metadata'->>'office_role','none') $$;
create or replace function office_is_owner() returns boolean language sql stable as $$ select office_role()='owner' $$;
create or replace function office_is_member() returns boolean language sql stable as $$ select office_role() in ('owner','employee') $$;
create or replace function office_me() returns uuid language sql stable security definer set search_path=public as $$ select id from people where auth_user_id=auth.uid() limit 1 $$;
create or replace function office_my_slug() returns text language sql stable security definer set search_path=public as $$ select slug from people where auth_user_id=auth.uid() limit 1 $$;
create or replace function office_can_talk(a uuid,b uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from relationships where (person_id=a and other_id=b) or (person_id=b and other_id=a))
     or exists(select 1 from people x join people y on x.department_id=y.department_id where x.id=a and y.id=b) $$;

-- Reference data: members read, owner writes
do $$ declare t text; begin foreach t in array array['people','departments','rooms','desks','cameras','computers','relationships','presence','presence_live','activities'] loop
  execute format('create policy "member read" on %I for select to authenticated using (office_is_member())',t);
end loop;
foreach t in array array['people','departments','rooms','desks','cameras','computers','relationships'] loop
  execute format('create policy "owner write" on %I for all to authenticated using (office_is_owner()) with check (office_is_owner())',t);
end loop; end $$;

-- Presence: owner all; employee only their own row
create policy "presence own" on presence for all to authenticated using (office_is_owner() or person_id=office_me()) with check (office_is_owner() or person_id=office_me());
create policy "presence_live own" on presence_live for all to authenticated using (office_is_owner() or slug=office_my_slug()) with check (office_is_owner() or slug=office_my_slug());

-- Activity: append-only for members (own person or owner); only owner deletes
create policy "activity insert" on activities for insert to authenticated with check (office_is_owner() or (office_is_member() and (person_id is null or person_id=office_me())));
create policy "activity delete" on activities for delete to authenticated using (office_is_owner());

-- Tasks: owner creates; participants read; current holder updates
create policy "tasks read" on tasks for select to authenticated using (office_is_owner() or current_person_id=office_me() or office_me()=any(chain) or owner_id=office_me());
create policy "tasks insert" on tasks for insert to authenticated with check (office_is_owner());
create policy "tasks update" on tasks for update to authenticated using (office_is_owner() or current_person_id=office_me()) with check (office_is_owner() or current_person_id=office_me());
create policy "tasks delete" on tasks for delete to authenticated using (office_is_owner());
create policy "handoff read" on task_handoffs for select to authenticated using (office_is_owner() or from_person=office_me() or to_person=office_me());
create policy "handoff insert" on task_handoffs for insert to authenticated with check (office_is_owner() or (from_person=office_me() and office_can_talk(from_person,to_person)));

-- Conversations / messages: members only, and only to permitted contacts
create policy "conv read" on conversations for select to authenticated using (office_is_owner() or exists(select 1 from conversation_members m where m.conversation_id=conversations.id and m.person_id=office_me()));
create policy "conv insert" on conversations for insert to authenticated with check (office_is_member());
create policy "members read" on conversation_members for select to authenticated using (office_is_owner() or person_id=office_me());
create policy "members insert" on conversation_members for insert to authenticated with check (office_is_owner() or person_id=office_me());
create policy "msg read" on messages for select to authenticated using (office_is_owner() or sender_id=office_me() or sender_slug=office_my_slug() or peer_slug=office_my_slug()
  or exists(select 1 from conversation_members m where m.conversation_id=messages.conversation_id and m.person_id=office_me()));
create policy "msg insert" on messages for insert to authenticated with check (office_is_owner()
  or (sender_id=office_me() and exists(select 1 from conversation_members m where m.conversation_id=messages.conversation_id and m.person_id=office_me()))
  or (sender_slug=office_my_slug() and office_can_talk(office_me(),(select id from people where slug=peer_slug))));

-- Calls, schedules, virtual screens
create policy "calls read" on calls for select to authenticated using (office_is_owner() or caller_id=office_me() or callee_id=office_me());
create policy "calls insert" on calls for insert to authenticated with check (office_is_owner() or (caller_id=office_me() and office_can_talk(caller_id,callee_id)));
create policy "sched read" on schedules for select to authenticated using (office_is_owner() or office_me()=any(attendees) or attendees='{}');
create policy "sched write" on schedules for all to authenticated using (office_is_owner()) with check (office_is_owner());
create policy "screen read" on virtual_screens for select to authenticated using (office_is_member());
create policy "screen write" on virtual_screens for all to authenticated
  using (office_is_owner() or exists(select 1 from computers c join desks d on d.id=c.desk_id where c.id=virtual_screens.computer_id and d.person_id=office_me()))
  with check (office_is_owner() or exists(select 1 from computers c join desks d on d.id=c.desk_id where c.id=virtual_screens.computer_id and d.person_id=office_me()));



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
