-- LEXON Automation backend preflight (READ-ONLY). Run in the ONE shared Supabase project used for YouTube + Instagram,
-- BEFORE linking it in Workspace > Integrations > "Automation backend", and again after every SQL change.
-- Every row must show ok = true. It changes nothing.
--
-- What it checks comes from the Workspace code (project-gateway whitelist + the columns the YouTube screens read).
-- Instagram: tables are checked; run LEXON_CD_automation.sql to create them.

with need_tables(t) as (values
  ('youtube_videos'),('youtube_channel_snapshots'),('youtube_ai_outputs'),('youtube_connection'),
  ('ig_accounts'),('ig_automations'),('ig_keywords'),('ig_comment_replies'),('ig_events'),('ig_stats'),('ig_logs')),
need_cols(t, c) as (values
  ('youtube_videos','video_id'),('youtube_videos','title'),('youtube_videos','published_at'),('youtube_videos','duration_s'),
  ('youtube_videos','is_short'),('youtube_videos','thumbnail_url'),('youtube_videos','metrics'),
  ('youtube_channel_snapshots','channel_title'),('youtube_channel_snapshots','subscribers'),('youtube_channel_snapshots','total_views'),
  ('youtube_channel_snapshots','video_count'),('youtube_channel_snapshots','snapshot_date'),
  ('youtube_connection','status'),('youtube_connection','account_label'),('youtube_connection','last_sync_at'),('youtube_connection','last_error'),
  ('youtube_ai_outputs','id'),('youtube_ai_outputs','kind'),('youtube_ai_outputs','prompt'),('youtube_ai_outputs','output'),('youtube_ai_outputs','created_at'),
  ('ig_logs','level'),('ig_logs','event'),('ig_logs','message'),('ig_logs','created_at'))
select 'table exists: ' || t as item,
       to_regclass('public.' || t) is not null as ok,
       null::text as detail
from need_tables
union all
select 'column exists: ' || t || '.' || c,
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = c),
       null
from need_cols
union all
-- SAFETY: these tables hold Google/Instagram data. They must be reachable ONLY with the service key (via the gateway).
select 'RLS enabled: ' || t,
       coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.' || t)), false),
       'turn on with: alter table public.' || t || ' enable row level security;'
from need_tables
union all
select 'no client policies: ' || t,
       not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t
                   and (p.roles && array['anon','authenticated','public']::name[])),
       'drop any policy that grants anon/authenticated access'
from need_tables where to_regclass('public.' || t) is not null
union all
select 'anon/authenticated have no table privileges: ' || t,
       not (has_table_privilege('anon', to_regclass('public.' || t), 'select,insert,update,delete')
         or has_table_privilege('authenticated', to_regclass('public.' || t), 'select,insert,update,delete')),
       'revoke all on public.' || t || ' from anon, authenticated;'
from need_tables where to_regclass('public.' || t) is not null
order by ok, item;

-- Helper functions defined in this project (look for duplicates / anything callable by anon):
select p.proname as function_name,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_run,
       has_function_privilege('authenticated', p.oid, 'execute') as signed_in_can_run
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f' order by p.proname;
