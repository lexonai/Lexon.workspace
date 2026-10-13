-- computers
create table computers(id uuid primary key default gen_random_uuid(), desk_id uuid references desks on delete cascade, powered boolean default false);
