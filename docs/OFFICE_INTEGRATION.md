# Lexon Office inside Workspace (v4)
- Office is a Node server (folder `office/`): web app + API + SQLite. It has **no login, password or user list**.
- Workspace page **Office** opens it in an iframe. The `office-sso` Edge Function checks the Workspace session, asks Office for a 12-hour token (`POST {office}/api/sso`, secret in Vault) and the iframe opens with `?officeToken=`. Workspace role maps to Office role: owner -> owner, admin/manager/member -> admin, agent -> viewer.
- AI keys: added ONLY in Workspace > Integrations > Lexon Office > "AI models and APIs". The Office server pulls them every 5 minutes from `office-ai` (`action: keys`, header `x-office-secret`) into its internal pool. Office has no AI/API screen any more.
## Setup
1. Office server env: `OFFICE_SSO_SECRET` (24+ chars, required), `OFFICE_GATEWAY_SECRET` (= project A secret), `WORKSPACE_FUNCTIONS_URL=https://<A-ref>.supabase.co/functions/v1`, `OFFICE_FRAME_ANCESTORS=<Workspace web origin>`. Serve over HTTPS.
2. Project A: `supabase secrets set OFFICE_GATEWAY_SECRET=...`, `supabase functions deploy office-sso office-ai`.
3. Workspace > Integrations > Lexon Office > Link Office: Office URL + the SSO secret.
Optional `database/LEXON_B_office.sql` = a Supabase mirror; Office works without it (SQLite).
