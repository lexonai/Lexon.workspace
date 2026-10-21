-- LEXON Workspace health check (READ-ONLY). Paste into Supabase SQL Editor (project A) and Run.
-- Every row with ok = false tells you exactly what is missing.

with expected_tables(t) as (values
  ('profiles'),('profile_private'),('workspaces'),('workspace_members'),('authorized_emails'),('role_permissions'),
  ('projects'),('project_members'),('tasks'),('task_assignees'),('folders'),('files'),
  ('conversations'),('conversation_members'),('messages'),            -- Messages
  ('notifications'),('activity_logs'),('attendance'),('security_events'),
  ('integrations'),('integration_secrets'),('integration_logs'),
  ('automations'),('automation_logs'),                                   -- Automations
  ('agents'),('agent_events'),                                          -- AI Agents
  ('call_sessions'),('retention_settings'),('rate_limits')),
expected_cols(t, c) as (values
  ('profiles','assistant_name'),('profiles','job_title'),('profiles','presence'),('profiles','last_seen'),('profiles','avatar_url'),
  ('projects','description'),('projects','progress'),('projects','type'),('tasks','due_at'),('automation_logs','source'),('authorized_emails','invited_at')),
expected_fns(f) as (values
  ('is_member'),('is_admin'),('has_permission'),('mfa_ok'),('can_see_task'),('run_retention_cleanup'),('broadcast_notification'),
  ('my_conversations'),('start_direct'),('create_group'),('toggle_reaction'),('project_link_status'),('list_invites'),('list_admins'))
select 'table ' || t as item, exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) as ok from expected_tables
union all
select 'column ' || t || '.' || c, exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = c) from expected_cols
union all
select 'function ' || f, exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f) from expected_fns
union all
select 'rls enabled on ' || c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('profiles','projects','tasks','workspace_members','notifications','activity_logs','messages','agents','automations')
order by ok, item;

-- Data present (what Home / Messages / Automations / Agents show):
select 'workspaces' as tbl, count(*) from workspaces union all
select 'workspace_members (active)', count(*) from workspace_members where active union all
select 'projects', count(*) from projects union all
select 'tasks', count(*) from tasks union all
select 'conversations', count(*) from conversations union all
select 'messages', count(*) from messages union all
select 'automations', count(*) from automations union all
select 'agents', count(*) from agents union all
select 'integrations', count(*) from integrations;

-- Admin accounts (an account that is NOT in workspace_members shows "not linked to a workspace"):
select u.email, m.role, m.active, m.workspace_id
from auth.users u left join workspace_members m on m.user_id = u.id order by u.created_at;
