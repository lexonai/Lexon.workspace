-- Security hardening: enforce 2FA (aal2) in the DATABASE for users who enabled it, and allow login-event logging.

-- True when the session is aal2, or the user has no verified 2FA factor yet.
create or replace function mfa_ok() returns boolean
language sql security definer stable set search_path = public, auth as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
$$;

-- Restrictive policies are ANDed with every other policy: a password/OAuth-only token cannot
-- read data once the account has 2FA, even by calling the API directly.
do $$
declare t text;
begin
  foreach t in array array['profiles','profile_private','workspaces','workspace_members','authorized_emails',
    'role_permissions','projects','project_members','tasks','task_assignees','folders','files','conversations',
    'conversation_members','messages','notifications','activity_logs','attendance','security_events','integrations']
  loop
    execute format('drop policy if exists mfa_gate on public.%I', t);
    execute format('create policy mfa_gate on public.%I as restrictive to authenticated using (mfa_ok())', t);
  end loop;
end $$;

drop policy if exists mfa_gate on storage.objects;
create policy mfa_gate on storage.objects as restrictive to authenticated using (mfa_ok());

-- Users can log their own security events (login, logout, 2FA changes)
create policy secev_insert on security_events for insert with check (user_id = auth.uid());
create index if not exists security_events_user_idx on security_events(user_id, created_at desc);
