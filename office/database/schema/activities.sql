-- activities
create table activities(id uuid primary key default gen_random_uuid(), person_id uuid references people, kind text, text text not null, task_id uuid references tasks, created_at timestamptz default now());
create index on activities(created_at desc);
