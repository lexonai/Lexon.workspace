-- people
create table people(id uuid primary key default gen_random_uuid(), name text not null, role text, department_id uuid references departments, manager_id uuid references people, avatar jsonb default '{}', is_owner boolean default false, created_at timestamptz default now());
create table relationships(person_id uuid references people, other_id uuid references people, kind text check (kind in ('manager','team_lead','assigned','department','project')), primary key(person_id,other_id));
