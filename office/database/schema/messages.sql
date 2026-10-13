-- messages
create table messages(id uuid primary key default gen_random_uuid(), conversation_id uuid references conversations on delete cascade, sender_id uuid references people, body text not null, created_at timestamptz default now());
create index on messages(conversation_id,created_at desc);
