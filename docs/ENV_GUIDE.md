# Environment variables




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
