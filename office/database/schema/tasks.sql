-- tasks
create table tasks(id uuid primary key default gen_random_uuid(), title text not null, owner_id uuid references people, current_person_id uuid references people, chain uuid[] default '{}', step int default 0, status text default 'active', progress int default 0, due_at timestamptz, created_at timestamptz default now());
create index on tasks(current_person_id);
