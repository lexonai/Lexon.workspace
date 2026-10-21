-- 4C_UPGRADE_automation.sql (v2 -> v3)   RUN ON: the AUTOMATION Supabase project (your existing one)
-- The Automation SQL is fully idempotent ("if not exists" everywhere), so upgrading = running the same file again.
-- It adds automation_runs + automation_health() + cleanup and re-applies the lock-down. Existing YouTube/Instagram data and Vault tokens are untouched.
-- =====================================================================================================
-- LEXON_CD_automation.sql   (ONE Supabase project for YouTube Automation + Instagram Automation)
-- Replaces the two separate projects C (Instagram) and D (YouTube). One URL, one service_role key, one database.
--
-- Run ONCE in a NEW, empty Supabase project: SQL Editor > paste > Run. Re-runnable (everything is "if not exists"), so it is ALSO the upgrade for an older v2 Automation project.
-- RUN IT ON: the AUTOMATION Supabase project only (never on the Workspace/Team project, never on Office).
-- Security model (same as before, now for both):
--   * RLS is ON for every table and there are NO policies: the browser (anon / authenticated) can never read or write.
--   * Only the service_role (Edge Functions and Lexon Workspace's project-gateway) can reach the data.
--   * Sign-ups are closed (trigger below). This project has no human users.
--   * Google / Meta tokens are stored in Supabase Vault, never in plain table columns.
--
-- YouTube tables: columns match exactly what Lexon Workspace reads (apps/web/src/services/youtube.ts).
-- Instagram tables: the real Lexon Automation model (accounts, automations, keywords, replies, events, stats), single-owner.
-- =====================================================================================================

create extension if not exists pgcrypto;

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ===== Closed sign-ups: nobody can register in this project =====
create or replace function block_signups() returns trigger language plpgsql security definer set search_path = public as $$
begin raise exception 'Sign-ups are closed for this project'; end $$;
drop trigger if exists on_auth_user_blocked on auth.users;
create trigger on_auth_user_blocked before insert on auth.users for each row execute function block_signups();

-- ===== Metadata =====
create table if not exists automation_meta (key text primary key, value text not null, updated_at timestamptz not null default now());
insert into automation_meta(key, value) values ('schema_version', '3')
on conflict (key) do update set value = '3', updated_at = now();

-- ===== Vault wrappers for tokens (service_role only) =====
create table if not exists automation_secrets (name text primary key, vault_secret_id uuid not null, updated_at timestamptz not null default now());
create or replace function set_automation_secret(p_name text, p_secret text) returns void
language plpgsql security definer set search_path = public, vault as $$
declare sid uuid;
begin
  select vault_secret_id into sid from automation_secrets where name = p_name;
  if sid is null then
    sid := vault.create_secret(p_secret, 'automation_' || p_name);
    insert into automation_secrets(name, vault_secret_id) values (p_name, sid);
  else
    perform vault.update_secret(sid, p_secret);
    update automation_secrets set updated_at = now() where name = p_name;
  end if;
end $$;
create or replace function get_automation_secret(p_name text) returns text
language plpgsql security definer set search_path = public, vault as $$
declare r text;
begin
  select ds.decrypted_secret into r from automation_secrets s join vault.decrypted_secrets ds on ds.id = s.vault_secret_id where s.name = p_name;
  return r;
end $$;
create or replace function delete_automation_secret(p_name text) returns void
language plpgsql security definer set search_path = public, vault as $$
declare sid uuid;
begin
  select vault_secret_id into sid from automation_secrets where name = p_name;
  if sid is not null then
    delete from automation_secrets where name = p_name;
    delete from vault.secrets where id = sid;
  end if;
end $$;

-- ===== YouTube =====
create table if not exists youtube_connection (
  id int primary key default 1 check (id = 1),         -- exactly one connected channel/account
  status text not null default 'disconnected',          -- connected | disconnected | error
  account_label text, channel_id text, scopes text[] not null default '{}',
  connected_at timestamptz, last_sync_at timestamptz, last_error text,
  updated_at timestamptz not null default now()
);
create table if not exists youtube_channel_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null unique,
  channel_title text, subscribers bigint not null default 0, total_views bigint not null default 0, video_count int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists youtube_videos (
  video_id text primary key,
  title text not null default '', published_at timestamptz, duration_s int not null default 0,
  is_short boolean not null default false, thumbnail_url text,
  metrics jsonb not null default '{}',                  -- views, likes, comments, ctr, watch time ... (whatever the Analytics API returns)
  updated_at timestamptz not null default now()
);
create index if not exists youtube_videos_published_idx on youtube_videos(published_at desc);
create table if not exists youtube_ai_outputs (
  id uuid primary key default gen_random_uuid(),
  kind text not null, prompt text, output text not null,
  created_at timestamptz not null default now()
);
create index if not exists youtube_ai_outputs_created_idx on youtube_ai_outputs(created_at desc);

-- ===== Instagram (real automation: comment -> reply + DM) =====
-- Single owner, so no profile_id: every row belongs to this Lexon installation. Access tokens live in Vault
-- (automation_secrets name = 'ig_token_<ig_accounts.id>'), never in these tables.
create table if not exists ig_accounts (
  id uuid primary key default gen_random_uuid(),
  instagram_user_id text not null unique,
  username text, profile_image_url text,
  token_expires_at timestamptz,
  status text not null default 'connected' check (status in ('connected','expired','revoked')),
  last_error text,
  connected_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists ig_automations (
  id uuid primary key default gen_random_uuid(),
  instagram_account_id uuid not null references ig_accounts(id) on delete cascade,
  post_id text, post_scope text not null default 'specific' check (post_scope in ('specific','any','next')),
  post_type text, post_thumbnail_url text, post_caption text,
  title text not null, description text,
  resource_type text not null default 'other' check (resource_type in ('pdf','website','youtube','tool','course','file','other')),
  trigger_type text not null default 'keywords' check (trigger_type in ('keywords','any_comment')),
  match_mode text not null default 'flexible' check (match_mode in ('exact','flexible')),
  allow_emoji_only boolean not null default false, allow_short_comments boolean not null default false,
  delay_seconds int not null default 3 check (delay_seconds between 1 and 30),
  comment_reply_enabled boolean not null default true,
  dm_type text not null default 'text_button', dm_content text not null, button_label text, resource_url text,
  status text not null default 'draft' check (status in ('draft','active','paused')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists ig_automations_account_idx on ig_automations(instagram_account_id, status);
create table if not exists ig_keywords (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references ig_automations(id) on delete cascade,
  keyword text not null, normalized_keyword text not null, excluded boolean not null default false
);
create index if not exists ig_keywords_idx on ig_keywords(automation_id, excluded, normalized_keyword);
create table if not exists ig_comment_replies (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references ig_automations(id) on delete cascade,
  response_text text not null, enabled boolean not null default true
);
create table if not exists ig_events (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references ig_automations(id) on delete cascade,
  external_event_id text not null,            -- Instagram comment id: idempotency (Meta retries webhooks)
  comment_id text, commenter_reference text,  -- IGSID only, not a real identity
  event_type text not null check (event_type in ('comment_received','reply_sent','dm_sent','error')),
  status text not null check (status in ('success','failed','skipped')),
  error_message text, created_at timestamptz not null default now(),
  unique (automation_id, external_event_id, event_type)
);
create index if not exists ig_events_created_idx on ig_events(created_at desc);
create table if not exists ig_stats (
  automation_id uuid primary key references ig_automations(id) on delete cascade,
  comments_triggered int not null default 0, dms_sent int not null default 0, replies_sent int not null default 0,
  button_clicks int not null default 0, updated_at timestamptz not null default now()
);
create table if not exists ig_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null default 'info', event text not null, message text, meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists ig_logs_created_idx on ig_logs(created_at);

-- Atomic counter (no read-modify-write races under webhook load). Column name is whitelisted.
create or replace function ig_increment_stat(p_automation_id uuid, p_column text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_column not in ('comments_triggered','dms_sent','replies_sent','button_clicks') then raise exception 'bad column'; end if;
  insert into ig_stats(automation_id) values (p_automation_id) on conflict do nothing;
  execute format('update ig_stats set %I = %I + 1, updated_at = now() where automation_id = $1', p_column, p_column) using p_automation_id;
end $$;

-- updated_at triggers
do $$ declare t text; begin
  foreach t in array array['youtube_connection','youtube_videos','ig_accounts','ig_automations'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function set_updated_at()', t);
  end loop;
end $$;


-- ===== v3: run tracking + health (so a failing worker is VISIBLE and never silently breaks anything) =====
-- Every worker execution (gateway call, Meta webhook, cron) is recorded. Workspace/Team never depend on these rows:
-- if this project is down, Workspace keeps working and only the Automation screens show "unavailable".
create table if not exists automation_runs (
  id uuid primary key default gen_random_uuid(),
  fn text not null,
  trigger text not null check (trigger in ('gateway','webhook','cron','oauth')),
  actor text,                                             -- Workspace user id for gateway calls, null for webhook/cron
  status text not null default 'running' check (status in ('running','ok','error')),
  started_at timestamptz not null default now(), finished_at timestamptz, duration_ms int, error text,
  meta jsonb not null default '{}'
);
create index if not exists automation_runs_started_idx on automation_runs(started_at desc);
create index if not exists automation_runs_fn_idx on automation_runs(fn, started_at desc);

create or replace function automation_run_start(p_fn text, p_trigger text, p_actor text) returns uuid
language sql security definer set search_path = public as $$
  insert into automation_runs(fn, trigger, actor) values (p_fn, p_trigger, p_actor) returning id $$;
create or replace function automation_run_finish(p_id uuid, p_status text, p_error text, p_meta jsonb default '{}') returns void
language sql security definer set search_path = public as $$
  update automation_runs set status = p_status, finished_at = now(), duration_ms = (extract(epoch from (now() - started_at)) * 1000)::int,
    error = left(p_error, 300), meta = coalesce(p_meta, '{}') where id = p_id $$;
create or replace function automation_health() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'schema_version', (select value from automation_meta where key = 'schema_version'),
    'youtube', (select jsonb_build_object('status', coalesce(c.status, 'disconnected'), 'last_sync_at', c.last_sync_at, 'last_error', c.last_error) from (select 1) d left join youtube_connection c on c.id = 1),
    'instagram_accounts', (select count(*) from ig_accounts where status = 'connected'),
    'runs_24h', (select count(*) from automation_runs where started_at > now() - interval '24 hours'),
    'errors_24h', (select count(*) from automation_runs where status = 'error' and started_at > now() - interval '24 hours'),
    'last_ok', coalesce((select jsonb_object_agg(fn, t) from (select fn, max(finished_at) t from automation_runs where status = 'ok' group by fn) x), '{}'::jsonb),
    'last_error', (select to_jsonb(r) from (select fn, error, finished_at from automation_runs where status = 'error' order by started_at desc limit 1) r)
  ) $$;
create or replace function automation_cleanup() returns void language sql security definer set search_path = public as $$
  delete from automation_runs where started_at < now() - interval '14 days';
  delete from ig_logs where created_at < now() - interval '30 days';
  delete from youtube_ai_outputs where created_at < now() - interval '90 days';
  update automation_runs set status = 'error', error = 'Timed out', finished_at = now() where status = 'running' and started_at < now() - interval '15 minutes'; $$;

-- OPTIONAL schedules (need the pg_cron + pg_net extensions: Dashboard > Database > Extensions). Run these two lines ONCE by hand
-- after you replace <E-REF> and <E-SERVICE-ROLE-KEY>. The key goes to Vault (never into the cron text).
--   select set_automation_secret('cron_service_key', '<E-SERVICE-ROLE-KEY>');
--   select cron.schedule('lexon-youtube-sync', '0 2 * * *', $$ select net.http_post(
--     url := 'https://<E-REF>.supabase.co/functions/v1/youtube-sync',
--     headers := jsonb_build_object('Authorization', 'Bearer ' || public.get_automation_secret('cron_service_key'), 'Content-Type', 'application/json'),
--     body := '{}'::jsonb) $$);
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('lexon-automation-cleanup', '23 3 * * *', 'select public.automation_cleanup()');
exception when others then raise notice 'pg_cron not enabled (%): automation_cleanup() can be run by hand.', sqlerrm;
end $$;

-- ===== Lock everything: RLS on, no policies, no access for browser roles =====
do $$ declare t text; begin
  foreach t in array array['automation_meta','automation_secrets','youtube_connection','youtube_channel_snapshots','youtube_videos','youtube_ai_outputs',
    'ig_accounts','ig_automations','ig_keywords','ig_comment_replies','ig_events','ig_stats','ig_logs','automation_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

notify pgrst, 'reload schema';
