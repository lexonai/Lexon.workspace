-- virtual_screens
create table virtual_screens(id uuid primary key default gen_random_uuid(), computer_id uuid references computers on delete cascade, app text, state text default 'idle', payload jsonb default '{}', updated_at timestamptz default now());
