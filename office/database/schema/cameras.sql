-- cameras
create table cameras(id uuid primary key default gen_random_uuid(), code text unique not null, label text, room_id uuid references rooms, position real[3], target real[3]);
