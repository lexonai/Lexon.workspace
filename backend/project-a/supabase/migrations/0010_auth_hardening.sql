-- 0010: a deactivated member must lose access to chats too (in_conversation previously ignored workspace_members.active).
-- Re-runnable. No tables change; policies keep using the same function name.
create or replace function in_conversation(cid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from conversation_members cm
      join conversations c on c.id = cm.conversation_id
      join workspace_members m on m.workspace_id = c.workspace_id and m.user_id = cm.user_id and m.active
    where cm.conversation_id = cid and cm.user_id = auth.uid()) $$;
grant execute on function in_conversation(uuid) to authenticated, service_role;
notify pgrst, 'reload schema';
