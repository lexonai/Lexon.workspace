# LEXON: Setup Guide (Hinglish)

Final architecture:
- **Project A**: Workspace + Team (EK shared Supabase). SQL: `LEXON_A_workspace_team.sql` (migrations 0001 se 0008)
- **Project B**: Lexon Office (alag Supabase, virtual environment). SQL: `LEXON_B_office.sql`
- **Project C**: Instagram/Lexon Automation (alag Supabase). SQL: `LEXON_C_instagram.sql`
- **Project D**: YouTube Automation (alag Supabase). SQL: `LEXON_D_youtube.sql` + functions `lexon-backends/youtube`

Roles (Workspace): sirf **Admin** aur **Team Member**. Manager role nahi hai. Permissions editor nahi hai: Admin ko sab access, Team Member ko fixed access.

## 1. Project A
1. supabase.com par naya project (Mumbai). DB password save karo.
2. Settings, API: Project URL aur anon key copy (public). service_role key kahin paste mat karo.
3. SQL Editor: `LEXON_A_workspace_team.sql` paste, Run (ek baar). Pehle 0001-0007 chala chuke ho to sirf `migrations/0008_single_admin_v2.sql` chalao.
4. Run ke baad "schema cache" error aaye to SQL Editor me `notify pgrst, 'reload schema';` chalao (0008 me already hai).
5. Authentication:
   - Providers, Google: ON. Google Cloud me OAuth client banao, redirect URI = Supabase callback URL.
   - URL Configuration: Site URL = Workspace URL. Redirect URLs: Workspace URL, Team URL, `http://localhost:5173/**`, `lexon://app/**` (desktop), `lexon-team://app/**`.
   - Email Templates (Magic Link): `{{ .Token }}` zaroor rakho (Team login ka 6-digit code).
   - **SMTP**: Authentication, SMTP Settings me apna SMTP (Resend/Brevo/Gmail SMTP) lagao. Default Supabase email bahut limited hai (kuch hi mail/ghanta). Phir bhi invite ke baad app ek one-time code + link dikhata hai jo aap seedha share kar sakte ho.
   - Multi-Factor: TOTP ON.
   - Rate Limits dekho.
6. Database, Extensions: `pg_cron` ON karo (7-din cleanup roz raat chalane ke liye). Na karo to bhi app roz ek baar Admin ke khulne par cleanup chala deta hai.
7. **Sabse pehle khud Workspace me Google se login karo**: aap Owner/Admin ban jaoge. Uske baad koi bhi unapproved Google account reject hota hai.

## 2. Frontend env
`apps/web/.env` aur `apps/team/.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (project A). Optional `VITE_TURN_*`. `.env` kabhi commit nahi.

## 3. Project A Edge Functions
```
supabase login
supabase link --project-ref <A-ref>
supabase functions deploy integrations-oauth --no-verify-jwt
supabase functions deploy project-gateway
supabase functions deploy invite-member
supabase functions deploy ai-keys
supabase functions deploy assistant
cp supabase/.env.example supabase/.env   # values bharo
supabase secrets set --env-file supabase/.env
```
Secrets: ALLOWED_ORIGINS (Workspace URL, Team URL, `lexon://app`), APP_URL, TEAM_APP_URL, OAUTH_STATE_SECRET, GOOGLE_CLIENT_ID/SECRET, GITHUB_* (optional).
Function errors ("Failed to send a request", "not deployed", CORS) aksar: function deploy nahi hui ya ALLOWED_ORIGINS me URL nahi hai.

## 4. Assistant (Gemini)
1. aistudio.google.com/apikey se free Gemini key lo.
2. Workspace, Integrations, **Lexon Workspace**, "Assistant (Google Gemini)", Add API key. Key Vault me encrypted jaati hai.
3. Home par "Open Assistant" dabao. Naam pencil se badal sakte ho. Voice input Chrome/Edge me chalta hai.

## 5. Invitations (Invite, Receive, Login, Join Team)
1. Team, **Invite**: naam, email, phone.
2. App invitation email bhejta hai aur ek **one-time code + link** dikhata hai (copy karke share kar sakte ho).
3. Member Lexon Team app kholta hai, email daalta hai, code daalta hai, Team me aa jata hai.
4. Team, Invites tab: Invited / Joined / Pending / Not registered. Pending = account bana par abhi sign-in nahi hua. Resend/new code aur Revoke wahin hai.

## 6. Project D: YouTube
1. Naya Supabase project. `LEXON_D_youtube.sql` Run. Authentication me signups OFF.
2. `lexon-backends/youtube` me: `supabase link --project-ref <D-ref>`; `supabase functions deploy youtube-oauth --no-verify-jwt`, `youtube-sync --no-verify-jwt`, `youtube-ai --no-verify-jwt`.
3. D ke secrets: WORKSPACE_URL, OAUTH_STATE_SECRET, GOOGLE_CLIENT_ID/SECRET, ANTHROPIC_API_KEY, AI_MODEL (optional).
4. Google Cloud: YouTube Data API v3 + YouTube Analytics API ENABLE; redirect URI `https://<D-ref>.supabase.co/functions/v1/youtube-oauth`.
5. Workspace, Integrations, Lexon Workspace, YouTube Automation, **Link project** (D ka URL + service_role key), phir "Test connection".
6. Automations, YouTube: Connect Google account, Sync now. Execution history Automations page par dikhti hai.

## 7. Project B (Office) aur C (Instagram)
- B: `LEXON_B_office.sql` Run, signups OFF (pehla account admin). Integrations, **Lexon Office** me link karo. Office alag virtual environment hai: Workspace ke real team members us me nahi jaate.
- Office AI/API keys: Integrations, Lexon Office, "AI models and APIs": 27 free/trial providers ki list ya Custom API.
- C: `LEXON_C_instagram.sql` (baseline). Link: Integrations, Lexon Workspace, Instagram Automation.

## 8. 2FA (authenticator)
Settings, Security, Enable 2FA: QR ko Google Authenticator/Authy se scan karo, 6-digit code daalo. Uske baad har login par code lagega aur database bhi bina 2FA wale token ko data nahi deta. Recovery codes Supabase me nahi hote: 2FA ON karne se pehle authenticator app ka backup rakho. Login history retention (7 se 30 din) wahin set hoti hai.

## 9. Data retention
Attendance aur Activity (aur automation history) 7 din baad apne aap delete. Login history 7 se 30 din (setting). Read notifications 30 din.

## 10. Deploy (Web/PWA) + Desktop
Workspace aur Team alag repo/URL (`.github/workflows/deploy.yml`, secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Better headers ke liye Cloudflare Pages/Netlify (`public/_headers`). Desktop: `apps/desktop/README.md`.

## 11. Admin access
Settings, Admin access (sirf owner): nayi Gmail ID approve karo. Wo Workspace login page par Google se sign in karke Admin ban jata hai. Unapproved Google account ko login page par "Access denied" dikhta hai.

## 12. Final QA checklist
- [ ] Login (approved Gmail), unapproved Gmail reject hota hai
- [ ] Home: assistant khulta hai, naam badalta hai, Gemini jawab deta hai
- [ ] Header: sirf bell + profile menu (search bar nahi); bell me sab activity, "New" se announcement
- [ ] Team: Invite, status counts, resend/revoke; admin Team list me nahi; department nahi
- [ ] Invite flow: Invite, mail/code, Team login, Team list me dikha
- [ ] Messages: DM/group me search, naye members dikhte hain; call history
- [ ] Projects: create (name/type/URL/repo optional/description), status Active/Inactive/Coming Soon, details me Links + Description
- [ ] Tasks: All Tasks / My Tasks
- [ ] Files: explorer (tree, double-click folder, eye = detail view, download/rename/move/delete)
- [ ] Analytics: charts load; Admin team count me nahi
- [ ] Automations: Open par error nahi; Test connection; Execution history (Instagram / YouTube alag)
- [ ] Integrations: pehle 2 cards; Office me AI list; Custom API
- [ ] Settings: 2FA enable/disable; retention; Admin access
- [ ] Mobile: menu drawer, bell panel, tables scroll

## 13. Login: Google + password (Workspace aur Team dono)
- Dono apps: **Google** (sirf approved Gmail) aur **email + password (8+ characters)**. Team me pehli baar/forgot password ke liye **email code** bhi.
- Password set: login ke baad Settings, Security, "Password login". Password Supabase Auth me hash hota hai, SQL/table me nahi.
- Supabase: Authentication, Email ON, **Minimum password length = 8**, Google ON, Redirect URLs me `lexon://app/**` aur `lexon-team://app/**`.
- Poori guide: `docs/LEXON_Workspace_Team_Guide.pdf`. Ek hi SQL: `supabase/LEXON_A_workspace_team.sql`. Health check: `supabase/DIAGNOSE.sql`.
