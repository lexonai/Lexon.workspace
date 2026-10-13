# Office database (own Supabase project only)
Apply in this order (SQL editor, one file at a time):
1. schema/_extensions.sql
2. schema/ in dependency order: departments, rooms, people, desks, cameras, computers, virtual_screens, presence, tasks, task_handoffs, conversations, messages, calls, schedules, activities
3. migrations/001_realtime_sync.sql, 002_people_identity.sql, 003_realtime_publication.sql
4. policies/000_enable_rls.sql, policies/001_role_policies.sql
5. seed/001_seed.sql
Roles: set `app_metadata.office_role` to `owner` or `employee` for each auth user (service role / dashboard only) and set `people.auth_user_id` for employees.
Note: the demo UI pushes presence/activity as the owner; employee clients can only write their own presence, and only message permitted contacts.
