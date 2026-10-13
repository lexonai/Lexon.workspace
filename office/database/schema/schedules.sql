-- schedules
create table schedules(id uuid primary key default gen_random_uuid(), kind text, title text, room_id uuid references rooms, starts_at timestamptz, ends_at timestamptz, attendees uuid[] default '{}');
create index on schedules(starts_at);
