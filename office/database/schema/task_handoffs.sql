-- task_handoffs
create table task_handoffs(id uuid primary key default gen_random_uuid(), task_id uuid references tasks on delete cascade, from_person uuid references people, to_person uuid references people, output jsonb default '{}', created_at timestamptz default now());
create index on task_handoffs(task_id);
