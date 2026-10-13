-- slug-based sync tables so the client can sync before people are seeded with uuids
alter table activities add column if not exists src text, add column if not exists slug text;
alter table messages add column if not exists src text, add column if not exists sender_slug text, add column if not exists peer_slug text;
alter table task_handoffs add column if not exists from_slug text, add column if not exists to_slug text;
alter table tasks add column if not exists chain_slugs text[];
alter table calls add column if not exists caller_slug text, add column if not exists callee_slug text;
alter table schedules add column if not exists src text, add column if not exists time_label text;
create table if not exists presence_live(slug text primary key, status text, anim_state text, x real, z real, task text, updated_at timestamptz default now());
alter table presence_live enable row level security;
alter publication supabase_realtime add table presence_live;
