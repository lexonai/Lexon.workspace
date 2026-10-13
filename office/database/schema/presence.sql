-- presence
create table presence(person_id uuid primary key references people on delete cascade, status text default 'offline' check (status in ('online','away','busy','offline')), anim_state text default 'IDLE', room_id uuid references rooms, x real, z real, ry real, current_task_id uuid, updated_at timestamptz default now());
create index on presence(room_id);
