-- desks
create table desks(id uuid primary key default gen_random_uuid(), room_id uuid references rooms on delete cascade, person_id uuid references people on delete set null, x real, z real, facing real default 3.14159);
create index on desks(room_id);
