# One Supabase for YouTube + Instagram (project E)
SQL: `supabase/automation/LEXON_CD_automation.sql` (one file, re-runnable). RLS on, no client policies: only service_role (Edge Functions and Workspace's project-gateway) can touch data. Tokens live in Vault.
Functions (deploy to E, folder `supabase/automation/functions`): `ig-api` (private), `ig-oauth` + `ig-webhook` (public callbacks), `youtube-oauth`, `youtube-sync`, `youtube-ai`. Secrets: see `supabase/automation/.env.example`.
Link in Workspace > Integrations > Lexon Workspace > Automation backend with E's URL + service_role key.
Deploy: `mkdir e && cp -r supabase/automation e/supabase && cd e && supabase functions deploy --project-ref <E-ref> && supabase secrets set --env-file supabase/.env`.
Meta app: webhook callback `https://<E-ref>.supabase.co/functions/v1/ig-webhook`, verify token = META_VERIFY_TOKEN, field `comments`; OAuth redirect `.../functions/v1/ig-oauth`.
Google Cloud: OAuth redirect `https://<E-ref>.supabase.co/functions/v1/youtube-oauth`; enable YouTube Data API v3 and YouTube Analytics API.
Keep Instagram tokens alive: schedule (Dashboard > Integrations > Cron) a weekly POST to `ig-api` with `{"action":"refresh_tokens"}` and `Authorization: Bearer <service_role>`.
