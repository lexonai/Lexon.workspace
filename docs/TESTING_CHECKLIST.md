# Testing checklist




## Testing & verification checklist

Tick every line. A line marked **MUST FAIL** is a security test: the action has to be refused. Run these once locally and again on the live website.


### A. Database

- [ ] Project A: `select count(*) from workspaces;` returns 1 after the owner first signs in.
- [ ] Project A: `select tablename, rowsecurity from pg_tables where schemaname='public' and not rowsecurity;` returns **no rows** (RLS on everywhere).
- [ ] Project A: `select to_regprocedure('invite_verify(text,text)');` is not null (v5 installed).
- [ ] Project E: `select automation_health();` returns JSON with `"schema_version":"3"`.
- [ ] Project B (if used): `select office_health();` returns JSON with `"schema_version":"5"`.


### B. Authentication & invitations

- [ ] Owner signs in to Workspace with the owner email.
- [ ] A Gmail that is NOT the owner and NOT invited cannot sign in to Workspace (error). **MUST FAIL**
- [ ] Add member → Details → Continue → Generate code → Create: a code like `K7QM-4TXD` is shown once.
- [ ] Team app: enter the invited email → code screen appears → enter the code → you land on Home with no registration form.
- [ ] The same code a second time is refused. **MUST FAIL**
- [ ] New invitation, enter a wrong code 5 times (limit 5): the invitation shows **Locked** in Workspace → Team → Invites, and the correct code no longer works. **MUST FAIL**
- [ ] Custom code works; expiry: set 1 hour, change `expires_at` in SQL to the past, code is refused. **MUST FAIL**
- [ ] Email that was never invited: Team app shows the same "code is not valid" message as a wrong code (no hint that the email is unknown). **MUST FAIL**
- [ ] Returning member: enter email → emailed 6-digit code → signed in.
- [ ] Deactivate the member in Workspace → they are signed out / see "Access removed" and cannot read data. **MUST FAIL**


### C. Roles, permissions, data isolation

- [ ] Team Member sees only their own tasks, only their projects, only their chats and notifications.
- [ ] Team Member opening `#/team` or `#/analytics` in Workspace is redirected (Admin only). **MUST FAIL**
- [ ] Team Member without `office.access` opens Workspace → Office: sees "no access" message; calling `central-api` office token with their token returns 403. **MUST FAIL**
- [ ] Admin grants `office.access` in the member profile → Office opens (read-only). Grant `office.edit` too → can edit.
- [ ] With the member's token run in the browser console: `await supabase.from('tasks').select('*')` returns only their tasks. Changing `?id=` or the URL hash to another member's id shows nothing. **MUST FAIL**
- [ ] As member, `update tasks set title=...` on an own task is refused (only status/progress allowed). **MUST FAIL**
- [ ] As member, moving own conversation_members row to another conversation id is refused. **MUST FAIL**
- [ ] As member, `rpc set_user_permission` is refused. **MUST FAIL**
- [ ] Editing localStorage (`sb-…-auth-token`) to another user id or role does not change what the server returns (JWT is signed). **MUST FAIL**
- [ ] Direct REST call with the anon key and no login: `curl https://<A-REF>.supabase.co/rest/v1/tasks -H "apikey: <ANON>"` returns `[]` or 401. **MUST FAIL**


### D. Realtime

- [ ] Two members chat: messages appear live for both.
- [ ] A third member cannot subscribe to the chat (private channel is refused; no messages arrive). **MUST FAIL**
- [ ] Notification: Admin assigns a task → the member's Team app bell increases without reload.


### E. Office & Automation

- [ ] Integrations → Link Office with URL + SSO secret → "connected".
- [ ] Opening the Office URL directly in a browser tab shows no usable data without a token. **MUST FAIL**
- [ ] Integrations → Link YouTube/Instagram project (Project E URL + service_role key) → Test connection: all tables "ok".
- [ ] Stop/pause Project E (or wrong key): Workspace and Team still load and work; only the Automation screens show an error. (Isolation test)
- [ ] Run `youtube-sync` and Instagram webhook verify URL as in the Functions reference.


### F. Team PWA & production

- [ ] Team URL loads over https and shows the Install option (Chrome/Edge address bar or Profile → Install).
- [ ] Installed app opens in its own window / full screen on Android; icon is the blue LT tile.
- [ ] Lighthouse (Chrome DevTools) → PWA: installable, no errors.
- [ ] Response headers contain `X-Frame-Options: DENY` and `Strict-Transport-Security` (DevTools → Network).
- [ ] No secret appears in the built site: search the deployed JS for `service_role` → not found.
- [ ] Supabase Auth → URL configuration lists exactly the two live URLs (and localhost only while testing).
