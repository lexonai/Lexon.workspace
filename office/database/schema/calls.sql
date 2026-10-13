-- calls
create table calls(id uuid primary key default gen_random_uuid(), caller_id uuid references people, callee_id uuid references people, started_at timestamptz default now(), ended_at timestamptz);
