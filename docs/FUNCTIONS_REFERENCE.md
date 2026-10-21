# Edge functions reference




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
