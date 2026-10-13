-- Roles come from the JWT: set app_metadata.office_role = 'owner' | 'employee' (service role only; users cannot edit app_metadata).
-- Link an auth user to a person with people.auth_user_id.
create or replace function office_role() returns text language sql stable as $$ select coalesce(auth.jwt()->'app_metadata'->>'office_role','none') $$;
create or replace function office_is_owner() returns boolean language sql stable as $$ select office_role()='owner' $$;
create or replace function office_is_member() returns boolean language sql stable as $$ select office_role() in ('owner','employee') $$;
create or replace function office_me() returns uuid language sql stable security definer set search_path=public as $$ select id from people where auth_user_id=auth.uid() limit 1 $$;
create or replace function office_my_slug() returns text language sql stable security definer set search_path=public as $$ select slug from people where auth_user_id=auth.uid() limit 1 $$;
create or replace function office_can_talk(a uuid,b uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from relationships where (person_id=a and other_id=b) or (person_id=b and other_id=a))
     or exists(select 1 from people x join people y on x.department_id=y.department_id where x.id=a and y.id=b) $$;

-- Reference data: members read, owner writes
do $$ declare t text; begin foreach t in array array['people','departments','rooms','desks','cameras','computers','relationships','presence','presence_live','activities'] loop
  execute format('create policy "member read" on %I for select to authenticated using (office_is_member())',t);
end loop;
foreach t in array array['people','departments','rooms','desks','cameras','computers','relationships'] loop
  execute format('create policy "owner write" on %I for all to authenticated using (office_is_owner()) with check (office_is_owner())',t);
end loop; end $$;

-- Presence: owner all; employee only their own row
create policy "presence own" on presence for all to authenticated using (office_is_owner() or person_id=office_me()) with check (office_is_owner() or person_id=office_me());
create policy "presence_live own" on presence_live for all to authenticated using (office_is_owner() or slug=office_my_slug()) with check (office_is_owner() or slug=office_my_slug());

-- Activity: append-only for members (own person or owner); only owner deletes
create policy "activity insert" on activities for insert to authenticated with check (office_is_owner() or (office_is_member() and (person_id is null or person_id=office_me())));
create policy "activity delete" on activities for delete to authenticated using (office_is_owner());

-- Tasks: owner creates; participants read; current holder updates
create policy "tasks read" on tasks for select to authenticated using (office_is_owner() or current_person_id=office_me() or office_me()=any(chain) or owner_id=office_me());
create policy "tasks insert" on tasks for insert to authenticated with check (office_is_owner());
create policy "tasks update" on tasks for update to authenticated using (office_is_owner() or current_person_id=office_me()) with check (office_is_owner() or current_person_id=office_me());
create policy "tasks delete" on tasks for delete to authenticated using (office_is_owner());
create policy "handoff read" on task_handoffs for select to authenticated using (office_is_owner() or from_person=office_me() or to_person=office_me());
create policy "handoff insert" on task_handoffs for insert to authenticated with check (office_is_owner() or (from_person=office_me() and office_can_talk(from_person,to_person)));

-- Conversations / messages: members only, and only to permitted contacts
create policy "conv read" on conversations for select to authenticated using (office_is_owner() or exists(select 1 from conversation_members m where m.conversation_id=conversations.id and m.person_id=office_me()));
create policy "conv insert" on conversations for insert to authenticated with check (office_is_member());
create policy "members read" on conversation_members for select to authenticated using (office_is_owner() or person_id=office_me());
create policy "members insert" on conversation_members for insert to authenticated with check (office_is_owner() or person_id=office_me());
create policy "msg read" on messages for select to authenticated using (office_is_owner() or sender_id=office_me() or sender_slug=office_my_slug() or peer_slug=office_my_slug()
  or exists(select 1 from conversation_members m where m.conversation_id=messages.conversation_id and m.person_id=office_me()));
create policy "msg insert" on messages for insert to authenticated with check (office_is_owner()
  or (sender_id=office_me() and exists(select 1 from conversation_members m where m.conversation_id=messages.conversation_id and m.person_id=office_me()))
  or (sender_slug=office_my_slug() and office_can_talk(office_me(),(select id from people where slug=peer_slug))));

-- Calls, schedules, virtual screens
create policy "calls read" on calls for select to authenticated using (office_is_owner() or caller_id=office_me() or callee_id=office_me());
create policy "calls insert" on calls for insert to authenticated with check (office_is_owner() or (caller_id=office_me() and office_can_talk(caller_id,callee_id)));
create policy "sched read" on schedules for select to authenticated using (office_is_owner() or office_me()=any(attendees) or attendees='{}');
create policy "sched write" on schedules for all to authenticated using (office_is_owner()) with check (office_is_owner());
create policy "screen read" on virtual_screens for select to authenticated using (office_is_member());
create policy "screen write" on virtual_screens for all to authenticated
  using (office_is_owner() or exists(select 1 from computers c join desks d on d.id=c.desk_id where c.id=virtual_screens.computer_id and d.person_id=office_me()))
  with check (office_is_owner() or exists(select 1 from computers c join desks d on d.id=c.desk_id where c.id=virtual_screens.computer_id and d.person_id=office_me()));
