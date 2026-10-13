-- conversations
create table conversations(id uuid primary key default gen_random_uuid(), kind text default 'direct', created_at timestamptz default now());
create table conversation_members(conversation_id uuid references conversations on delete cascade, person_id uuid references people on delete cascade, primary key(conversation_id,person_id));
