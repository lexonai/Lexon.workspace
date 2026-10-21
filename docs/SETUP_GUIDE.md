# LEXON Setup Guide

Zero to live


## 0. What you are building

LEXON is one connected, secure system made of **three Supabase projects**, **two websites** and **one Office server**. A person has **one identity** (a Supabase Auth account in Project A). What they can see is decided by the database and the servers, never by the browser.

| Part | What it is | Backend | Who uses it |
|---|---|---|---|
| **Workspace** | Admin website: dashboard, messages, projects, tasks, team, files, analytics, integrations, Office, automations | Project A | Owner / Admins (and Team Members with limited pages) |
| **Team** | Installable PWA: my tasks, my projects, messages, notifications, my stats, my links | Project A (the **same** project, schema and Auth) | Invited Team Members |
| **Office** | 3D office module, opened inside Workspace. No login of its own | Office server + Project B (separate) | Admin + members an Admin granted `office.access` |
| **Automation** | YouTube + Instagram workers, webhooks, AI Studio | Project E (separate, no human users) | Reached only through `central-api` |

> **Note:** **Final rule:** One Identity + Shared Workspace/Team Backend + Separate Office Backend + Separate Automation Backend + Centralized APIs + Backend-enforced Permissions.


### Folder map of the delivery

```
LEXON_Workspace.zip  (lexon-workspace/)
  apps/web                      Workspace website (React + Vite)
  apps/desktop                  Windows app shell (optional)
  backend/project-a/supabase    Edge Functions + migrations for Project A
  backend/project-e-automation/supabase   Edge Functions for Project E
  sql/                          1_WORKSPACE_TEAM, 2_OFFICE, 3_AUTOMATION, 4A/4B/4C upgrades
  docs/                         ENV guide, functions reference, checklist
LEXON_Team.zip       (lexon-team/)      Team PWA (React + Vite)
LEXON_Office_Server.zip (office/)       Office Node server + web build
```


### Where each SQL file is executed

| File | Run on | When |
|---|---|---|
| `sql/1_WORKSPACE_TEAM.sql` | **Project A** → SQL Editor | Fresh install. Edit the owner email first |
| `sql/2_OFFICE.sql` | **Project B** → SQL Editor | Fresh install of the Office database |
| `sql/3_AUTOMATION.sql` | **Project E** → SQL Editor | Fresh install of the Automation database |
| `sql/4A_UPGRADE_workspace_team.sql` | **Project A** | You already run v4 and want v5 (no data loss) |
| `sql/4B_UPGRADE_office.sql` | **Project B** | Upgrading an existing Office project |
| `sql/4C_UPGRADE_automation.sql` | **Project E** | Upgrading an existing Automation project |

> **Warning:** Never run a file on the wrong project. 1 on A only. 2 on B only. 3 on E only. The files check for this where possible, but the safest habit is to look at the project name in the top-left of the Supabase dashboard before pressing Run.


## Part 1. Prerequisites

| Need | Why | How to get / check |
|---|---|---|
| Computer with Windows 10/11, macOS or Linux | Run commands | — |
| **Node.js 20 LTS** (includes npm) | Build the websites | nodejs.org → LTS. Check: `node -v` shows v20 or higher |
| **Git** | Upload code to GitHub | git-scm.com. Check: `git --version` |
| **Supabase CLI** | Deploy Edge Functions and secrets | Windows: `scoop install supabase` or `npm i -g supabase`. Mac: `brew install supabase/tap/supabase`. Check: `supabase --version` |
| Supabase account | 3 projects (free plan is enough to start) | supabase.com → Sign up |
| GitHub account | Store code, build | github.com |
| Vercel account | Host the two websites over https | vercel.com → Continue with GitHub |
| A domain (optional) | Your own address like workspace.yourname.com | Any registrar; Vercel can manage DNS |
| Email sending (optional but recommended) | Supabase's built-in email is limited to a few emails per hour | resend.com (free) + a verified domain |


### Decide and write down these values now

```
OWNER_EMAIL      = the ONE Gmail/email that becomes Owner (example: you@gmail.com)
OWNER_PASSWORD   = at least 12 characters (only you know it)
WORKSPACE_URL    = https://workspace.yourdomain.com   (or the vercel.app URL later)
TEAM_URL         = https://team.yourdomain.com
OFFICE_URL       = https://office.yourdomain.com     (Office server)
```

Generate secrets (run each line once; copy the output into a private notes file, not into GitHub). **Windows:** use Git Bash, which includes `openssl`.

```
openssl rand -hex 32     # OAUTH_STATE_SECRET
openssl rand -hex 32     # OFFICE_GATEWAY_SECRET
openssl rand -hex 24     # OFFICE_SSO_SECRET
openssl rand -hex 32     # STATE_SECRET (Automation)
openssl rand -hex 24     # META_VERIFY_TOKEN
```


### Unzip the delivery

```
mkdir lexon && cd lexon
# unzip LEXON_Workspace.zip, LEXON_Team.zip, LEXON_Office_Server.zip here
# you now have: lexon-workspace/  lexon-team/  office/
```

- [ ] `node -v`, `git --version`, `supabase --version` all print a version.
- [ ] The three folders exist.


## Part 2. Create the three Supabase projects

Dashboard → **New project**. Choose the same region for all three (nearest to your users). Save each **database password** in your notes.

| Name it | Role | Short name in this guide |
|---|---|---|
| `lexon-workspace-team` | Shared Workspace + Team backend | **A** |
| `lexon-office` | Office database | **B** |
| `lexon-automation` | YouTube + Instagram backend | **E** |


### Collect the IDs and keys (do this for each project)

1. Open the project → **Project Settings** (gear icon) → **General**: copy **Reference ID** (20 letters) = `<A-REF>`, `<B-REF>` or `<E-REF>`.
2. Same page group → **API** (or **API Keys**): copy **Project URL** (`https://<REF>.supabase.co`), the **anon / public** key, and the **service_role** key (click Reveal).

| Value | Looks like | Used in |
|---|---|---|
| `<A-REF>`, Project A URL | `https://abcd….supabase.co` | Workspace `.env`, Team `.env`, CLI link, Office env |
| Project A **anon** key | long text starting `eyJ…` | Workspace `.env`, Team `.env` (public) |
| Project A **service_role** | `eyJ…` (secret) | Nowhere you type it: Supabase gives it to Edge Functions |
| `<E-REF>`, Project E URL + **service_role** |  | Typed once into Workspace → Integrations → Link YouTube/Instagram (stored in Vault) |
| Project B URL, anon, service_role |  | Only if the Office server uses Project B as its database |

- [ ] A, B and E each show status "Healthy" in the dashboard.
- [ ] You wrote down 3 refs, 3 URLs, anon keys and service_role keys.


## Part 3. Run the SQL


### 3.1 Project A (Workspace + Team)

1. Open `lexon-workspace/sql/1_WORKSPACE_TEAM.sql` in Notepad / VS Code.
2. Press Ctrl+F and search `<<<`. You find two lines near the end of section 0011. **Line 1:** replace `CHANGE_ME@gmail.com` with your OWNER_EMAIL (keep the quotes and `lower(...)`). **Line 2:** `v_password text := ''` → put your OWNER_PASSWORD between the quotes (or leave empty and create the user in the dashboard in Part 4). Save the file.
3. Supabase → **Project A** → **SQL Editor** → New query → paste the **whole file** → **Run**.
4. Wait for "Success. No rows returned". Warnings such as "pg_cron not enabled" are fine.

> **Note:** If the editor reports an error, nothing half-applies for the failing statement, but earlier statements may have run. Copy the error text, and see Appendix D (Troubleshooting). Do not run the file twice on a fresh project: use the Upgrade file instead if you are unsure.

**Verify** (SQL Editor, new query, Run each):

```
select count(*) from pg_tables where schemaname='public' and not rowsecurity;  -- expect 0
select to_regprocedure('invite_verify(text,text)') is not null as v5_ok;  -- expect true
select email from app_owner;   -- expect your owner email
```


### 3.2 Project E (Automation)

1. Supabase → **Project E** → SQL Editor → paste `sql/3_AUTOMATION.sql` → Run.

```
select automation_health();   -- expect JSON with "schema_version":"3"
```


### 3.3 Project B (Office database)

1. Supabase → **Project B** → SQL Editor → paste `sql/2_OFFICE.sql` → Run.
2. Authentication → Providers → Email → switch **Allow new users to sign up** OFF (Office has no self-registration; the SQL also enforces it).

```
select office_health();   -- expect JSON with "schema_version":"5"
```

> **Note:** Office works out of the box with its own built-in database on the Office server. Project B is the optional Supabase store/mirror for the Office data. If you skip Project B, simply skip 3.3: nothing else depends on it.


### 3.4 Upgrading an existing v4 system instead

1. Dashboard → Database → Backups: make sure a backup exists (or Project Settings → Database → Backups).
2. Run `4A_UPGRADE_workspace_team.sql` on Project A. It runs as one transaction: all or nothing, and it can be run again safely.
3. Run `4C_UPGRADE_automation.sql` on Project E and `4B_UPGRADE_office.sql` on Project B (if used).
4. Old invitations remain; they show as "No code yet" in Team → Invites. Press **New code** to issue a code. Existing members keep their access and sign in to Team with an emailed code.


## Part 4. Admin (Owner) account

The first account of a new workspace can only be the owner email you set in SQL. Everyone else needs an invitation.


### Option 1: password created by the SQL

If you filled `v_password` in Part 3.1, the owner already exists. Skip to Part 5.


### Option 2: create the owner in the dashboard

1. Project A → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Email = OWNER_EMAIL, Password = OWNER_PASSWORD, tick **Auto Confirm User** → Create.
3. Table Editor → `workspaces` shows one row, and `workspace_members` shows your user with role `owner`.

If creation says "Email not authorized for this workspace", the email in `app_owner` differs from the one you typed. Fix with: `update app_owner set email = lower('you@gmail.com') where id = 1;` then try again.

- [ ] `select role from workspace_members;` returns `owner`.


### Set the workspace id for tests

```
select id from workspaces;     -- copy this = <WS-ID>
```


## Part 5. Auth settings (Project A)

1. **Authentication → URL Configuration.** **Site URL** = WORKSPACE_URL. **Redirect URLs** (add each): WORKSPACE_URL, TEAM_URL, `lexon://app/`, and while testing `http://localhost:5173` and `http://localhost:5174`.
2. **Authentication → Providers → Email**: enabled. **Confirm email**: ON. Email OTP length 6, expiry 3600 seconds is fine.
3. **Authentication → Sign In / Providers → "Allow new users to sign up"**: turn **OFF** after your owner exists. Invited members are created by the server (`team-access`), which works even with sign-up off. (The database trigger independently refuses any email that is not the owner or invited.)
4. **Authentication → Providers → Google** (optional, for Admin "Continue with Google"): paste Google client id/secret; copy Supabase's callback URL into Google Cloud console as an authorized redirect URI.
5. **Authentication → Multi-Factor**: enable TOTP. Admins can then turn on 2FA in Workspace → Settings → Security; the database enforces it on every request.
6. **Authentication → SMTP Settings** (recommended): Resend SMTP (`smtp.resend.com`, port 465, user `resend`, password = your Resend API key, sender on your verified domain). Without this Supabase limits OTP emails to a handful per hour.
7. **Authentication → Rate Limits**: leave defaults.
8. **Realtime**: Project Settings → Realtime → leave "Allow public access" **OFF** (chat/call channels are private and protected by policies installed by the SQL).

- [ ] URL Configuration shows both live URLs.
- [ ] Sign-ups are OFF.
- [ ] Email provider is on.


## Part 6. Environment variables (files to edit)

Full table of every variable is in **Appendix B**. The files you edit now:

| File (path) | What to put | Where the value comes from |
|---|---|---|
| `lexon-workspace/apps/web/.env` (copy from `.env.example`) | `VITE_SUPABASE_URL=https://<A-REF>.supabase.co`
`VITE_SUPABASE_ANON_KEY=<A anon key>`
`VITE_DEMO_MODE=false` | Project A → Settings → API |
| `lexon-team/.env` (copy from `.env.example`) | Same two Project A values | Same place (shared backend) |
| `lexon-workspace/backend/project-a/supabase/.env` (copy from `.env.example`) | `ALLOWED_ORIGINS`, `APP_URL`, `TEAM_APP_URL`, `OAUTH_STATE_SECRET`, `OFFICE_GATEWAY_SECRET`, optional Google/GitHub/Resend | Part 1 secrets + your URLs |
| `lexon-workspace/backend/project-e-automation/supabase/.env` | `STATE_SECRET`, `WORKSPACE_URL`, `META_*`, `GOOGLE_*`, `GEMINI_API_KEY` | Part 1 + Meta / Google / Gemini consoles |
| Office server environment | `OFFICE_SSO_SECRET`, `OFFICE_GATEWAY_SECRET`, `WORKSPACE_FUNCTIONS_URL`, `OFFICE_FRAME_ANCESTORS` | Part 1 + your URLs |

Copy commands (Git Bash / macOS / Linux; on Windows PowerShell use `copy`):

```
cd lexon/lexon-workspace
cp apps/web/.env.example apps/web/.env
cp backend/project-a/supabase/.env.example backend/project-a/supabase/.env
cp backend/project-e-automation/supabase/.env.example backend/project-e-automation/supabase/.env
cd ../lexon-team && cp .env.example .env
```

> **Warning:** `ALLOWED_ORIGINS` must contain the **exact** origin of every site that calls your functions (scheme + host, no path, no trailing slash). A missing origin shows up in the browser as "Could not reach the Edge Function". Local testing needs `http://localhost:5173` (Workspace) and `http://localhost:5174` (Team).


## Part 7. Deploy the Edge Functions


### 7.1 Project A functions

```
supabase login                      # opens a browser; approve
cd lexon/lexon-workspace/backend/project-a
supabase link --project-ref <A-REF>   # enter the Project A database password when asked
supabase secrets set --env-file supabase/.env
supabase functions deploy central-api
supabase functions deploy team-access
supabase functions deploy invite-member
supabase functions deploy ai-keys
supabase functions deploy assistant
supabase functions deploy integrations-oauth
supabase functions deploy office-ai
supabase functions deploy office-sso           # legacy name (optional)
supabase functions deploy project-gateway      # legacy name (optional)
```

`supabase/config.toml` already marks `team-access`, `integrations-oauth` and `office-ai` as public (`verify_jwt = false`) because browsers or other servers call them without a Supabase session. Each of them protects itself (database checks, signed state, or shared secret). Every other function requires a valid user JWT.

**Verify:** Dashboard → Project A → **Edge Functions** lists all functions with a green status. Then:

```
curl -s -X POST https://<A-REF>.supabase.co/functions/v1/team-access \
  -H "apikey: <A-ANON-KEY>" -H "Content-Type: application/json" \
  -d '{"action":"verify","email":"nobody@example.com","code":"WRONG1234"}'
# expect: {"ok":false,"error":"Invalid or expired code"}
```


### 7.2 Project E functions

```
cd lexon/lexon-workspace/backend/project-e-automation
supabase link --project-ref <E-REF>
supabase secrets set --env-file supabase/.env
supabase functions deploy ig-api
supabase functions deploy ig-oauth
supabase functions deploy ig-webhook
supabase functions deploy youtube-oauth
supabase functions deploy youtube-sync
supabase functions deploy youtube-ai
```

**Verify:** `curl "https://<E-REF>.supabase.co/functions/v1/ig-webhook?hub.mode=subscribe&hub.verify_token=<META_VERIFY_TOKEN>&hub.challenge=123"` prints `123`.

> **Note:** Running `supabase link` again switches the CLI to another project. Always `cd` into the right backend folder and `link` before `secrets set` / `deploy`, so secrets never land in the wrong project.


## Part 8. Run locally (before going live)


### 8.1 Workspace

```
cd lexon/lexon-workspace/apps/web
npm install
npm run dev           # opens http://localhost:5173
```

Sign in with OWNER_EMAIL + OWNER_PASSWORD. **Verify:** Home loads without "Could not load data"; Team page opens; Settings shows your profile.


### 8.2 Team

```
cd lexon/lexon-team
npm install
npm run dev -- --port 5174     # opens http://localhost:5174
```


### 8.3 First invitation end to end

1. In Workspace → **Team** → **Add member**. Enter a name and a second email you can read → **Continue**.
2. Choose **Generate a secure code**, expiry 24 hours, 5 attempts → **Create invitation**. Copy the code (shown once).
3. Open `http://localhost:5174`, enter the invited email → Continue → enter the code → you land on Team Home.
4. Back in Workspace → Team → **Invites**: the person shows **Joined**.


### 8.4 Office server locally

```
cd lexon/office
npm install
# Windows PowerShell:  $env:OFFICE_SSO_SECRET="<24+ chars>"; $env:WORKSPACE_FUNCTIONS_URL="https://<A-REF>.supabase.co/functions/v1"; $env:OFFICE_GATEWAY_SECRET="<same as Project A>"; $env:OFFICE_FRAME_ANCESTORS="http://localhost:5173"
# macOS/Linux:        export OFFICE_SSO_SECRET=... (same names)
npm run server        # listens on http://localhost:8787
```


### 8.5 Link Office and Automation inside Workspace

1. Workspace → **Integrations → Lexon Office** → URL `http://localhost:8787` (https in production) and the same `OFFICE_SSO_SECRET` → **Link**. Status becomes connected.
2. **Integrations → YouTube / Instagram** → Project E URL + Project E **service_role** key → **Link** → **Test connection**: every table shows ok.
3. Open **Office** in the sidebar: it loads inside Workspace with no extra login.
4. Grant a Team Member Office access: Team → member → **Access and links** → tick **Open Lexon Office**.


## Part 9. Host the Office server (production)

Office is a Node server (it also serves the 3D web app). It needs a host that keeps a process running and a persistent disk. Pick one:

| Host | How |
|---|---|
| **Docker on any VPS** | `cd office && docker compose up -d --build`. Put env vars in `office/.env`. Put Caddy or Nginx in front for https. |
| **Render.com** (Web Service) | New → Web Service → connect the repo/folder `office`. Build `npm install && npm run build:web`; Start `npm run server`. Add a **Disk** mounted at `/data` and set `OFFICE_DATA=/data`. Add the env vars. |
| **Railway / Fly.io** | Same commands; attach a volume and set `OFFICE_DATA`. |

After deploy, the Office URL (`https://office.yourdomain.com`) is typed into Workspace → Integrations → Lexon Office. **Verify:** opening the URL directly shows the app shell but every data call returns 401 without the SSO token; Workspace → Office loads normally.


## Part 10. GitHub

Use **two repositories**: one for Workspace (folder `lexon-workspace`), one for Team (folder `lexon-team`). The Office server can be a third (or part of Workspace).

```
cd lexon/lexon-workspace
git init && git add . && git commit -m "LEXON Workspace v5"
git branch -M main
git remote add origin https://github.com/<you>/lexon-workspace.git
git push -u origin main

cd ../lexon-team
git init && git add . && git commit -m "LEXON Team v5"
git branch -M main
git remote add origin https://github.com/<you>/lexon-team.git
git push -u origin main
```

Check `.gitignore` is present so `.env` and `node_modules` are not uploaded. **Verify:** on GitHub open the repo → no `.env` file is visible. If a secret was ever pushed, rotate it (create a new one) immediately.


## Part 11. Deploy the websites (Vercel)


### 11.1 Workspace

1. vercel.com → **Add New → Project** → import `lexon-workspace`.
2. **Root Directory:** `apps/web` (click Edit). Framework preset: Vite. Build command `npm run build`, output `dist` (auto-detected).
3. **Environment Variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_DEMO_MODE=false`.
4. Deploy. Settings → **Domains** → add `workspace.yourdomain.com` and create the DNS record Vercel shows (CNAME to `cname.vercel-dns.com`).


### 11.2 Team

1. Import `lexon-team`. Root directory = repository root. Same two env variables.
2. Domains → `team.yourdomain.com`.


### 11.3 After both URLs exist

1. Project A secrets: set `ALLOWED_ORIGINS`, `APP_URL`, `TEAM_APP_URL` to the live URLs → `supabase secrets set --env-file supabase/.env` (from `backend/project-a`) → redeploy not needed.
2. Project A → Auth → URL Configuration: confirm Site URL and Redirect URLs (Part 5).
3. Project E secret `WORKSPACE_URL` = live Workspace URL; Meta/Google consoles use the live function URLs.
4. Office server env `OFFICE_FRAME_ANCESTORS` = live Workspace URL; Integrations → relink Office with the https URL.

> **Note:** Other hosts work too (Netlify, Cloudflare Pages, GitHub Pages). Both apps use hash routing and relative paths, so no rewrite rules are needed. GitHub Pages cannot send security headers; Vercel/Netlify/Cloudflare can (the delivery includes `vercel.json` and `_headers`).


## Part 12. Production verification

1. Open WORKSPACE_URL: padlock (https) shown; sign in as owner.
2. Add member → code → open TEAM_URL on your phone → sign in with email + code. Install the app (Team Deployment guide).
3. Run the full **Appendix C checklist** on the live URLs, especially the lines marked MUST FAIL.
4. DevTools → Network → click the document request → Response Headers contain `X-Frame-Options: DENY`.
5. Project A → Logs → Edge Functions: no red errors after your tests.
6. Supabase → Database → Backups: confirm daily backups; optionally enable Point-in-time recovery (paid).

- [ ] Owner can sign in on the live Workspace.
- [ ] An invited member can sign in on the live Team app and sees only their own data.
- [ ] Office opens only from Workspace and only for permitted people.
- [ ] Automation failure test passed (Workspace/Team keep working).


## Appendix A. How permissions work

| Layer | What it checks | Where it runs |
|---|---|---|
| 1. Supabase Auth | Valid, signed session (JWT). Passwords/OTP/2FA | Supabase Auth |
| 2. Membership | Active row in `workspace_members` for that workspace | Database (RLS helper `is_member`) |
| 3. Role | owner / admin have all permissions; member has only grants | Database (`has_permission`, `is_admin`) |
| 4. Resource | Row belongs to this user: own tasks, own projects, own chats (`can_see_task`, `can_see_project`, `in_conversation`) | Database RLS policies |
| 5. Field guards | Triggers stop members changing protected columns (task title, message ownership, attendance history, ratings) | Database triggers |
| 6. Server APIs | Edge Functions re-check JWT + permission + rate limit before touching Office/Automation/Vault | Edge Functions |
| 7. Realtime | Private channels: only chat members / call parties / the user themself can join | `realtime.messages` policies |
| 8. Storage | Workspace files by workspace membership; chat attachments only inside that conversation | `storage.objects` policies |

The browser only hides buttons. Changing the URL, editing localStorage, or calling the REST API by hand cannot get past layers 1–8.


#### Grantable permissions (Team Member → set by an Admin in the member profile)

| Permission | Effect |
|---|---|
| `office.access` | May open Lexon Office (read-only) |
| `office.edit` | May change things inside Office |
| `tasks.create` / `tasks.edit` | Create tasks / edit any task |
| `projects.manage` | See and manage all projects |
| `files.delete` | Delete files and folders |


## Functions & APIs reference

Every Edge Function in the system. "Deploy where" tells you which Supabase project receives it; run the deploy command from the folder shown. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase into every function automatically: never set them yourself. To get a **USER_ACCESS_TOKEN** for tests: sign in to Workspace in Chrome, press F12 → Application → Local Storage → the key `sb-<A-REF>-auth-token` → copy the `access_token` value (it expires after about 1 hour).


### Project A functions (Workspace + Team)


#### team-access

| Field | Value |
|---|---|
| Purpose | Public door of the Team app. Email → authorization check → invitation code (or emailed code) → session. Never reveals whether an email exists. |
| Secrets / env | `ALLOWED_ORIGINS`. Uses the injected Supabase keys. |
| Deploy where | Supabase **Project A** (Workspace + Team) |
| How to deploy | `cd backend/project-a` then `supabase functions deploy team-access`. It is public by design: `verify_jwt = false` is already set in `config.toml`. |
| Triggered by | Team app Login screen (browser POST). |
| Uses (API / database) | Database RPCs `team_gate`, `invite_verify`, `invite_reopen`, `invite_mark_user`, `auth_user_info`, `rate_limit_hit`; Supabase Auth admin API (createUser, generateLink); Auth OTP email. |
| Input → output | `{action:"start",email}` → `{ok:true}` always. `{action:"verify",email,code}` → `{ok:true,token_hash,email}` on a correct invitation code, otherwise `{ok:false,error:"Invalid or expired code"}` (same text for wrong, expired, locked, unknown). |
| How to test | Wrong code: `curl -s -X POST https://<A-REF>.supabase.co/functions/v1/team-access -H "apikey: <A-ANON-KEY>" -H "Content-Type: application/json" -d '{"action":"verify","email":"nobody@example.com","code":"WRONG1234"}'` → expect `{"ok":false,...}`. Real test: create an invitation in Workspace, then enter email + code in the Team app. |


#### invite-member

| Field | Value |
|---|---|
| Purpose | Admin side of invitations: creates an email-bound invitation with a random or custom code, expiry and attempt limit; revokes invitations. |
| Secrets / env | `TEAM_APP_URL`, `ALLOWED_ORIGINS`; optional `RESEND_API_KEY`, `MAIL_FROM`, `EMAIL_INCLUDE_CODE`. |
| Deploy where | Supabase **Project A** (Workspace + Team) |
| How to deploy | `cd backend/project-a` then `supabase functions deploy invite-member` |
| Triggered by | Workspace → Team → Add member (browser POST with the Admin session). |
| Uses (API / database) | Permission `team.invite` (checked from the caller JWT); RPCs `invite_create`, `invite_revoke`; Resend API (optional); `security_events`. |
| Input → output | `{workspaceId,action:"create",email,fullName,phone?,jobTitle?,department?,codeMode:"random"\|"custom",code?,ttlMinutes,maxAttempts,sendEmail}` → `{ok,code,teamUrl,expiresAt,maxAttempts,emailSent,note}`. The code appears only in this answer. `{action:"revoke",workspaceId,email}` → `{ok:true}`. |
| How to test | `curl -s -X POST https://<A-REF>.supabase.co/functions/v1/invite-member -H "Authorization: Bearer <USER_ACCESS_TOKEN>" -H "apikey: <A-ANON-KEY>" -H "Content-Type: application/json" -d '{"workspaceId":"<WS-ID>","email":"test1@example.com","fullName":"Test One","codeMode":"random","ttlMinutes":60,"maxAttempts":5,"sendEmail":false}'` → expect a JSON with `"code":"XXXX-XXXX"`. Same call with a non-admin token → `403`. |


#### central-api

| Field | Value |
|---|---|
| Purpose | THE single door from Workspace/Team to the other backends (Office, Automation). Checks JWT, active membership and permission, rate-limits, and calls the other backend with credentials kept in Vault. |
| Secrets / env | `ALLOWED_ORIGINS`. Office / Automation credentials are stored in Vault when an Admin links them (not env vars). |
| Deploy where | Supabase **Project A** (Workspace + Team) |
| How to deploy | `cd backend/project-a` then `supabase functions deploy central-api` |
| Triggered by | Workspace pages Office, Automations, Integrations (browser POST). |
| Uses (API / database) | Project A tables `integrations`, `automation_logs`, Vault RPCs; Office server `/api/sso`; Project E REST + functions (service key). |
| Input → output | `{service:"office",workspaceId,action:"status\|token\|link\|unlink"}`, `{service:"automation",workspaceId,project:"youtube\|instagram",action:"ping\|select\|invoke\|pull_events\|link\|unlink"}`, `{service:"health",workspaceId}` → JSON per service. |
| How to test | `curl -s -X POST https://<A-REF>.supabase.co/functions/v1/central-api -H "Authorization: Bearer <USER_ACCESS_TOKEN>" -H "apikey: <A-ANON-KEY>" -H "Content-Type: application/json" -d '{"service":"health","workspaceId":"<WS-ID>"}'` → `{"workspace":{"ok":true},"office":{"linked":...},...}`. With no token → `401`. |


#### office-sso / project-gateway (legacy names)

| Field | Value |
|---|---|
| Purpose | Thin wrappers kept so older builds still work. They call the same code as `central-api`. New code uses `central-api` only. |
| Secrets / env | Same as central-api. |
| Deploy where | Supabase **Project A** (Workspace + Team) |
| How to deploy | `cd backend/project-a` then `supabase functions deploy office-sso` and `cd backend/project-a` then `supabase functions deploy project-gateway` |
| Triggered by | Old Workspace builds only. |
| Uses (API / database) | Same as central-api. |
| Input → output | Same payloads as central-api without the `service` field. |
| How to test | Not needed; test `central-api` instead. You may skip deploying these two on a new install. |


#### office-ai

| Field | Value |
|---|---|
| Purpose | Central AI gateway for Office workers. Office never stores an AI key: its server asks this function, which reads the key from Vault. |
| Secrets / env | `OFFICE_GATEWAY_SECRET` (same value also on the Office server). |
| Deploy where | Supabase **Project A** (Workspace + Team) |
| How to deploy | `cd backend/project-a` then `supabase functions deploy office-ai` (`verify_jwt = false`; it checks the `x-office-secret` header itself). |
| Triggered by | Office server (server-to-server) every few minutes and on AI calls. |
| Uses (API / database) | Vault AI keys (scope office); Gemini / OpenAI / Anthropic / custom endpoints. |
| Input → output | `{action:"keys"}` with header `x-office-secret` → key list for the Office server; chat/tts actions → model output. |
| How to test | `curl -s -X POST https://<A-REF>.supabase.co/functions/v1/office-ai -H "x-office-secret: <OFFICE_GATEWAY_SECRET>" -H "Content-Type: application/json" -d '{"action":"keys"}'` → JSON. Wrong secret → `401/403`. |


#### ai-keys

| Field | Value |
|---|---|
| Purpose | Admin stores / removes AI provider keys (workspace assistant and Office scopes) in Vault; never returned to the browser. |
| Secrets / env | `ALLOWED_ORIGINS`. |
| Deploy where | Supabase **Project A** (Workspace + Team) |
| How to deploy | `cd backend/project-a` then `supabase functions deploy ai-keys` |
| Triggered by | Workspace → Integrations → AI keys. |
| Uses (API / database) | Vault RPCs; `integrations`; permission `integrations.manage`. |
| Input → output | `{workspaceId,action,scope,provider,key,...}` → `{ok:true}` or key metadata (never the key). |
| How to test | Add a key in Integrations; the card shows "connected" and the key text is never visible again. |


#### assistant

| Field | Value |
|---|---|
| Purpose | Workspace assistant (Gemini). Reads context with the CALLER's own session, so it can never reveal what that user may not see. |
| Secrets / env | Gemini key from Vault (added in Integrations). |
| Deploy where | Supabase **Project A** (Workspace + Team) |
| How to deploy | `cd backend/project-a` then `supabase functions deploy assistant` |
| Triggered by | Home → assistant panel. |
| Uses (API / database) | RLS-bound queries as the user; Gemini API. |
| Input → output | `{workspaceId,messages,voice?}` → `{reply}`. |
| How to test | Ask "what are my open tasks?" as a Team Member; only that member's tasks are mentioned. |


#### integrations-oauth

| Field | Value |
|---|---|
| Purpose | OAuth connect/callback/disconnect for Google and GitHub; tokens go straight to Vault. |
| Secrets / env | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `OAUTH_STATE_SECRET`, `APP_URL`. |
| Deploy where | Supabase **Project A** (Workspace + Team) |
| How to deploy | `cd backend/project-a` then `supabase functions deploy integrations-oauth` (`verify_jwt = false`: the provider redirects here without a session; a signed state protects it). |
| Triggered by | Integrations → Connect Google / GitHub; provider redirect. |
| Uses (API / database) | Vault; `integrations`. |
| Input → output | `GET ?code&state` (callback) → redirect to `APP_URL`. |
| How to test | Click Connect Google in Integrations; you return to Workspace with status "connected". |


### Project E functions (Automation)


#### ig-api

| Field | Value |
|---|---|
| Purpose | Instagram automation operations (status, connect URL, list/create automations, media, token refresh). |
| Secrets / env | `STATE_SECRET`, `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `META_GRAPH_VERSION`. |
| Deploy where | Supabase **Project E** (Automation) |
| How to deploy | `cd backend/project-e-automation` then `supabase functions deploy ig-api` |
| Triggered by | Workspace → Automations → Instagram, through `central-api` (service key). |
| Uses (API / database) | Project E `ig_*` tables, Vault, Meta Graph API. |
| Input → output | `{action:"status\|connect_url\|list\|create\|...",...}` → JSON. |
| How to test | Workspace → Integrations → Instagram → Test connection, then Automations → Instagram → Connect. |


#### ig-oauth

| Field | Value |
|---|---|
| Purpose | Meta OAuth redirect target. |
| Secrets / env | `STATE_SECRET`, `META_*`, `WORKSPACE_URL`. |
| Deploy where | Supabase **Project E** (Automation) |
| How to deploy | `cd backend/project-e-automation` then `supabase functions deploy ig-oauth` (public, `verify_jwt = false`). |
| Triggered by | Meta redirect after the owner approves the app. |
| Uses (API / database) | Vault `ig_token_<id>`, `ig_accounts`. |
| Input → output | `GET ?code&state` → redirect to Workspace. |
| How to test | Press Connect Instagram; after approving you land in Workspace with the account shown. |


#### ig-webhook

| Field | Value |
|---|---|
| Purpose | Receives Instagram comment events, matches keywords, replies and sends the DM. Idempotent (unique event key) and HMAC-verified. |
| Secrets / env | `META_APP_SECRET`, `META_VERIFY_TOKEN`. |
| Deploy where | Supabase **Project E** (Automation) |
| How to deploy | `cd backend/project-e-automation` then `supabase functions deploy ig-webhook` (public, `verify_jwt = false`). |
| Triggered by | Meta webhook (comments). |
| Uses (API / database) | `ig_automations`, `ig_keywords`, `ig_events`, `ig_stats`, Graph API; run is recorded in `automation_runs`. |
| Input → output | Meta POST with `X-Hub-Signature-256` → `{ok:true}`. Bad signature → `401`. |
| How to test | Verify URL: `curl "https://<E-REF>.supabase.co/functions/v1/ig-webhook?hub.mode=subscribe&hub.verify_token=<META_VERIFY_TOKEN>&hub.challenge=123"` → `123`. Wrong token → `403`. |


#### youtube-oauth

| Field | Value |
|---|---|
| Purpose | Google consent for the YouTube account (start / disconnect / callback). |
| Secrets / env | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `STATE_SECRET`, `WORKSPACE_URL`. |
| Deploy where | Supabase **Project E** (Automation) |
| How to deploy | `cd backend/project-e-automation` then `supabase functions deploy youtube-oauth` (public GET callback; POST path checks the service key). |
| Triggered by | Automations → YouTube → Connect; Google redirect. |
| Uses (API / database) | Vault, `youtube_connection`. |
| Input → output | POST `{action:"start"}` → consent URL; GET callback → redirect. |
| How to test | Connect Google in the YouTube page; status becomes connected. |


#### youtube-sync

| Field | Value |
|---|---|
| Purpose | Pulls channel + videos + analytics into Project E. |
| Secrets / env | Uses Vault tokens (`GOOGLE_*`). |
| Deploy where | Supabase **Project E** (Automation) |
| How to deploy | `cd backend/project-e-automation` then `supabase functions deploy youtube-sync` |
| Triggered by | Sync button (via `central-api`) or the optional daily cron in `3_AUTOMATION.sql`. |
| Uses (API / database) | YouTube Data + Analytics APIs; `youtube_videos`, `youtube_channel_snapshots`, `automation_runs`. |
| Input → output | `{actor?}` + service key → `{videos,notes}`. |
| How to test | Press Sync in the YouTube page; videos appear. Check `select * from automation_runs order by started_at desc limit 5;` in Project E. |


#### youtube-ai

| Field | Value |
|---|---|
| Purpose | AI Studio: ideas, hooks, titles, scripts grounded in the synced channel data (Gemini). |
| Secrets / env | `GEMINI_API_KEY` (optional `GEMINI_MODEL`). |
| Deploy where | Supabase **Project E** (Automation) |
| How to deploy | `cd backend/project-e-automation` then `supabase functions deploy youtube-ai` |
| Triggered by | AI Studio buttons via `central-api`. |
| Uses (API / database) | `youtube_videos`, `youtube_ai_outputs`, Gemini API. |
| Input → output | `{kind,input}` → `{output}`. |
| How to test | Open AI Studio → Ideas; text appears. Without a synced channel you get a clear "Sync your channel first" message. |


### Office server (not an Edge Function)

Lexon Office is its own Node server (`office/server/index.mjs`) with its own database. It exposes `POST /api/sso` (called only by `central-api` with `OFFICE_SSO_SECRET`), and `/api/*` endpoints that require the short-lived token minted from that call. Deploy: see Setup Guide Part 9 (Docker / Render / Railway / VPS). Test: `curl -s -X POST https://<OFFICE-URL>/api/sso -H "Content-Type: application/json" -d '{"secret":"wrong"}'` → `401`; a request to `/api/state` with no token → `401`.


## Environment-variable guide

Where each value lives, what to put there and where to get it. **Public** values may be shipped to browsers. **Secret** values must never be committed to GitHub or put in a `.env` that is built into a website.


### 1. Workspace web  —  `lexon-workspace/apps/web/.env`

| Variable | Value / where to get it | Public? |
|---|---|---|
| `VITE_SUPABASE_URL` | Project A → Project Settings → API → **Project URL** (`https://<A-REF>.supabase.co`) | Public |
| `VITE_SUPABASE_ANON_KEY` | Project A → Settings → API → **anon public** key | Public (RLS protects data) |
| `VITE_DEMO_MODE` | `false` always in production | Public |
| `VITE_TURN_URL/USER/PASS` | Optional TURN server for calls on strict networks | Public |


### 2. Team web  —  `lexon-team/.env`

| Variable | Value / where to get it | Public? |
|---|---|---|
| `VITE_SUPABASE_URL` | **Same** Project A URL as Workspace (one shared backend) | Public |
| `VITE_SUPABASE_ANON_KEY` | **Same** Project A anon key | Public |


### 3. Project A Edge Function secrets  —  `backend/project-a/supabase/.env`

Copy `.env.example` to `.env`, fill it, then run (from `backend/project-a`): `supabase secrets set --env-file supabase/.env`. Never commit `.env`.

| Variable | Value / where to get it |
|---|---|
| `ALLOWED_ORIGINS` | Comma list, no spaces, no trailing slash: your Workspace URL, Team URL, `lexon://app` (desktop), plus `http://localhost:5173,http://localhost:5174` while testing. Browsers from any other origin are refused by CORS. |
| `APP_URL` | Workspace live URL (OAuth redirects return here) |
| `TEAM_APP_URL` | Team live URL (used in the invitation email and in the invite screen) |
| `OAUTH_STATE_SECRET` | Random 32+ chars. Generate: `openssl rand -hex 32` |
| `OFFICE_GATEWAY_SECRET` | Random 32+ chars (`openssl rand -hex 32`). **Same value** goes into the Office server env |
| `GOOGLE_CLIENT_ID/SECRET` | Google Cloud Console → APIs & Services → Credentials → OAuth client (Web). Redirect URI: `https://<A-REF>.supabase.co/functions/v1/integrations-oauth` |
| `GITHUB_CLIENT_ID/SECRET` | GitHub → Settings → Developer settings → OAuth Apps (optional). Callback: same `integrations-oauth` URL |
| `RESEND_API_KEY`, `MAIL_FROM` | Optional. resend.com → API Keys; `MAIL_FROM` must be on a domain verified in Resend |
| `EMAIL_INCLUDE_CODE` | `false` (recommended): email has only the link, you share the code separately |


### 4. Project E (Automation) secrets  —  `backend/project-e-automation/supabase/.env`

From `backend/project-e-automation` run `supabase secrets set --env-file supabase/.env` (linked to Project E).

| Variable | Value / where to get it |
|---|---|
| `STATE_SECRET` | Random 32+ chars (`openssl rand -hex 32`) |
| `WORKSPACE_URL` | Workspace live URL |
| `META_APP_ID`, `META_APP_SECRET` | developers.facebook.com → your app → Settings → Basic (Instagram API with Instagram Login) |
| `META_VERIFY_TOKEN` | Any long random string; you also type it in Meta's webhook setup |
| `META_REDIRECT_URI` | `https://<E-REF>.supabase.co/functions/v1/ig-oauth` |
| `META_GRAPH_VERSION` | `v21.0` |
| `GOOGLE_CLIENT_ID/SECRET` | Google OAuth client for YouTube. Redirect URI: `https://<E-REF>.supabase.co/functions/v1/youtube-oauth` |
| `GEMINI_API_KEY` | aistudio.google.com → Get API key (for AI Studio) |


### 5. Office server env (hosting provider settings or `office/.env`)

| Variable | Value / where to get it |
|---|---|
| `OFFICE_SSO_SECRET` | Random 24+ chars you invent (`openssl rand -hex 24`). You type the **same** value in Workspace → Integrations → Lexon Office. The server refuses to start without it |
| `OFFICE_GATEWAY_SECRET` | Same value as in Project A secrets |
| `WORKSPACE_FUNCTIONS_URL` | `https://<A-REF>.supabase.co/functions/v1` |
| `OFFICE_FRAME_ANCESTORS` | Your Workspace origin, e.g. `https://workspace.example.com` (lets Office appear inside Workspace and nowhere else) |
| `PORT`, `OFFICE_DATA` | Optional (default 8787 and `./data`). Persist `OFFICE_DATA` on a disk/volume |
| `NEXT_PUBLIC_OFFICE_SUPABASE_URL`, `NEXT_PUBLIC_OFFICE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Only if you use Project B as the Office database mirror: Project B URL, anon key and service_role key (server only) |


### 6. GitHub Actions secrets (Settings → Secrets and variables → Actions)

| Repository | Secret | Value |
|---|---|---|
| Workspace | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Project A public values |
| Team | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Same Project A public values |

> **Warning:** The **service_role** key bypasses every security rule. It exists only inside Supabase (Edge Functions get it automatically), inside the Office server if you use Project B, and in Workspace → Integrations when you link Project E (it is stored in Vault, never in the browser). Never put it in a `VITE_` variable.


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


## Appendix D. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Could not reach the Edge Function" | Origin not in `ALLOWED_ORIGINS`, or function not deployed | Add the exact origin; `supabase secrets set --env-file supabase/.env`; deploy the function |
| Team login: "That code is not valid" for a fresh code | Wrong email spelling, expired, locked (too many wrong tries) or code already used | Team → Invites: status tells which. Press **New code** |
| Returning member gets no email code | Supabase default email limit, or SMTP not set | Configure SMTP (Part 5, step 6) |
| "Email not authorized for this workspace" | Email is not owner and has no invitation | Invite it from Workspace → Team |
| Home: "Could not load data" | Migration 0009 / 0012 not applied | Run the Upgrade SQL (4A) |
| Office shows "not linked" | Integrations → Office not linked | Link with Office URL + `OFFICE_SSO_SECRET` |
| Office: "Office rejected the SSO secret" | Secrets differ | Make `OFFICE_SSO_SECRET` identical on the server and in the link form |
| Office: "You do not have access" | Member lacks `office.access` | Grant it in Team → member → Access and links |
| Chat does not update live | Realtime policies missing | Re-run section E of `4A_UPGRADE_workspace_team.sql`; confirm Realtime is enabled |
| Instagram webhook 403 | Verify token mismatch | Use the same `META_VERIFY_TOKEN` in Meta and Project E secrets |
| Blank page after deploy | Missing `VITE_` variables at build time | Set them in Vercel and redeploy |
