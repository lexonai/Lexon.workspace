do $$ declare t text; begin
 foreach t in array array['people','departments','rooms','desks','cameras','presence','presence_live','activities','tasks','task_handoffs','conversations','conversation_members','messages','calls','schedules','computers','virtual_screens','relationships'] loop
  execute format('alter table %I enable row level security',t);
  execute format('drop policy if exists "office read" on %I',t); execute format('drop policy if exists "office write" on %I',t); execute format('drop policy if exists "office rw" on %I',t);
 end loop; end $$;
